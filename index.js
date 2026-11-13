/**
 * Host half of the plugin dashboard.
 *
 * It owns every operation and serves one small same-origin JSON API that the
 * Client panel calls. Keeping the operations here (instead of in the Client)
 * means the UI and any future agent tool share a single implementation, and it
 * avoids depending on the Client-side Remote access policy for `pluginManager`.
 *
 *   GET  /api/dsh-plugin-dashboard/            alias of /ping, so a bare URL answers
 *   GET  /api/dsh-plugin-dashboard/ping        liveness, touches no service
 *   GET  /api/dsh-plugin-dashboard/state       every plugin row + the roster
 *   GET  /api/dsh-plugin-dashboard/detail      ?entryId=  one row + its package.json
 *   GET  /api/dsh-plugin-dashboard/updates     check every exact-pinned dep against its registry
 *   POST /api/dsh-plugin-dashboard/updates     { names: [...] }  install those exact versions
 *   GET  /api/dsh-plugin-dashboard/extras      deps that are not exact versions (link / github / tarball / file)
 *   POST /api/dsh-plugin-dashboard/extras      { name, action: 'repull' | 'pin' | 'file-upgrade' }
 *   GET  /api/dsh-plugin-dashboard/updatelog   the last update attempt, as written to disk
 *   GET  /api/dsh-plugin-dashboard/registries  the registry the host resolves + whether GITHUB_TOKEN is set
 *   GET  /api/dsh-plugin-dashboard/removable   bundles the host will let us uninstall
 *   GET  /api/dsh-plugin-dashboard/inspect     ?spec=  preview only, installs nothing
 *   GET  /api/dsh-plugin-dashboard/fileplan    ?name=  what a local `file:` dep would upgrade to
 *   POST /api/dsh-plugin-dashboard/install     { spec }  through pluginManager.installBundle
 *   POST /api/dsh-plugin-dashboard/uninstall   { name }  through pluginManager.removeBundle
 *   POST /api/dsh-plugin-dashboard/plugin      { entryId, enabled?, auto? }
 *   POST /api/dsh-plugin-dashboard/bulk        { enabled, scope?, save?, cancel? }
 *   POST /api/dsh-plugin-dashboard/roster      { mode: 'group', scope, auto }
 *   GET  /api/dsh-plugin-dashboard/summary     read-only rows for scripts and future agent tools
 *
 * Bodies must be `application/json` (anything else answers 415), a known path
 * with the wrong verb answers 405, and only one write operation runs at a time
 * (install / uninstall / update / extras / bulk share one mutex), because two
 * pnpm runs editing the same package.json + pnpm-lock.yaml can interleave into
 * a profile that installs nothing.
 *
 * Every request must pass two gates before any of the above runs: the Host
 * header has to name a loopback interface (127.0.0.1 / localhost / ::1), and
 * if an Origin header is present it has to resolve to the same loopback set.
 * Together they stop a malicious web page in the user's browser from driving
 * the API — the web server itself only listens on loopback, so the only
 * attack surface left is a same-machine browser tab.
 *
 * A bulk action always skips this plugin's own row: disabling it would tear
 * down the very route answering the request. Core components are NOT skipped as
 * a group — only 16 of the 204 @deepseek-ai/* rows are genuinely read-only, so
 * `manageable` is the real gate, and the roster plus `scope` decide the rest.
 *
 * Enable/disable normally goes through the shipped `pluginManager` service. The
 * one deliberate exception is `bulk` with `save: true`, which writes the
 * profile's cordis.patch.yml itself — atomically, comments preserved, and only
 * overrides this plugin created are ever removed — so the user can switch
 * plugins off and restart once instead of waiting for a reload per plugin.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROUTE_PREFIX = '/api/dsh-plugin-dashboard'
const require = createRequire(import.meta.url)
const VERSION = '1.0.0'
const SELF = 'dsh-plugin-dashboard'

/** Known routes and their verbs, so a wrong verb answers 405 instead of 404. */
const ROUTES = {
  '/': ['GET'],
  '/ping': ['GET'],
  '/state': ['GET'],
  '/detail': ['GET'],
  '/updates': ['GET', 'POST'],
  '/extras': ['GET', 'POST'],
  '/updatelog': ['GET'],
  '/registries': ['GET'],
  '/removable': ['GET'],
  '/inspect': ['GET'],
  '/fileplan': ['GET'],
  '/install': ['POST'],
  '/uninstall': ['POST'],
  '/plugin': ['POST'],
  '/bulk': ['POST'],
  '/roster': ['POST'],
  // 只读摘要，给脚本和未来的 agent tool 用。写操作刻意不暴露在这里——
  // 让一个语言模型替人点「确认卸载」不是个好主意，那种通道要单独的权限设计。
  '/summary': ['GET'],
}

export const name = 'plugin-dashboard'
export const inject = ['webServer', 'pluginManager']

/** @type {{version: number, seeded: boolean, auto: string[], created: string[]} | null} */
let rosterState = null
let storageMode = 'file'

function stateDir() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  const home = configured.length > 0 ? configured : join(homedir(), '.dsh')
  return join(home, 'plugin-dashboard')
}

function stateFile() {
  return join(stateDir(), 'state.json')
}

function emptyRoster() {
  return { version: 1, seeded: false, auto: [], created: [] }
}

function loadRoster() {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.auto)) {
      return {
        state: {
          version: 1,
          seeded: parsed.seeded === true,
          auto: parsed.auto.filter(entry => typeof entry === 'string'),
          // Overrides this panel wrote into the profile patch. Only those may
          // be removed again; a pre-existing override belongs to the user.
          created: Array.isArray(parsed.created)
            ? parsed.created.filter(entry => typeof entry === 'string')
            : [],
        },
        storage: 'file',
      }
    }
  } catch (error) {
    // ENOENT means "first run"; anything else means unreadable or corrupt.
    // Both fall back to defaults, and the next write repairs the file.
    void error
  }
  return { state: emptyRoster(), storage: 'file' }
}

function roster() {
  if (rosterState === null) {
    const loaded = loadRoster()
    rosterState = loaded.state
    storageMode = loaded.storage
  }
  return rosterState
}

function persistRoster() {
  try {
    const file = stateFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(rosterState, null, 2)}\n`, 'utf8')
    storageMode = 'file'
  } catch {
    // A read-only home still works for this session; the roster just lives in
    // memory and the client shows that in the footer.
    storageMode = 'memory'
  }
}

/** A readable label for a module name, shortening `file:///...` install specs. */
function displayName(moduleName) {
  if (!moduleName.startsWith('file://')) return moduleName
  const parts = moduleName.split('/').filter(Boolean)
  const file = parts[parts.length - 1] ?? moduleName
  const folder = parts[parts.length - 2] ?? ''
  return folder.length > 0 ? `${folder}/${file}` : file
}

/** The profile directory that owns `node_modules`, derived from a linked row. */
function profileDir(rows) {
  for (const row of rows) {
    if (!row.moduleName.startsWith('file://')) continue
    let dir = dirname(fileURLToPath(row.moduleName))
    for (let depth = 0; depth < 12; depth += 1) {
      if (basename(dir) === 'node_modules') return dirname(dir)
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

function firstString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Longest subtitle we keep; the row already ellipsizes, this keeps the payload small. */
const BRIEF_MAX = 60

/** Short Chinese name for each installed plugin; keep these to a few characters. */
const ZH_ALIAS = {
  '@deepseek-ai/dsh-tool-subagent': '子智能体',
  'dsh-whale-widget': '余额挂件',
  'dsh-pocket': '手机访问',
  'dsh-m': '插件市场',
  dshmarket: '插件商城',
  '@tencent-connect/dsh-qqbot': 'QQ 机器人',
  '@linxin666/dsh-client-ui-git-graph': '提交图谱',
  '@linxin666/dsh-client-ui-task-board': '任务看板',
  'billion-context': '上下文压缩',
  'billion-context/dsh-compaction-gate': '压缩门控',
  'ds-bot/web-search': '机器人联网',
  '@vectorize-io/hindsight-coding-agents/dsh': '记忆编码智能体',
  'dsh-blender-mcp-bridge': 'Blender 桥接',
  'dsh-blender-plugin': 'Blender 直连',
  'dsh-univer-office': '办公套件',
  '@changfenhuang/dsh-genui': '内联 UI',
  'dsh-ops': 'Bash / Rust 工具',
  '@liustack/modlens': '视觉读图',
  '@michengai/dsh-archive-manager': '会话归档',
  '@michengai/dsh-skills-manager': '技能管理',
  '@nanmicoder/dsh-agent-teams': '多智能体',
  'dsh-our-free-model': '免费模型',
  'dsh-plugin-dashboard': '插件管理台',
  'deepseek-harness/index.js': '命令安全网',
  'clearai-dsh': '智能体预设',
  'ds-bot': '机器人团队',
  'dsh-better-sidebar': '右侧边栏',
  'dsh-context': '上下文工具',
  'dsh-cost-meter': '费用计量',
  'dsh-ego-browser': 'Agent 浏览器',
  'dsh-free-search': '免费搜索',
  'dsh-pause-resume': '暂停 / 恢复',
  'dsh-unlag': '热重载',
  'lunheng-article-pipeline': '长文流水线',
}

/**
 * Short Chinese label for the harness' own components. The core plugins have
 * no manifest description, so without this the row would fall back to the raw
 * entry id. Matching is by longest prefix so a family like
 * `dsh-client-ui-settings-*` gets one label per family member.
 */
const CORE_ALIAS = [
  ['dsh-client-ui-settings-account', '账号设置'],
  ['dsh-client-ui-settings-agent-loop', '智能体循环设置'],
  ['dsh-client-ui-settings-general', '通用设置'],
  ['dsh-client-ui-settings-models', '模型设置'],
  ['dsh-client-ui-settings-plugin-inventory', '插件清单'],
  ['dsh-client-ui-settings-plugins', '插件设置'],
  ['dsh-client-ui-settings-session-log', '会话日志设置'],
  ['dsh-client-ui-settings-shell', '外壳设置'],
  ['dsh-client-ui-settings-subagent', '子智能体设置'],
  ['dsh-client-ui-settings-web-search', '联网搜索设置'],
  ['dsh-client-ui-agent-preset', '预设编辑器'],
  ['dsh-client-ui-approval', '审批界面'],
  ['dsh-client-ui-attachment', '附件'],
  ['dsh-client-ui-brand-official', '官方品牌'],
  ['dsh-client-ui-chat', '对话界面'],
  ['dsh-client-ui-commands', '命令面板'],
  ['dsh-client-ui-context-menu', '右键菜单'],
  ['dsh-client-ui-conversation', '会话列表'],
  ['dsh-client-ui-cordis', '插件内核'],
  ['dsh-client-ui-deliverables', '交付物'],
  ['dsh-client-ui-directory-picker-native', '目录选择'],
  ['dsh-client-ui-entry-customization', '入口定制'],
  ['dsh-client-ui-file-actions', '文件操作'],
  ['dsh-client-ui-file-drag', '拖拽文件'],
  ['dsh-client-ui-goal', '目标界面'],
  ['dsh-client-ui-input-trigger', '输入触发'],
  ['dsh-client-ui-jobs', '任务界面'],
  ['dsh-client-ui-layout', '布局'],
  ['dsh-client-ui-message-feedback', '消息反馈'],
  ['dsh-client-ui-model-selection', '模型选择'],
  ['dsh-client-ui-open-in-app', '应用内打开'],
  ['dsh-client-ui-permission-presets', '权限预设'],
  ['dsh-client-ui-plan', '计划界面'],
  ['dsh-client-ui-plugin-manager', '插件管理'],
  ['dsh-client-ui-reference', '引用'],
  ['dsh-client-ui-renderer', '渲染器'],
  ['dsh-client-ui-schedule', '定时任务界面'],
  ['dsh-client-ui-secret-mask', '密钥遮罩'],
  ['dsh-client-ui-session', '会话界面'],
  ['dsh-client-ui-shortcuts', '快捷键'],
  ['dsh-client-ui-sidebar-browser', '浏览器侧栏'],
  ['dsh-client-ui-sidebar-documentpreview', '文档预览'],
  ['dsh-client-ui-sidebar-files', '文件侧栏'],
  ['dsh-client-ui-sidebar-right', '右侧栏'],
  ['dsh-client-ui-sidebar-terminal', '终端侧栏'],
  ['dsh-client-ui-skill', '技能界面'],
  ['dsh-client-ui-subagent', '子智能体界面'],
  ['dsh-client-ui-theme', '主题'],
  ['dsh-client-ui-tool', '工具界面'],
  ['dsh-client-ui-trajectory', '执行轨迹'],
  ['dsh-client-ui-user-questions', '用户提问'],
  ['dsh-client-ui-workflow-run', '工作流运行'],
  ['dsh-client-ui-workspace', '工作区界面'],
  ['dsh-client-ui-sidebar', '左侧栏'],
  ['dsh-client-connection', '客户端连接'],
  ['dsh-client-file-upload', '文件上传'],
  ['dsh-client-hmr', '前端热更新'],
  ['dsh-client-locale', '多语言'],
  ['dsh-client-modules', '前端模块'],
  ['dsh-client-product-analytics', '使用统计'],
  ['dsh-client-resources', '前端资源'],
  ['dsh-client-shortcuts', '快捷键'],
  ['dsh-api-account-controller', '账号接口'],
  ['dsh-api-gateway', 'API 网关'],
  ['dsh-api-job-controller', '任务接口'],
  ['dsh-api-remote-access', '远程访问接口'],
  ['dsh-api-remotes', '远程连接'],
  ['dsh-api-session-controller', '会话接口'],
  ['dsh-api-settings-controller', '设置接口'],
  ['dsh-api-terminal-controller', '终端接口'],
  ['dsh-api-workspace-controller', '工作区接口'],
  ['dsh-api-workspace-files', '工作区文件接口'],
  ['dsh-agent-default-model', '默认模型'],
  ['dsh-agent-instructions', '智能体指令'],
  ['dsh-agent-loop', '智能体循环'],
  ['dsh-agent-preset-registry', '预设注册表'],
  ['dsh-agent-preset', '智能体预设'],
  ['dsh-agent', '智能体'],
  ['dsh-attachment-local', '本地附件'],
  ['dsh-authorization', '授权'],
  ['dsh-bash-sandbox', 'Bash 沙箱'],
  ['dsh-compaction-basic', '基础压缩'],
  ['dsh-compaction-image-offload', '图片外置'],
  ['dsh-compaction-tool-result-pruner', '工具结果裁剪'],
  ['dsh-command-compact', '压缩命令'],
  ['dsh-command-feedback', '反馈命令'],
  ['dsh-command-goal', '目标命令'],
  ['dsh-commands', '命令集'],
  ['dsh-config-editor', '配置编辑器'],
  ['dsh-cordis-client-runner', '前端插件运行器'],
  ['dsh-cordis-host-runner', '宿主插件运行器'],
  ['dsh-credentials-local', '本地凭据'],
  ['dsh-deepseek-account-platform', 'DeepSeek 账号平台'],
  ['dsh-deepseek-llm-api-extensions', 'DeepSeek 接口扩展'],
  ['dsh-deliverable-file-references', '交付文件引用'],
  ['dsh-file-reference-local', '本地文件引用'],
  ['dsh-fs-observation-policy', '文件观察策略'],
  ['dsh-fs-sandbox', '文件沙箱'],
  ['dsh-goal-round-driver', '目标轮次驱动'],
  ['dsh-goal', '目标'],
  ['dsh-harness-dev-context', '开发上下文'],
  ['dsh-hmr', '热重载'],
  ['dsh-host-directory-picker-auto', '自动目录选择'],
  ['dsh-host-directory-picker-native', '原生目录选择'],
  ['dsh-host-open-in-app', '应用内打开'],
  ['dsh-host-plugin-inventory', '插件清单'],
  ['dsh-host-product-telemetry-otel', '遥测'],
  ['dsh-host-webserver', '内嵌服务器'],
  ['dsh-jobs-local', '本地任务'],
  ['dsh-llm-deepseek-account', 'DeepSeek 账号模型'],
  ['dsh-llm-deepseek-api-key', 'DeepSeek 密钥模型'],
  ['dsh-llm', '模型接入'],
  ['dsh-otel', '链路追踪'],
  ['dsh-permission-presets', '权限预设'],
  ['dsh-plan-mode', '计划模式'],
  ['dsh-plugin-manager', '插件管理'],
  ['dsh-plugin-package-inventory-deepseek', '插件包清单'],
  ['dsh-ptc-runtime-node', 'PTC 运行时'],
  ['dsh-pwsh-sandbox', 'PowerShell 沙箱'],
  ['dsh-repeat-tool-reminder', '重复工具提醒'],
  ['dsh-sandbox-local', '本地沙箱'],
  ['dsh-sandbox-policy', '沙箱策略'],
  ['dsh-schedule', '定时任务'],
  ['dsh-session-checkpoint-policy', '会话检查点'],
  ['dsh-session-log-deepseek', '会话日志'],
  ['dsh-session-log-export', '会话日志导出'],
  ['dsh-session-persistence-jsonl', '会话持久化'],
  ['dsh-session-projection-cache', '会话投影缓存'],
  ['dsh-session-projection', '会话投影'],
  ['dsh-session-query-sqlite', '会话检索'],
  ['dsh-session-reference', '会话引用'],
  ['dsh-session-stats', '会话统计'],
  ['dsh-session-telemetry-otel', '会话遥测'],
  ['dsh-session-title-first-prompt-llm', '会话标题'],
  ['dsh-session-title', '会话标题'],
  ['dsh-session-turn-outline', '回合大纲'],
  ['dsh-session', '会话'],
  ['dsh-settings', '设置'],
  ['dsh-shell-env', '环境变量'],
  ['dsh-skill-filesystem', '文件系统技能'],
  ['dsh-skill', '技能'],
  ['dsh-spill-local', '本地溢出存储'],
  ['dsh-spill-policy', '溢出策略'],
  ['dsh-storage-domain', '存储域'],
  ['dsh-storage-json', 'JSON 存储'],
  ['dsh-storage', '存储'],
  ['dsh-subagent-fork-in-process', '子智能体内联分叉'],
  ['dsh-subagent-spawn-in-process', '子智能体内联启动'],
  ['dsh-subagent', '子智能体'],
  ['dsh-subprocess-local', '本地子进程'],
  ['dsh-system-prompt', '系统提示词'],
  ['dsh-token-meter', 'Token 计量'],
  ['dsh-tool-bash', 'Bash 工具'],
  ['dsh-tool-call-timeout-policy', '工具超时策略'],
  ['dsh-tool-cordis', '插件工具'],
  ['dsh-tool-executor-native', '原生执行器'],
  ['dsh-tool-executor-ptc', 'PTC 执行器'],
  ['dsh-tool-fs-search', '文件搜索工具'],
  ['dsh-tool-fs', '文件工具'],
  ['dsh-tool-goal', '目标工具'],
  ['dsh-tool-jobs', '任务工具'],
  ['dsh-tool-pwsh', 'PowerShell 工具'],
  ['dsh-tool-skill', '技能工具'],
  ['dsh-tool-subagent-control', '子智能体控制'],
  ['dsh-tool-subagent', '子智能体工具'],
  ['dsh-tool-todo', '待办工具'],
  ['dsh-tool-web', '联网工具'],
  ['dsh-tool-workflow', '工作流工具'],
  ['dsh-tool-working-directory', '工作目录工具'],
  ['dsh-tools', '工具集'],
  ['dsh-typert-loader', '类型加载'],
  ['dsh-typert-registry', '类型注册表'],
  ['dsh-user-approval', '用户审批'],
  ['dsh-user-questions', '用户提问'],
  ['dsh-web-app', '网页应用'],
  ['dsh-web-deepseek-api', 'DeepSeek 网页接口'],
  ['dsh-web-fetch-http', '网页抓取'],
  ['dsh-web-search-deepseek', '联网搜索'],
  ['dsh-web', '网页端'],
  ['dsh-workflow-ptc', '工作流引擎'],
  ['dsh-working-directory', '工作目录'],
  ['dsh-workspace-changes', '工作区改动'],
  ['dsh-workspace', '工作区'],
  ['cordis-plugin-timer', '定时器'],
  ['dsh-mcp-resources', 'MCP 资源'],
  ['dsh-message-feedback', '消息反馈'],
  ['dsh-message-quotes', '消息引用'],
  ['dsh-office-to-pdf', 'Office 转 PDF'],
  ['dsh-client-ui-settings', '设置界面'],
]

/**
 * Match a module name against the alias tables. Exact hits win; otherwise the
 * longest matching prefix is used, so `dsh-client-ui-settings-plugins`
 * resolves through the prefix rules rather than a generic fallback.
 */
function aliasFor(moduleName) {
  const direct = ZH_ALIAS[moduleName]
  if (direct !== undefined) return direct
  const bare = moduleName.replace(/^@deepseek-ai\//, '')
  for (const [prefix, label] of CORE_ALIAS) {
    if (bare === prefix) return label
  }
  for (const [prefix, label] of CORE_ALIAS) {
    if (bare.startsWith(prefix + '-') || bare.startsWith(prefix + '/')) return label
  }
  return null
}

/** Collapse whitespace, keep the first clause, then cap the length. */
function brief(value) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length === 0) return null
  const cut = text.split(/[。；;：:—|]/)[0].trim()
  const head = cut.length >= 10 ? cut : text
  return head.length <= BRIEF_MAX ? head : head.slice(0, BRIEF_MAX - 1) + '…'
}

/** A plugin's own Chinese description, read from its locale directory. */
function zhDescription(moduleName, found) {
  return cached(`zh:${moduleName}`, () => {
    let text = null
    if (found !== null) {
      for (const file of ['zh.json', 'zh-CN.json', 'zh_CN.json']) {
        const candidate = join(found.dir, 'locale', file)
        if (!existsSync(candidate)) continue
        try {
          const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
          const meta = parsed === null || typeof parsed !== 'object' ? null : parsed.meta
          const value = meta === null || typeof meta !== 'object' ? null : firstString(meta.description)
          if (value !== null) {
            text = value
            break
          }
        } catch {
          /* a broken locale file is not worth failing the row for */
        }
      }
    }
    return text
  })
}

/** Row subtitle: hand-written Chinese, else the plugin's Chinese locale, else its own text. */
function describe(moduleName, name, found) {
  const alias = aliasFor(moduleName) ?? aliasFor(name)
  if (alias !== undefined && alias !== null) return alias
  const zh = zhDescription(moduleName, found)
  if (zh !== null) return brief(zh)
  if (found === null) return null
  const raw = firstString(found.manifest.description)
  return raw === null ? null : brief(raw)
}

/** Locate the package.json that owns a module, walking up a few levels. */
function readManifest(moduleName, base) {
  if (!moduleName.startsWith('file://')) {
    if (base === null) return null
    // A bare spec must stay inside node_modules; anything else is not a
    // package this profile could have installed.
    if (
      moduleName.length === 0 ||
      moduleName.includes('..') ||
      moduleName.startsWith('/') ||
      moduleName.startsWith('\\') ||
      moduleName.includes('\\')
    ) {
      return null
    }
    const dir = join(base, 'node_modules', moduleName)
    const candidate = join(dir, 'package.json')
    if (!existsSync(candidate)) return null
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { dir, manifest: parsed }
      }
    } catch {
      return null
    }
    return null
  }

  let dir
  try {
    dir = dirname(fileURLToPath(moduleName))
  } catch {
    return null
  }

  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { dir, manifest: parsed }
        }
      } catch {
        return null
      }
    }
    if (basename(dir) === 'node_modules') break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Small TTL cache: manifests and locale files must not be cached forever, or an
 * upgraded plugin keeps reporting its old version and description until the
 * host restarts.
 */
const CACHE_TTL = 30_000
const cache = new Map()

function cached(key, read) {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit !== undefined && now - hit.at < CACHE_TTL) return hit.value
  const value = read()
  cache.set(key, { value, at: now })
  return value
}

/** Manifests are read once per module name per TTL; `/state` touches every row. */
function manifestFor(moduleName, base) {
  return cached(`m:${moduleName}`, () => {
    try {
      return readManifest(moduleName, base)
    } catch {
      return null
    }
  })
}

function linksOf(manifest) {
  const repository = manifest.repository
  const raw =
    typeof repository === 'string'
      ? repository
      : repository !== null && typeof repository === 'object'
        ? firstString(repository.url)
        : null
  const homepage = firstString(manifest.homepage)

  let github = null
  for (const candidate of [raw, homepage]) {
    if (candidate === null) continue
    const cleaned = candidate
      .replace(/^git\+/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/\.git$/, '')
    const match = /github\.com[/:]([^/]+)\/([^/#]+)/.exec(cleaned)
    if (match !== null) {
      github = `https://github.com/${match[1]}/${match[2]}`
      break
    }
  }
  return { github, homepage: github === null ? homepage : null }
}

/** Everything the panel's expanded row shows, beyond what `/state` carries. */
async function detailFor(ctx, entryId) {
  const rows = await readRows(ctx)
  const row = rows.find(item => item.entryId === entryId)
  if (row === undefined) throw new Error(`unknown entry id: ${entryId}`)

  const found = manifestFor(row.moduleName, profileDir(rows))
  const manifest = found === null ? null : found.manifest
  const name = manifest === null ? null : firstString(manifest.name)
  const links = manifest === null ? { github: null, homepage: null } : linksOf(manifest)
  const rawAuthor = manifest === null ? null : manifest.author
  const dependencies =
    manifest === null || manifest.dependencies === null || typeof manifest.dependencies !== 'object'
      ? []
      : Object.keys(manifest.dependencies)

  return {
    row,
    package: {
      name,
      version: manifest === null ? null : firstString(manifest.version),
      description: manifest === null ? null : firstString(manifest.description),
      license: manifest === null ? null : firstString(manifest.license),
      author:
        firstString(rawAuthor) ??
        (rawAuthor !== null && typeof rawAuthor === 'object' ? firstString(rawAuthor.name) : null),
      dir: found === null ? null : found.dir,
      github: links.github,
      homepage: links.homepage,
      npmUrl: name === null ? null : `https://www.npmjs.com/package/${name}`,
      dependencies,
    },
  }
}

/** True for this plugin's own row, whether it is mounted bare or by file spec. */
function isSelfRow(moduleName, patchId) {
  if (patchId === SELF) return true
  if (moduleName === SELF) return true
  return moduleName.includes(`/${SELF}/`) || moduleName.endsWith(`/${SELF}`)
}

function toRow(entry, base) {
  const moduleName = typeof entry.moduleName === 'string' ? entry.moduleName : String(entry.moduleName ?? '')
  const patchId = typeof entry.patchId === 'string' ? entry.patchId : null
  const found = manifestFor(moduleName, base)
  const name = displayName(moduleName)
  return {
    entryId: String(entry.entryId),
    patchId,
    moduleName,
    name: displayName(moduleName),
    version: found === null ? null : firstString(found.manifest.version),
    description: describe(moduleName, name, found),
    enabled: entry.enabled === true,
    phase: entry.fiberPhase === undefined ? null : entry.fiberPhase,
    readOnlyReason: typeof entry.readOnlyReason === 'string' ? entry.readOnlyReason : null,
    diagnostic: typeof entry.diagnostic === 'string' ? entry.diagnostic : null,
    official: moduleName.startsWith('@deepseek-ai/'),
    manageable: patchId !== null,
    self: isSelfRow(moduleName, patchId),
  }
}

/**
 * First-run default: the plugins this profile installed, not the shipped core.
 * Core rows stay 手动 so a one-click action can never strip the harness down.
 */
function installedRoster(rows) {
  return rows
    .filter(row => row.manageable && !row.official && !row.self)
    .map(row => row.patchId)
}

async function readRows(ctx) {
  const entries = await ctx.pluginManager.listPlugins()
  if (!Array.isArray(entries)) throw new Error('pluginManager.listPlugins() did not return a list')
  const named = entries.map(entry => ({
    moduleName: typeof entry.moduleName === 'string' ? entry.moduleName : '',
  }))
  const base = profileDir(named)
  return entries.map(entry => toRow(entry, base))
}

async function snapshot(ctx) {
  const rows = await readRows(ctx)
  const state = roster()

  if (!state.seeded) {
    state.auto = installedRoster(rows)
    state.seeded = true
    persistRoster()
  }

  // Drop roster entries whose row disappeared, so the count always matches.
  const known = new Set(rows.filter(row => row.manageable).map(row => row.patchId))
  const pruned = state.auto.filter(id => known.has(id))
  if (pruned.length !== state.auto.length) {
    state.auto = pruned
    persistRoster()
  }

  return {
    ok: true,
    version: VERSION,
    rows,
    roster: state.auto.slice(),
    storage: storageMode,
    statePath: stateFile(),
    bulk: bulkSnapshot(),
  }
}

function describeResult(result) {
  if (result === null || typeof result !== 'object') return 'no result'
  const parts = []
  if (result.error !== undefined && result.error !== null) {
    const message = result.error.message ?? result.error.code
    if (message !== undefined) parts.push(String(message))
  }
  if (Array.isArray(result.warnings) && result.warnings.length > 0) parts.push(result.warnings.join('; '))
  if (result.restartReason !== undefined) parts.push(`restart required (${String(result.restartReason)})`)
  if (parts.length === 0) parts.push(String(result.application ?? 'unknown'))
  return parts.join(' | ')
}

async function setOne(ctx, entryId, enabled, known) {
  const row = known ?? (await readRows(ctx)).find(candidate => candidate.entryId === entryId)
  if (row === undefined) return { entryId, ok: false, message: 'plugin row not found' }
  // Disabling the panel from inside its own request kills the route that is
  // still answering it, so the request would hang until the browser gives up.
  if (row.self) {
    return { entryId, ok: false, message: 'the dashboard refuses to switch itself off from here' }
  }
  if (!row.manageable) {
    return { entryId, ok: false, message: `row is read-only (${row.readOnlyReason ?? 'unaddressable'})` }
  }

  let result
  try {
    result = await ctx.pluginManager.setPluginEnabled(row.entryId, enabled)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { entryId, ok: false, message }
  }

  const application = result === null || typeof result !== 'object' ? undefined : result.application
  if (application === 'failed' || application === 'cancelled') {
    return { entryId, ok: false, application, message: describeResult(result) }
  }
  return {
    entryId,
    ok: true,
    application,
    // `overridden` and `restart-required` are saved-but-not-live outcomes.
    notice:
      application === 'applied' ? undefined : describeResult(result),
  }
}

async function actPlugin(ctx, body) {
  const entryId = typeof body.entryId === 'string' ? body.entryId : ''
  if (entryId.length === 0) throw new Error('entryId is required')

  const rows = await readRows(ctx)
  const row = rows.find(candidate => candidate.entryId === entryId)
  if (row === undefined) return { ok: false, result: { entryId, ok: false, message: 'plugin row not found' } }

  let result
  if (typeof body.enabled === 'boolean') {
    result = await setOne(ctx, entryId, body.enabled, row)
  }

  if (typeof body.auto === 'boolean') {
    const state = roster()
    if (row.patchId === null) {
      result = { entryId, ok: false, message: 'row cannot join the 自动 roster (read-only)' }
    } else if (body.auto) {
      if (!state.auto.includes(row.patchId)) state.auto.push(row.patchId)
      persistRoster()
      result = result ?? { entryId, ok: true, application: 'applied' }
    } else {
      state.auto = state.auto.filter(id => id !== row.patchId)
      persistRoster()
      result = result ?? { entryId, ok: true, application: 'applied' }
    }
  }

  const settled = result ?? { entryId, ok: true }
  // `applied` means the change is live, so the touched row can be patched in
  // place. Anything else (read-only, failed, restart-required) needs the full
  // state so the panel never shows a switch that does not match reality.
  const applied =
    settled.ok === true && (settled.application === undefined || settled.application === 'applied')
  if (!applied) {
    return { ...(await snapshot(ctx)), result: settled }
  }

  const patched = { ...row }
  if (typeof body.enabled === 'boolean') {
    patched.enabled = body.enabled
    patched.phase = body.enabled ? 'active' : null
  }
  return { ok: true, patch: true, row: patched, roster: roster().auto.slice(), result: settled }
}

/** The profile's patch document plus the live entries it addresses. */
async function patchContext(ctx) {
  const profile = ctx.get ? ctx.get('profileContext') : undefined
  if (profile === undefined || typeof profile.patchPath !== 'string') {
    throw new Error('profileContext is unavailable; cannot write the profile patch')
  }
  const resolved = require.resolve('yaml', { paths: [join(profile.dir, 'node_modules')] })
  const yaml = await import(pathToFileURL(resolved).href)
  return { profile, yaml }
}

/**
 * Write `disabled` for several rows in one pass and never reload anything.
 *
 * `pluginManager.setPluginEnabled` reconciles the whole profile on every call,
 * which is what makes a bulk toggle take seconds per row. For the "turn things
 * off, update them, restart" workflow the reload is wasted work: the caller
 * restarts anyway, so persisting the intent is enough.
 *
 * The current state is read from the patch document, never from the runtime
 * rows: a save-mode run does not change what is running, so comparing against
 * `row.enabled` would treat an already-saved toggle as "nothing to do" and drop
 * the entry it should restore.
 */
async function writeEnabledBatch(ctx, rows, enabled) {
  const { profile, yaml } = await patchContext(ctx)
  const { parseDocument } = yaml
  const filename = profile.patchPath

  let text
  try {
    text = readFileSync(filename, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    text = '[]\n'
  }

  const document = parseDocument(text, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
  })
  const broken = document.errors[0]
  if (broken !== undefined) throw new Error(`the profile patch is not valid YAML: ${broken.message}`)
  if (!Array.isArray(document.contents?.items)) {
    throw new Error('the profile patch is not a YAML sequence')
  }

  const items = document.contents.items
  const want = enabled !== true
  const changed = []
  let unchanged = 0
  // Overrides this panel created. Only those are removed again on enable, so a
  // pre-existing `disabled: false` in the user's profile is never touched.
  const created = new Set(roster().created)

  /** The index of the last id-matching override, the way the shipped writer finds it. */
  const locate = (id, name) => {
    for (let cursor = items.length - 1; cursor >= 0; cursor -= 1) {
      const item = items[cursor]
      if (item === null || typeof item.get !== 'function') continue
      if (item.get('insert') !== undefined) continue
      if (item.get('id') !== id) continue
      const declared = item.get('name')
      if (declared !== undefined && declared !== null && declared !== name) continue
      return cursor
    }
    return -1
  }

  for (const row of rows) {
    const index = locate(row.patchId, row.moduleName)
    if (index === -1) {
      // No override yet, so the composition's value is whatever is running.
      // Only append when that differs from what was asked for.
      if (row.enabled === enabled) {
        unchanged += 1
      } else {
        document.add({ id: row.patchId, disabled: want })
        created.add(row.patchId)
        changed.push(row.patchId)
      }
      continue
    }
    // An override decides on its own; `undefined` means it inherits, so it must
    // be written even when the inherited value happens to match.
    const current = document.getIn([index, 'disabled'])
    if (current !== undefined && current === want) {
      unchanged += 1
      continue
    }
    if (enabled === true && current === true) {
      if (created.has(row.patchId)) {
        // The override exists only because this panel disabled the plugin, so
        // re-enabling makes it redundant. Drop the entry again so the user's
        // profile does not collect `disabled: false` litter.
        document.delete(index)
        created.delete(row.patchId)
      } else {
        // A pre-existing override belongs to the user: keep the entry and
        // write the value back explicitly, so the file ends up exactly as it
        // started instead of losing the key.
        document.setIn([index, 'disabled'], false)
      }
      changed.push(row.patchId)
      continue
    }
    document.setIn([index, 'disabled'], want)
    changed.push(row.patchId)
  }

  if (changed.length === 0) return { changed, unchanged, patchPath: filename }

  const temp = `${filename}.tmp-${process.pid}`
  writeFileSync(temp, String(document), { mode: 0o600 })
  renameSync(temp, filename)
  // Remember which overrides this panel owns, so a later enable can remove
  // exactly those and nothing else.
  const state = roster()
  state.created = [...created]
  persistRoster()
  return { changed, unchanged, patchPath: filename }
}
function inScope(row, scope) {
  if (!row.manageable) return false
  if (scope === 'failed') return row.phase === 'failed'
  // The panel's pages leave failed rows out of 已安装插件 and 核心组件, so the
  // server side must exclude them too or a bulk action hits more rows than the
  // button's own count promises.
  if (scope === 'installed') return !row.official && row.phase !== 'failed'
  if (scope === 'core') return row.official && row.phase !== 'failed'
  return false
}

/**
 * A running bulk job. `setPluginEnabled` costs a file lock, an HMR exclusive
 * lock, two full listPlugins() calls and one reconcile each, so N rows always
 * costs N of those no matter how the calls are ordered. The panel therefore
 * accepts a job, answers at once, and reports progress while it runs.
 */
let bulkJob = null

/**
 * One profile-mutating operation at a time.
 *
 * The host gives plugins no lock of their own, and two installs / uninstalls /
 * updates racing on the same package.json + pnpm-lock.yaml can interleave their
 * writes and leave a profile nobody can install into. A bulk run already
 * serializes itself through `bulkJob`; this flag extends the same rule to
 * install / uninstall / update / extras, and to a bulk run starting while one
 * of them is still in flight.
 */
let mutationBusy = false

const BUSY_MESSAGE = '已经有一个安装 / 卸载 / 更新 / 批量操作在进行中，等它结束再试'

function beginMutation() {
  if (mutationBusy) return false
  if (bulkJob !== null && bulkJob.running) return false
  mutationBusy = true
  return true
}

function endMutation() {
  mutationBusy = false
}

function bulkSnapshot() {
  if (bulkJob === null) return null
  return {
    running: bulkJob.running,
    enabled: bulkJob.enabled,
    scope: bulkJob.scope,
    finished: bulkJob.finished,
    total: bulkJob.total,
    failed: bulkJob.failed,
    unchanged: bulkJob.unchanged,
    guarded: bulkJob.guarded,
    current: bulkJob.current,
    cancelled: bulkJob.cancelled === true,
  }
}

/** Ask the running bulk job to stop after the row it is on. */
function cancelBulk() {
  if (bulkJob === null || !bulkJob.running) return { ok: false, message: 'no bulk run is in progress' }
  bulkJob.cancelled = true
  return { ok: true, cancelled: true, bulk: bulkSnapshot() }
}

async function actBulk(ctx, enabled, scope, mode) {
  if (bulkJob !== null && bulkJob.running) {
    return { ok: false, message: 'a bulk run is already in progress' }
  }
  if (mutationBusy) {
    return { ok: false, message: '一个安装或卸载还在进行中，等它结束再操作' }
  }

  const rows = await readRows(ctx)
  const state = roster()
  const auto = new Set(state.auto)
  const scoped = typeof scope === 'string' && scope.length > 0

  // A row only follows 一键 when it is on the 自动 roster. The scope narrows
  // that set to the visible page; it never widens it. Marking a row 手动 has to
  // mean the bulk buttons leave it alone.
  const wanted = rows.filter(
    row =>
      row.manageable &&
      row.patchId !== null &&
      auto.has(row.patchId) &&
      (!scoped || inScope(row, scope)),
  )

  // Hard guard, independent of the roster. The panel's own row is the one case
  // that must never be touched: disabling it inside this very request kills the
  // route that is still answering it.
  const guards = []
  const targets = []
  let unchanged = 0
  for (const row of wanted) {
    if (row.self) {
      guards.push({ entryId: row.entryId, name: row.name, reason: 'self' })
    } else if (mode !== 'save' && row.enabled === enabled) {
      // Already in the target state: a full unload/load cycle for nothing.
      // `save` must NOT take this shortcut: it compares against the FILE, and
      // a row that was save-disabled earlier still runs enabled, so the
      // runtime state would mask a pending `disabled: true` override forever.
      unchanged += 1
    } else {
      targets.push(row)
    }
  }

  // `save` writes the patch and reloads nothing. It is the right mode for the
  // "stop everything, update it, restart" workflow, which restarts anyway.
  if (mode === 'save') {
    const written = await writeEnabledBatch(ctx, targets, enabled)
    return {
      ok: true,
      saved: true,
      total: written.changed.length,
      unchanged: unchanged + written.unchanged,
      guarded: guards.length,
      patchPath: written.patchPath,
      bulk: null,
    }
  }

  bulkJob = {
    running: true,
    enabled,
    scope: scoped ? scope : 'auto',
    finished: 0,
    total: targets.length,
    failed: 0,
    unchanged,
    guarded: guards.length,
    current: null,
    cancelled: false,
  }

  // Detached on purpose: the HTTP response returns immediately and the client
  // polls /state, which carries `bulk`. It keeps a local reference because a
  // later run replaces `bulkJob` while this one may still be finishing.
  const job = bulkJob
  void (async () => {
    for (const row of targets) {
      if (job.cancelled) break
      job.current = row.name
      const outcome = await setOne(ctx, row.entryId, enabled)
      if (outcome.ok !== true) job.failed += 1
      job.finished += 1
    }
  })()
    .catch(() => {
      job.failed += 1
    })
    .finally(() => {
      job.current = null
      job.running = false
    })

  return {
    ok: true,
    accepted: true,
    total: targets.length,
    unchanged,
    guarded: guards.length,
    bulk: bulkSnapshot(),
  }
}

async function actRoster(ctx, mode, scope, auto) {
  const rows = await readRows(ctx)
  const state = roster()

  if (mode !== 'group') throw new Error(`unknown roster mode: ${mode}`)

  const wanted = new Set(
    rows
      .filter(row => inScope(row, scope))
      .map(row => row.patchId),
  )
  if (auto === true) {
    for (const id of wanted) if (!state.auto.includes(id)) state.auto.push(id)
  } else {
    state.auto = state.auto.filter(id => !wanted.has(id))
  }
  state.seeded = true
  persistRoster()
  return await snapshot(ctx)
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

const MAX_BODY = 1 << 20

/** An input problem the caller caused; answers its status instead of a 500. */
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text.length === 0) return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'request body is not valid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'request body must be a JSON object')
  }
  return parsed
}

/* ------------------------------ update checking ------------------------------ */

/** Packages the runtime itself provides; those are never fetched from npm. */
const HOST_SCOPE = /^@deepseek-ai\//
/** A version pinned exactly — the profile's own convention for dsh bundles. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const REGISTRY_TIMEOUT = 12000
const UPDATE_CONCURRENCY = 6

/** The profile's package.json and dependencies, or null when unreadable. */
function profileFacts(ctx) {
  try {
    const profile = ctx.get === undefined ? undefined : ctx.get('profileContext')
    if (profile === undefined || profile === null || typeof profile.dir !== 'string') return null
    const file = join(profile.dir, 'package.json')
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return null
    const deps = parsed.dependencies
    if (deps === null || typeof deps !== 'object') return null
    return { dir: profile.dir, file, deps, parsed }
  } catch {
    return null
  }
}

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(value).trim())
  if (match === null) return null
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? null : match[4].split('.'),
  }
}

/** Standard semver ordering; an unparsable side compares as equal. */
function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  if (a === null || b === null) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1
  }
  if (a.pre === null && b.pre === null) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  const length = Math.max(a.pre.length, b.pre.length)
  for (let index = 0; index < length; index += 1) {
    const x = a.pre[index]
    const y = b.pre[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
      continue
    }
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * The registry answer for a package's `latest` dist-tag. The profile's own
 * registry is asked first — a user behind a mirror should not be forced through
 * npmjs.org — and npmjs.org is the fallback, because a mirror that lags or
 * lacks a package must not read as "no update".
 */
async function npmLatest(name, base) {
  const encoded = name.startsWith('@') ? name.replace('/', '%2f') : name
  const configured = typeof base === 'string' && base.trim().length > 0 ? base.trim() : null
  const roots = []
  if (configured !== null) roots.push(configured.replace(/\/+$/, '') + '/')
  if (roots[0] !== 'https://registry.npmjs.org/') roots.push('https://registry.npmjs.org/')
  const errors = []
  for (const root of roots) {
    try {
      const response = await fetch(`${root}${encoded}/latest`, {
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT),
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`registry answered ${response.status}`)
      const body = await response.json()
      if (body === null || typeof body !== 'object' || typeof body.version !== 'string') {
        throw new Error('registry returned no version')
      }
      return body.version
    } catch (error) {
      errors.push(`${root} ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(errors.join('; '))
}

/** Dependencies this panel is willing to touch: not host-provided, pinned exactly. */
function eligibleDeps(facts) {
  const out = []
  for (const [name, spec] of Object.entries(facts.deps)) {
    if (HOST_SCOPE.test(name)) continue
    if (typeof spec !== 'string') continue
    const pinned = spec.trim()
    if (!EXACT_VERSION.test(pinned)) continue
    out.push({ name, current: pinned })
  }
  return out
}

async function checkUpdates(ctx) {
  const facts = profileFacts(ctx)
  if (facts === null) return { ok: false, message: 'profile package.json is unavailable' }
  const base = await configuredRegistry(ctx)
  const targets = eligibleDeps(facts)
  const rows = new Array(targets.length)
  let cursor = 0
  async function worker() {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= targets.length) return
      const target = targets[index]
      try {
        const latest = await npmLatest(target.name, base)
        rows[index] = {
          name: target.name,
          current: target.current,
          latest,
          hasUpdate: compareVersions(latest, target.current) > 0,
          error: null,
        }
      } catch (error) {
        rows[index] = {
          name: target.name,
          current: target.current,
          latest: null,
          hasUpdate: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }
  const workers = []
  for (let index = 0; index < Math.min(UPDATE_CONCURRENCY, targets.length); index += 1) workers.push(worker())
  await Promise.all(workers)
  const list = rows.filter(row => row !== undefined).sort((a, b) => a.name.localeCompare(b.name))
  return {
    ok: true,
    dir: facts.dir,
    registry: base,
    checked: list.length,
    updates: list.filter(row => row.hasUpdate).length,
    rows: list,
  }
}

/**
 * Hold every live Agent at the host's public maintenance boundary.
 *
 * Replacing files under a running Agent mixes old in-memory modules with new
 * ones on disk, which is exactly how a marketplace update corrupts a profile.
 * `runMaintenance` claims a truly idle Agent synchronously and latches later
 * inbox work until the returned promise settles. A synchronous throw means an
 * Agent is mid-turn right now; the caller reports that instead of racing it.
 */
async function holdAgents(ctx) {
  const service = ctx.get === undefined ? undefined : ctx.get('agents')
  const listed = service !== undefined && service !== null && typeof service.list === 'function' ? service.list() : []
  const handles = []
  for (const agent of Array.isArray(listed) ? listed : []) {
    if (agent === null || typeof agent !== 'object') continue
    if (typeof agent.id !== 'string' || agent.id === '') continue
    if (typeof agent.whenIdle !== 'function' || typeof agent.runMaintenance !== 'function') continue
    handles.push(agent)
  }
  const held = []
  const releaseAll = () => {
    while (held.length > 0) {
      const entry = held.pop()
      entry.controller.abort()
      entry.release()
    }
  }
  try {
    for (const handle of handles) {
      let release = () => {}
      const gate = new Promise(resolve => {
        release = resolve
      })
      const controller = new AbortController()
      let running
      try {
        running = handle.runMaintenance(signal => {
          if (signal.aborted) {
            release()
            return gate
          }
          signal.addEventListener('abort', () => release(), { once: true })
          return gate
        })
      } catch (error) {
        release()
        throw error
      }
      if (running !== undefined && running !== null && typeof running.catch === 'function') {
        void running.catch(() => release())
      }
      held.push({ controller, release })
    }
  } catch (error) {
    releaseAll()
    throw error
  }
  return releaseAll
}

/** The pnpm entry point installed next to the host, or null. */
function pnpmScript() {
  const candidates = []
  const appData = typeof process.env.APPDATA === 'string' ? process.env.APPDATA.trim() : ''
  if (appData !== '') candidates.push(join(appData, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'))
  const localData = typeof process.env.LOCALAPPDATA === 'string' ? process.env.LOCALAPPDATA.trim() : ''
  if (localData !== '') candidates.push(join(localData, 'pnpm', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Pick the interpreter that runs pnpm.
 *
 * On Windows the host's own `process.execPath` is an Electron GUI binary. A GUI
 * process owns no console at all, so `windowsHide` has nothing to suppress: the
 * direct child gets no console, and every console descendant pnpm starts (git,
 * tar, build scripts) finds no console to inherit, so Windows allocates a fresh
 * one and a terminal window pops up on the user's desktop.
 *
 * Spawning a real console node instead gives the direct child a *hidden*
 * console, which all of its descendants inherit. Nothing is ever shown, and a
 * real node is also the interpreter pnpm actually expects.
 */
let nodeRuntimeCache = null


function nodeRuntime() {
  if (nodeRuntimeCache !== null) return nodeRuntimeCache
  const execPath = typeof process.execPath === 'string' ? process.execPath : ''
  nodeRuntimeCache = execPath
  if (process.platform !== 'win32') return nodeRuntimeCache
  const raw = typeof process.env.PATH === 'string' ? process.env.PATH : ''
  const seen = new Set()
  for (const entry of raw.split(';')) {
    const dir = entry.trim().replace(/^"|"$/g, '')
    if (dir === '') continue
    const key = dir.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const candidate = join(dir, 'node.exe')
    if (!existsSync(candidate)) continue
    if (execPath !== '' && candidate.toLowerCase() === execPath.toLowerCase()) continue
    nodeRuntimeCache = candidate
    break
  }
  return nodeRuntimeCache
}

/** Run pnpm headlessly: no shell, no console, and no window the user can see. */
const PNPM_TIMEOUT = 10 * 60 * 1000

/**
 * Kill a spawned process and everything it spawned.
 *
 * `child.kill()` on Windows only terminates the direct child. pnpm forks
 * downloaders and build scripts, and those orphans keep writing into
 * node_modules after pnpm itself is gone — which is the one way a timed-out
 * update can still corrupt the profile. So kill the whole tree.
 */
function killTree(child) {
  try {
    if (process.platform === 'win32' && typeof child.pid === 'number') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', () => {
        try {
          child.kill()
        } catch {
          // The close event still fires and settles the promise.
        }
      })
      return
    }
    child.kill('SIGKILL')
  } catch {
    // The close event still fires and settles the promise.
  }
}

function runPnpm(script, args, cwd, timeoutMs = PNPM_TIMEOUT) {
  return new Promise(resolve => {
    const execPath = nodeRuntime()
    if (execPath === '') {
      resolve({ code: -1, output: 'no node runtime available for pnpm' })
      return
    }
    const env = { ...process.env }
    if (execPath === process.execPath) env.ELECTRON_RUN_AS_NODE = '1'
    const child = spawn(execPath, [script, ...args], {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    let output = ''
    let settled = false
    const collect = chunk => {
      output += String(chunk)
      if (output.length > 40000) output = output.slice(-40000)
    }
    // A hung pnpm would hold every agent's maintenance gate forever; the
    // client-side fetch timeout only abandons the browser side. Kill the
    // child here so the hold is always released.
    const timer = setTimeout(() => {
      output += `\n[pnpm timed out after ${Math.round(timeoutMs / 1000)}s; killing the process tree]`
      killTree(child)
    }, timeoutMs)
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', error => {
      finish({ code: -1, output: `${output}\n${error instanceof Error ? error.message : String(error)}` })
    })
    child.on('close', code => {
      finish({ code: typeof code === 'number' ? code : -1, output })
    })
  })
}

/** How long a batch update waits for every agent to go idle before giving up. */
const IDLE_WAIT_MS = 3 * 60 * 1000

/** A batch install rewrites the whole profile store; give it room. */
const BATCH_TIMEOUT = 25 * 60 * 1000

/**
 * Permit one exact version through pnpm's supply-chain age policy.
 *
 * The profile carries a `minimumReleaseAgeExclude` list in pnpm-workspace.yaml
 * and pnpm refuses any version younger than the configured minimum release age
 * unless that exact version appears in it. The marketplaces append to this list
 * on every install; an update that skips the step fails on policy, not on the
 * network — which is indistinguishable from "the update is broken" unless you
 * know to look here.
 *
 * Returns true when the document actually changed.
 */
function allowVersion(document, name, version) {
  const key = 'minimumReleaseAgeExclude'
  const prefix = `${name}@`
  const list = document.get(key)
  if (list === undefined || list === null) {
    document.set(key, [`${prefix}${version}`])
    return true
  }
  if (typeof list.add !== 'function') return false
  for (const item of list.items ?? []) {
    const value = typeof item === 'string' ? item : String(item?.value ?? '')
    if (!value.startsWith(prefix)) continue
    const versions = value
      .slice(prefix.length)
      .split('||')
      .map(part => part.trim())
      .filter(part => part.length > 0)
    if (versions.includes(version)) return false
    versions.push(version)
    const next = `${prefix}${versions.join(' || ')}`
    if (typeof item === 'string') return false
    item.value = next
    return true
  }
  list.add(`${prefix}${version}`)
  return true
}

/** Append the raw output of the last update run so a failure can be read later. */
/**
 * Two logs, two jobs:
 * - `last-update.log` is the human-readable narrative of the most recent run,
 *   shown verbatim in the panel when you click "查看日志".
 * - `update-log.jsonl` appends one JSON line per run, forever. It answers the
 *   question "when did this package last fail to update?" without having to
 *   remember which of the last-N runs it was. Rotate by hand if it ever
 *   becomes huge; it is only appended, never read by this plugin.
 */
function writeUpdateLog(title, text) {
  const file = join(stateDir(), 'last-update.log')
  const body = `# ${title} · ${new Date().toISOString()}\n\n${text}\n`
  try {
    mkdirSync(stateDir(), { recursive: true })
    writeFileSync(file, body, 'utf8')
  } catch {
    return null
  }
  try {
    const jsonl = join(stateDir(), 'update-log.jsonl')
    const entry = JSON.stringify({
      at: new Date().toISOString(),
      title,
      ok: !title.startsWith('FAILED'),
    })
    appendFileSync(jsonl, entry + '\n', 'utf8')
  } catch {
    // Append-only history is nice-to-have; the panel log already succeeded.
  }
  return file
}

/**
 * Update every chosen package in ONE pnpm pass.
 *
 * One invocation instead of one per package matters: each `pnpm add` resolves
 * the whole importer graph and re-links the hoisted store (minutes each), so
 * twenty separate calls would take half an hour and multiply the windows in
 * which a failure can happen. A single call resolves and links once.
 *
 * Around it: the supply-chain whitelist is topped up first, the three files
 * pnpm may rewrite are backed up, the run waits for an idle agent instead of
 * refusing, and any failure restores the files and re-syncs node_modules — the
 * host loads from node_modules, so restoring manifests alone would leave the
 * "rolled back" update live.
 */
/**
 * Load freshly installed code without restarting the application. The host's HMR
 * service re-compares every loaded profile module against disk inside its own
 * exclusive transaction and restarts the entries whose files changed — the same
 * path the plugin manager takes when a bundle is toggled.
 *
 * Must not be called from inside an HMR transaction (they cannot nest).
 * Client-half bundles are fetched by the page, so a browser refresh is still
 * needed for those; this only swaps the host-side modules.
 */
async function hotSwapUpdated(ctx) {
  const hmr = ctx.get('hmr')
  if (hmr === undefined || hmr === null || typeof hmr.runReload !== 'function') {
    return { ok: false, reason: 'host HMR service is unavailable' }
  }
  try {
    await hmr.runReload(() => hmr.reconcileProfile())
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

async function applyUpdates(ctx, names) {
  const facts = profileFacts(ctx)
  if (facts === null) return { ok: false, message: 'profile package.json is unavailable' }
  const script = pnpmScript()
  if (script === null) return { ok: false, message: 'pnpm was not found next to the host' }

  const wanted = Array.isArray(names) ? names.filter(name => typeof name === 'string') : []
  const byName = new Map(eligibleDeps(facts).map(entry => [entry.name, entry]))
  const targets = []
  for (const name of wanted) {
    const entry = byName.get(name)
    if (entry !== undefined && !targets.some(item => item.name === name)) targets.push(entry)
  }
  if (targets.length === 0) return { ok: false, message: 'no eligible package to update' }

  const planned = []
  const registryBase = await configuredRegistry(ctx)
  for (const target of targets) {
    let latest
    try {
      latest = await npmLatest(target.name, registryBase)
    } catch (error) {
      return { ok: false, message: `${target.name}: ${error instanceof Error ? error.message : String(error)}` }
    }
    if (compareVersions(latest, target.current) <= 0) continue
    planned.push({ name: target.name, current: target.current, latest })
  }
  if (planned.length === 0) return { ok: true, updated: [], message: 'already current' }

  // Everything pnpm may touch, kept for the rollback below.
  const backup = new Map()
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    const full = join(facts.dir, file)
    try {
      backup.set(full, readFileSync(full, 'utf8'))
    } catch {
      // A missing lockfile or workspace file is normal on a fresh profile.
    }
  }

  // Top up the supply-chain whitelist before pnpm ever sees the request.
  let allowed = 0
  let allowNote = null
  const workspaceFile = join(facts.dir, 'pnpm-workspace.yaml')
  try {
    const { yaml } = await patchContext(ctx)
    const document = yaml.parseDocument(readFileSync(workspaceFile, 'utf8'))
    for (const item of planned) if (allowVersion(document, item.name, item.latest)) allowed += 1
    if (allowed > 0) writeFileSync(workspaceFile, document.toString(), 'utf8')
  } catch (error) {
    allowNote = error instanceof Error ? error.message : String(error)
  }

  // Wait for idle instead of making the user retry by hand.
  let release = null
  const deadline = Date.now() + IDLE_WAIT_MS
  for (;;) {
    try {
      release = await holdAgents(ctx)
      break
    } catch {
      if (Date.now() >= deadline) {
        if (allowed > 0) {
          for (const [file, text] of backup) writeFileSync(file, text, 'utf8')
        }
        return {
          ok: false,
          waiting: true,
          message: '等了几分钟会话一直在忙，先不动任何文件；空闲后再点一次更新',
        }
      }
      await new Promise(resume => setTimeout(resume, 3000))
    }
  }

  const args = ['add', ...planned.map(item => `${item.name}@${item.latest}`), '--save-exact', '--prefer-offline']
  let result = { code: -1, output: 'pnpm did not run' }
  try {
    result = await runPnpm(script, args, facts.dir, BATCH_TIMEOUT)
  } finally {
    release()
  }

  if (result.code !== 0) {
    for (const [file, text] of backup) writeFileSync(file, text, 'utf8')
    // node_modules still holds whatever did install, and the host loads from
    // there — restoring the manifests alone would leave the update live.
    let resync = null
    try {
      const releaseAgain = await holdAgents(ctx)
      try {
        resync = await runPnpm(script, ['install', '--prefer-offline'], facts.dir, BATCH_TIMEOUT)
      } finally {
        releaseAgain()
      }
    } catch {
      // A busy agent is fine: the manifests are restored and the next real
      // install converges node_modules anyway.
    }
    const resyncState = resync === null ? 'skipped' : resync.code === 0 ? 'ok' : 'failed'
    const log = writeUpdateLog(
      `FAILED ${planned.map(item => `${item.name}@${item.latest}`).join(' ')}`,
      [
        `plan: ${planned.map(item => `${item.name} ${item.current} -> ${item.latest}`).join(', ')}`,
        `whitelist entries added: ${allowed}${allowNote === null ? '' : ` (note: ${allowNote})`}`,
        `resync: ${resyncState}`,
        '',
        result.output,
      ].join('\n'),
    )
    return {
      ok: false,
      rolledBack: true,
      updated: [],
      failed: { name: `${planned.length} 个包`, output: result.output.slice(-1500) },
      resync: resyncState,
      log,
      message:
        `批量更新失败，三个文件已回滚（${planned.length} 个包一个都没改动）` +
        (resyncState === 'failed'
          ? '；node_modules 重同步未完成，重启前请再执行一次更新或手动 pnpm install'
          : ''),
    }
  }

  cache.clear()
  // Swap the new code in now instead of asking for a restart. A fresh hold keeps
  // a session from starting while entries are being stopped and restarted.
  let swap = { ok: false, reason: 'no idle moment to swap code' }
  try {
    const releaseSwap = await holdAgents(ctx)
    try {
      swap = await hotSwapUpdated(ctx)
    } finally {
      releaseSwap()
    }
  } catch {
    // A busy agent leaves the restart advice in place.
  }
  const log = writeUpdateLog(
    `OK ${planned.length} package(s)`,
    [
      `updated: ${planned.map(item => `${item.name} ${item.current} -> ${item.latest}`).join(', ')}`,
      `whitelist entries added: ${allowed}`,
      `hot swap: ${swap.ok === true ? 'ok' : swap.reason}`,
      '',
      result.output.slice(-4000),
    ].join('\n'),
  )
  return {
    ok: true,
    updated: planned.map(item => ({ name: item.name, from: item.current, to: item.latest })),
    hotSwap: swap,
    restart: swap.ok !== true,
    log,
  }
}
/* ---------------------------- other install kinds ---------------------------- */

const GITHUB_SPEC = /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:#([^#]*))?$/
const REMOTE_SPEC = /^https?:\/\//

function installedVersion(dir, name) {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8'))
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

/** The commit pnpm resolved a `github:` dependency to, read back from the lockfile. */
function installedCommit(dir, name) {
  let lock
  try {
    lock = readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')
  } catch {
    return null
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `^\\s*${escaped}@https://codeload\\.github\\.com/[^/]+/[^/]+/tar\\.gz/([0-9a-f]{7,40}):`,
    'm',
  )
  const match = pattern.exec(lock)
  return match === null ? null : match[1]
}

/**
 * Headers for GitHub's REST API. An unauthenticated caller is capped at 60
 * requests an hour, which a full profile listing can exhaust, so a token from
 * the environment is used when one is present.
 */
function githubHeaders() {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'dsh-plugin-dashboard' }
  const token = typeof process.env.GITHUB_TOKEN === 'string' ? process.env.GITHUB_TOKEN.trim() : ''
  if (token.length > 0) headers.authorization = `Bearer ${token}`
  return headers
}

async function githubHead(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, {
    signal: AbortSignal.timeout(12000),
    headers: githubHeaders(),
  })
  if (!response.ok) throw new Error(`github answered ${response.status}`)
  const body = await response.json()
  const first = Array.isArray(body) ? body[0] : null
  const commit = first === null || typeof first !== 'object' ? null : first.commit
  if (commit === null || typeof commit !== 'object') throw new Error('github returned no commit')
  const message = typeof commit.message === 'string' ? commit.message.split('\n')[0].slice(0, 140) : null
  const date = commit.committer?.date ?? commit.author?.date ?? null
  return { sha: typeof first.sha === 'string' ? first.sha : null, date, message }
}

/**
 * The latest published GitHub Release of a repository. Used for `file:`
 * installs, where the tarball has no registry entry to compare against, but
 * the project usually still publishes tagged releases we can read a version
 * from. Returns null when the repository publishes no releases at all.
 */
async function githubLatestRelease(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    signal: AbortSignal.timeout(12000),
    headers: githubHeaders(),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`github answered ${response.status}`)
  const body = await response.json()
  if (body === null || typeof body !== 'object') return null
  const tag = typeof body.tag_name === 'string' ? body.tag_name.trim() : ''
  return {
    tag,
    version: tag.replace(/^v/, ''),
    url: typeof body.html_url === 'string' ? body.html_url : null,
    publishedAt: typeof body.published_at === 'string' ? body.published_at : null,
  }
}

/**
 * The highest semver tag of a repository. Plenty of projects tag every release
 * without ever publishing a GitHub Release, so `/releases/latest` answers 404
 * for them and their updates would stay invisible; the tags API sees them.
 * Returns null when no tag parses as a version.
 */
async function githubLatestTag(owner, repo) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`, {
    signal: AbortSignal.timeout(12000),
    headers: githubHeaders(),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`github answered ${response.status}`)
  const body = await response.json()
  if (!Array.isArray(body)) return null
  let best = null
  for (const item of body) {
    const tag = typeof item?.name === 'string' ? item.name.trim() : ''
    const version = tag.replace(/^v/, '')
    if (!EXACT_VERSION.test(version)) continue
    if (best === null || compareVersions(version, best.version) > 0) best = { tag, version }
  }
  if (best === null) return null
  return {
    tag: best.tag,
    version: best.version,
    url: `https://github.com/${owner}/${repo}/releases/tag/${best.tag}`,
    publishedAt: null,
  }
}

/**
 * The newest version a repository advertises, whichever way it advertises it:
 * a published Release, or a bare tag. The two are compared as versions rather
 * than trusted in order, because a project can tag ahead of its last Release.
 */
async function githubBestVersion(owner, repo) {
  const found = []
  const failures = []
  for (const read of [githubLatestRelease, githubLatestTag]) {
    try {
      const one = await read(owner, repo)
      if (one !== null && one.version.length > 0) found.push(one)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (found.length === 0) {
    if (failures.length > 0) throw new Error(failures.join('; '))
    return null
  }
  found.sort((left, right) => compareVersions(right.version, left.version))
  return found[0]
}

/**
 * The assets attached to one GitHub Release. Tags without a Release have none,
 * and the API answers 404 for those, so an empty list is a normal answer.
 */
async function githubReleaseAssets(owner, repo, tag) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { signal: AbortSignal.timeout(REGISTRY_TIMEOUT), headers: githubHeaders() },
  )
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`github answered ${response.status}`)
  const body = await response.json()
  const list =
    body !== null && typeof body === 'object' && Array.isArray(body.assets) ? body.assets : []
  return list
    .filter(
      item =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.name === 'string' &&
        typeof item.browser_download_url === 'string',
    )
    .map(item => ({
      name: item.name,
      size: typeof item.size === 'number' ? item.size : null,
      url: item.browser_download_url,
    }))
}

/**
 * The tarball among a release's assets that belongs to this package. Matches by
 * prefix so `dsh-our-free-model` picks `dsh-our-free-model-2.8.3.tgz` and never
 * the macOS `.dmg` or the installer `.exe` sitting next to it.
 */
function pickTarballAsset(assets, name) {
  const bare = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name
  for (const asset of assets) {
    if (asset.name.startsWith(`${bare}-`) && asset.name.endsWith('.tgz')) return asset
  }
  return null
}

/** Read the hash out of a `SHA256SUMS` file for one asset. */
function parseSha256Sums(text, assetName) {
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (match !== null && match[2] === assetName) return match[1].toLowerCase()
  }
  return null
}

function sha256OfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Download a release asset to a path. Buffered on purpose: release tarballs run
 * tens of megabytes, and a single `arrayBuffer()` avoids a stream wrapper that
 * would have to be kept in step with the hash check right after it.
 */
async function downloadFile(url, dest) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30 * 60 * 1000),
    headers: githubHeaders(),
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`download answered ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error('download returned an empty body')
  writeFileSync(dest, bytes)
  return bytes.length
}

/**
 * owner/repo of an installed package, read from the `repository` field of the
 * package that is actually on disk. Works for any install kind, which is what
 * a `file:` dependency needs: its profile spec carries no repository at all.
 */
function repoOf(dir, name) {
  const found = readManifest(name, dir)
  if (found === null) return null
  const links = linksOf(found.manifest)
  if (typeof links.github !== 'string') return null
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(links.github)
  if (match === null) return null
  return { owner: match[1], repo: match[2] }
}

/**
 * Dependencies the exact-version updater deliberately ignores, with a preview
 * for each so the decision is informed: a GitHub install is compared commit to
 * commit, a registry tarball against the package's published latest.
 */
async function listExtras(ctx) {
  const facts = profileFacts(ctx)
  if (facts === null) return { ok: false, message: 'profile package.json is unavailable' }
  const registryBase = await configuredRegistry(ctx)
  const rows = []
  for (const [name, raw] of Object.entries(facts.deps)) {
    if (HOST_SCOPE.test(name)) continue
    const spec = typeof raw === 'string' ? raw.trim() : ''
    if (EXACT_VERSION.test(spec)) continue
    const current = installedVersion(facts.dir, name)
    if (spec.startsWith('link:')) {
      rows.push({ name, kind: 'link', spec, current, note: '本地软链' })
      continue
    }
    if (spec.startsWith('github:')) {
      const match = GITHUB_SPEC.exec(spec)
      const row = {
        name,
        kind: 'github',
        spec,
        current,
        installedCommit: installedCommit(facts.dir, name),
        head: null,
        error: null,
      }
      if (match === null) row.error = '无法解析 github 地址'
      else {
        try {
          row.head = await githubHead(match[1], match[2])
        } catch (error) {
          row.error = error instanceof Error ? error.message : String(error)
        }
      }
      rows.push(row)
      continue
    }
    if (REMOTE_SPEC.test(spec)) {
      const row = { name, kind: 'tarball', spec, current, npmLatest: null, hasUpdate: false, error: null }
      try {
        row.npmLatest = await npmLatest(name, registryBase)
        row.hasUpdate = compareVersions(row.npmLatest, current ?? '0.0.0') > 0
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error)
      }
      rows.push(row)
      continue
    }
    if (spec.startsWith('file:')) {
      // 本地压缩包（例如下载好放进 vendor/ 的那个）：profile 里没有远端地址，
      // 所以改从「已经装着的那个包自己的 repository 字段」找回仓库，再去读它的
      // GitHub 版本号来比对 —— 已发布的 Release 和裸 tag 都算，因为不少项目只打
      // tag 不发 Release。没有仓库、也读不到版本，就只报本地版本。
      const row = { name, kind: 'file', spec, current, latestRelease: null, hasUpdate: false, error: null }
      const repo = repoOf(facts.dir, name)
      if (repo !== null) {
        try {
          const release = await githubBestVersion(repo.owner, repo.repo)
          if (release !== null && release.version !== '') {
            row.latestRelease = release
            row.hasUpdate = compareVersions(release.version, current ?? '0.0.0') > 0
          }
        } catch (error) {
          row.error = error instanceof Error ? error.message : String(error)
        }
      }
      rows.push(row)
      continue
    }
    rows.push({ name, kind: 'other', spec, current })
  }
  return { ok: true, rows }
}

/** Run one pnpm mutation under a maintenance hold, rolling back on failure. */
async function guardedPnpm(ctx, facts, script, args) {
  const backup = new Map()
  for (const file of ['package.json', 'pnpm-lock.yaml']) {
    const full = join(facts.dir, file)
    try {
      backup.set(full, readFileSync(full, 'utf8'))
    } catch {
      // Absent lockfile is normal.
    }
  }
  let release
  try {
    release = await holdAgents(ctx)
  } catch {
    return { ok: false, waiting: true, message: '有会话正在运行，等它结束后再试' }
  }
  let outcome
  try {
    outcome = await runPnpm(script, args, facts.dir)
  } finally {
    release()
  }
  if (outcome.code !== 0) {
    for (const [file, text] of backup) writeFileSync(file, text, 'utf8')
    return {
      ok: false,
      rolledBack: true,
      output: outcome.output.slice(-1500),
      message: '安装失败，package.json 与 pnpm-lock.yaml 已回滚',
    }
  }
  cache.clear()
  // The same swap the batch updater performs, so an extra install also goes live
  // now instead of waiting for a restart.
  let swap = { ok: false, reason: 'no idle moment to swap code' }
  try {
    const releaseSwap = await holdAgents(ctx)
    try {
      swap = await hotSwapUpdated(ctx)
    } finally {
      releaseSwap()
    }
  } catch {
    // A busy agent leaves the restart advice in place.
  }
  return { ok: true, output: outcome.output.slice(-800), hotSwap: swap, restart: swap.ok !== true }
}

/**
 * What a `file:` dependency would upgrade to — read-only, changes nothing.
 *
 * A local tarball has no registry to ask, so the answer comes from the repo the
 * installed package itself declares: its newest GitHub version, the tarball
 * asset attached to that release, and the official SHA256SUMS entry for it. The
 * hash is what makes this safe, so an upgrade with no published hash is refused
 * instead of installing a file nobody can verify.
 */
async function planFileUpgrade(ctx, name) {
  const facts = profileFacts(ctx)
  if (facts === null) return { ok: false, message: 'profile package.json is unavailable' }
  const spec = typeof facts.deps[name] === 'string' ? facts.deps[name].trim() : ''
  if (!spec.startsWith('file:')) return { ok: false, message: '不是本地文件包' }
  const repo = repoOf(facts.dir, name)
  if (repo === null) return { ok: false, message: '这个包没有声明 GitHub 仓库，找不到官方发布页' }
  const release = await githubBestVersion(repo.owner, repo.repo)
  if (release === null || release.version === '') return { ok: false, message: '读不到官方版本号' }
  const current = installedVersion(facts.dir, name)
  if (current !== null && compareVersions(release.version, current) <= 0) {
    return {
      ok: false,
      message: `官方最新版本 ${release.version} 不高于已安装的 ${current}，无需升级`,
    }
  }
  const assets = await githubReleaseAssets(repo.owner, repo.repo, release.tag)
  const tarball = pickTarballAsset(assets, name)
  if (tarball === null) {
    return {
      ok: false,
      message: `${release.tag} 里没有 ${name} 的压缩包附件（只打 tag 不发 Release 的项目无法自动升级）`,
    }
  }
  const sums = assets.find(asset => asset.name === 'SHA256SUMS')
  if (sums === undefined) {
    return { ok: false, message: `${release.tag} 没有提供 SHA256SUMS，无法校验，已拒绝自动升级` }
  }
  const response = await fetch(sums.url, {
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT),
    headers: githubHeaders(),
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`github answered ${response.status}`)
  const sha256 = parseSha256Sums(await response.text(), tarball.name)
  if (sha256 === null) {
    return { ok: false, message: `SHA256SUMS 里没有 ${tarball.name} 这一条，已拒绝自动升级` }
  }
  return {
    ok: true,
    name,
    current,
    spec,
    nextSpec: `file:./vendor/${tarball.name}`,
    target: {
      tag: release.tag,
      version: release.version,
      releaseUrl: release.url,
      publishedAt: release.publishedAt ?? null,
      asset: { name: tarball.name, size: tarball.size, url: tarball.url },
      sha256,
    },
  }
}

/**
 * Upgrade a `file:` dependency to the tarball on its newest official release.
 *
 * The file is verified before it is ever referenced: it lands as `<name>.part`,
 * the official SHA256SUMS entry is checked against it, and only then does it
 * take its real name and get written into package.json. Any failure after that
 * point restores both manifests and re-syncs node_modules, so "failed" never
 * means "half installed".
 */
async function applyFileUpgrade(ctx, name) {
  const facts = profileFacts(ctx)
  if (facts === null) return { ok: false, message: 'profile package.json is unavailable' }
  const script = pnpmScript()
  if (script === null) return { ok: false, message: 'pnpm was not found next to the host' }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(facts.file, 'utf8'))
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    manifest.dependencies === null ||
    typeof manifest.dependencies !== 'object'
  ) {
    return { ok: false, message: 'profile package.json 里没有 dependencies' }
  }

  let plan
  try {
    plan = await planFileUpgrade(ctx, name)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  if (plan.ok !== true) return plan

  const vendor = join(facts.dir, 'vendor')
  try {
    mkdirSync(vendor, { recursive: true })
  } catch {
    // Already there, or the write below reports it.
  }
  const target = join(vendor, plan.target.asset.name)
  const partial = `${target}.part`
  const lockPath = join(facts.dir, 'pnpm-lock.yaml')
  const before = new Map()
  for (const file of [facts.file, lockPath]) {
    try {
      before.set(file, readFileSync(file))
    } catch {
      // A missing lockfile is fine: there is nothing to put back.
    }
  }

  let bytes
  try {
    bytes = await downloadFile(plan.target.asset.url, partial)
    const actual = sha256OfFile(partial)
    if (actual !== plan.target.sha256) {
      throw new Error(`官方 sha256 是 ${plan.target.sha256}，下下来的是 ${actual}`)
    }
    renameSync(partial, target)
  } catch (error) {
    try {
      if (existsSync(partial)) unlinkSync(partial)
    } catch {
      // Best effort: a stray .part is inert.
    }
    return {
      ok: false,
      message: `下载或校验失败，什么都没改：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  let release
  try {
    release = await holdAgents(ctx)
  } catch {
    try {
      if (existsSync(target)) unlinkSync(target)
    } catch {
      // Best effort.
    }
    return { ok: false, waiting: true, message: '有会话正在运行，等它结束后再点一次升级' }
  }

  let outcome = null
  try {
    manifest.dependencies[name] = plan.nextSpec
    writeFileSync(facts.file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    outcome = await runPnpm(script, ['install', '--prefer-offline'], facts.dir, BATCH_TIMEOUT)
  } catch (error) {
    outcome = { code: -1, output: error instanceof Error ? error.message : String(error) }
  } finally {
    release()
  }

  if (outcome === null || outcome.code !== 0) {
    for (const [file, content] of before) {
      try {
        writeFileSync(file, content)
      } catch {
        // Keep going: restoring the lockfile matters more than the manifest.
      }
    }
    let resync = null
    try {
      const releaseAgain = await holdAgents(ctx)
      try {
        resync = await runPnpm(script, ['install', '--prefer-offline'], facts.dir, BATCH_TIMEOUT)
      } finally {
        releaseAgain()
      }
    } catch {
      resync = null
    }
    try {
      if (existsSync(target)) unlinkSync(target)
    } catch {
      // Best effort.
    }
    const resyncState = resync === null ? 'skipped' : resync.code === 0 ? 'ok' : 'failed'
    writeUpdateLog(
      `FAILED ${name}`,
      `action: file-upgrade\nplan: ${plan.current} -> ${plan.target.version}\nresync: ${resyncState}\n\n${outcome === null ? '' : outcome.output}`,
    )
    return {
      ok: false,
      rolledBack: true,
      resync: resyncState,
      output: outcome === null ? '' : outcome.output.slice(-4000),
      message: '本地包升级失败，package.json 与 pnpm-lock.yaml 已回滚',
    }
  }

  cache.clear()
  let swap = { ok: false, reason: 'no idle moment to swap code' }
  try {
    const releaseSwap = await holdAgents(ctx)
    try {
      swap = await hotSwapUpdated(ctx)
    } finally {
      releaseSwap()
    }
  } catch {
    // Keep the result above; the caller reports it as restart-required.
  }
  writeUpdateLog(
    `OK ${name}`,
    `action: file-upgrade\n${plan.current} -> ${plan.target.version}\nasset: ${plan.target.asset.name} (${bytes} bytes)\nsha256: ${plan.target.sha256}\nhot swap: ${swap.ok === true ? 'ok' : swap.reason}`,
  )
  return {
    ok: true,
    action: 'file-upgrade',
    name,
    from: plan.current,
    to: plan.target.version,
    asset: plan.target.asset.name,
    bytes,
    sha256: plan.target.sha256,
    output: outcome.output.slice(-800),
    hotSwap: swap,
    restart: swap.ok !== true,
  }
}

async function applyExtras(ctx, name, action) {
  const facts = profileFacts(ctx)
  if (facts === null) return { ok: false, message: 'profile package.json is unavailable' }
  const script = pnpmScript()
  if (script === null) return { ok: false, message: 'pnpm was not found next to the host' }
  const spec = typeof facts.deps[name] === 'string' ? facts.deps[name].trim() : ''
  if (spec === '') return { ok: false, message: 'unknown package' }

  if (action === 'repull') {
    if (!spec.startsWith('github:')) return { ok: false, message: '不是 GitHub 直装的包' }
    const match = GITHUB_SPEC.exec(spec)
    if (match === null) return { ok: false, message: '无法解析 github 地址' }
    let head
    try {
      head = await githubHead(match[1], match[2])
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    if (head.sha === null || head.sha === '') return { ok: false, message: 'github returned no commit hash' }
    // Pin to the head commit at action time. Re-adding the same floating spec
    // lets pnpm treat the lockfile as already satisfied and silently reuse the
    // old pin, which would make 重新拉取 a no-op.
    const result = await guardedPnpm(ctx, facts, script, [
      'add',
      `github:${match[1]}/${match[2]}#${head.sha}`,
      '--save-exact',
    ])
    return { ...result, restart: result.hotSwap?.ok !== true, action: 'repull', head }
  }
  if (action === 'pin') {
    if (!REMOTE_SPEC.test(spec)) return { ok: false, message: '不是压缩包安装的包' }
    let latest
    try {
      latest = await npmLatest(name, await configuredRegistry(ctx))
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    // Guard against downgrades: the npm latest can be OLDER than what the
    // tarball installed (dsh-our-free-model runs 2.8.0 while npm says 2.1.0).
    const current = installedVersion(facts.dir, name)
    if (current !== null && compareVersions(latest, current) <= 0) {
      return { ok: false, message: `npm 最新版本 ${latest} 不高于已安装的 ${current}，已取消（防止降级）` }
    }
    const result = await guardedPnpm(ctx, facts, script, ['add', `${name}@${latest}`, '--save-exact'])
    return { ...result, restart: result.hotSwap?.ok !== true, action: 'pin', latest }
  }
  if (action === 'file-upgrade') return applyFileUpgrade(ctx, name)
  return { ok: false, message: 'unknown action' }
}

/**
 * The registry this profile actually resolves packages from. pnpm's own answer
 * wins because it reflects the profile's configuration, so a mirror keeps
 * working and nothing here has to know what a mirror is.
 */
async function configuredRegistry(ctx) {
  try {
    const info = await ctx.pluginManager.registries()
    if (info === null || typeof info !== 'object') return null
    if (typeof info.resolved === 'string' && info.resolved.length > 0) return info.resolved
    const fallbacks = Array.isArray(info.fallbackRegistries) ? info.fallbackRegistries : []
    if (fallbacks.length > 0 && typeof fallbacks[0] === 'string') return fallbacks[0]
    return typeof info.registry === 'string' && info.registry.length > 0 ? info.registry : null
  } catch {
    return null
  }
}

/** The host's bundle record for a package, or null when nothing mounts it. */
async function bundleFor(ctx, name) {
  const all = await ctx.pluginManager.listBundles()
  return all.find((item) => item.name === name) ?? null
}

/** Every dependency the panel may remove: mounted here, and the host allows it. */
async function listRemovable(ctx) {
  const all = await ctx.pluginManager.listBundles()
  return all
    .filter((item) => item.removable === true && item.availability === 'profile' && item.name !== SELF)
    .map((item) => ({ name: item.name, version: item.version ?? null, enabled: item.enabled === true, installed: item.installed === true }))
}

/**
 * Uninstall a plugin through the host's own service. `removeBundle` owns the
 * profile write lock, unregisters the bundle, runs the package manager and
 * reloads in one transaction, and it refuses anything the host does not
 * consider removable — which is what keeps core packages safe. The manifest and
 * lockfile are copied first and restored when the removal throws.
 */
async function actUninstall(ctx, name) {
  if (typeof name !== 'string' || name.trim().length === 0) throw new HttpError(400, 'name is required')
  const target = name.trim()
  if (target === SELF) throw new Error('不能卸载正在运行的面板本身，请用宿主自带的插件管理器')
  const bundle = await bundleFor(ctx, target)
  if (bundle === null) throw new Error(`${target} 不是本 profile 挂载的 bundle，无法卸载`)
  if (bundle.removable !== true) throw new Error(`${target} 由宿主管理，不允许卸载`)
  const facts = profileFacts(ctx)
  const backup = new Map()
  if (facts !== null) {
    for (const full of [facts.file, join(facts.dir, 'pnpm-lock.yaml')]) {
      try {
        backup.set(full, readFileSync(full, 'utf8'))
      } catch {
        // A missing lockfile is not a reason to refuse the removal.
      }
    }
  }
  try {
    const result = await ctx.pluginManager.removeBundle(target)
    cache.clear()
    return {
      ok: true,
      name: target,
      application: result === null || result === undefined ? null : (result.application ?? null),
      output: String(result?.packageResult?.output ?? '').slice(-4000),
    }
  } catch (error) {
    for (const [file, text] of backup) {
      try {
        writeFileSync(file, text, 'utf8')
      } catch {
        // Nothing better to do than report the original failure.
      }
    }
    throw error
  }
}

/**
 * Install a new bundle from a spec the host understands: an npm name, a
 * name@version, a directory, a git URL or a tarball URL. The spec is inspected
 * first, so a typo or a package that ships no bundle patch is refused before
 * anything is downloaded, and the install then goes through the host service —
 * which is what applies the compatibility check and the build-script policy
 * that a bare package manager call would skip.
 */
async function actInstall(ctx, spec) {
  if (typeof spec !== 'string' || spec.trim().length === 0) throw new HttpError(400, 'spec is required')
  const wanted = spec.trim()
  const inspection = await ctx.pluginManager.inspect(wanted)
  if (inspection === null || typeof inspection !== 'object' || inspection.status !== 'accepted') {
    return {
      ok: false,
      stage: 'inspect',
      problem: inspection?.problem ?? 'unknown',
      message: inspection?.reason ?? '宿主拒绝了这个来源',
    }
  }
  const result = await ctx.pluginManager.installBundle(wanted, { enabled: true, saveExact: true })
  cache.clear()
  const pending = Array.isArray(result?.pendingBuilds) ? result.pendingBuilds : []
  if (pending.length > 0) {
    return { ok: false, stage: 'build-approval', pendingBuilds: pending, message: '这些包需要在运行构建脚本前得到批准' }
  }
  const swap = await hotSwapUpdated(ctx)
  // 冲突对账：装完后看 loader 里有没有出现重复 entry id 或 moduleName。
  // 新装的那个先禁用，把决定权留给用户，别让两个同名插件抢着挂载同一个 API。
  const conflicts = []
  let rowsAfter = null
  try {
    rowsAfter = await readRows(ctx)
    const seenByEntryId = new Map()
    const seenByModule = new Map()
    for (const row of rowsAfter) {
      const byId = seenByEntryId.get(row.entryId)
      if (byId !== undefined) {
        conflicts.push({ kind: 'entryId', key: row.entryId, rows: [byId.name, row.name] })
      } else {
        seenByEntryId.set(row.entryId, row)
      }
      if (row.moduleName !== '') {
        const byModule = seenByModule.get(row.moduleName)
        if (byModule !== undefined) {
          conflicts.push({ kind: 'moduleName', key: row.moduleName, rows: [byModule.name, row.name] })
        } else {
          seenByModule.set(row.moduleName, row)
        }
      }
    }
    // 自动禁用新装那个名字对应的行（只要能定位到）。
    if (conflicts.length > 0 && typeof inspection.name === 'string') {
      // inspection.name 是包名（patchId 概念），要转换成具体的 entryId 才能用 setPluginEnabled。
      const mine = rowsAfter.filter(row => row.name === inspection.name || row.patchId === inspection.name)
      for (const row of mine) {
        try {
          await ctx.pluginManager.setPluginEnabled(row.entryId, false)
          conflicts.forEach(conflict => {
            if (conflict.autoDisabled === undefined) conflict.autoDisabled = []
            conflict.autoDisabled.push(row.entryId)
          })
        } catch {
          // 禁用失败就把冲突留给用户看，不装作处理好了。
        }
      }
    }
  } catch {
    // readRows 失败不该让安装本身失败；冲突只是没检测，不是装坏了。
  }
  return {
    ok: true,
    installed: {
      name: typeof inspection.name === 'string' ? inspection.name : null,
      version: typeof inspection.version === 'string' ? inspection.version : null,
      kind: typeof inspection.kind === 'string' ? inspection.kind : null,
      description: typeof inspection.description === 'string' ? inspection.description : null,
    },
    application: result === null || result === undefined ? null : (result.application ?? null),
    hotSwap: swap,
    restart: swap.ok !== true,
    output: String(result?.packageResult?.output ?? result?.output ?? '').slice(-4000),
    conflicts: conflicts.length > 0 ? conflicts : undefined,
  }
}

async function handle(ctx, req, res) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const path = url.pathname.slice(ROUTE_PREFIX.length) || '/'
  const method = req.method ?? 'GET'

  // 只接受来自 web GUI 本身的调用。两层防线：
  // 1. Host 必须是 127.0.0.1 / localhost / ::1 —— 拒绝 DNS rebinding（恶意域名解析到 127.0.0.1）。
  // 2. 有 Origin 就必须同源 —— 拒绝跨站 fetch。没 Origin 的是 curl / 同源导航，放过。
  const host = String(req.headers.host ?? '').toLowerCase().split(':')[0]
  const hostOk = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  if (!hostOk) {
    return send(res, 403, { ok: false, message: 'host not allowed' })
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '') {
    let originHost = ''
    try {
      originHost = new URL(origin).hostname.toLowerCase()
    } catch {
      return send(res, 403, { ok: false, message: 'bad origin' })
    }
    const originOk =
      originHost === '127.0.0.1' || originHost === 'localhost' || originHost === '::1' || originHost === '[::1]'
    if (!originOk) {
      return send(res, 403, { ok: false, message: 'origin not allowed' })
    }
  }

  // Only JSON bodies are accepted, which also means a plain cross-origin form
  // post cannot reach an operation.
  if (method === 'POST') {
    const type = String(req.headers['content-type'] ?? '').toLowerCase()
    if (!type.startsWith('application/json')) {
      return send(res, 415, { ok: false, message: 'content-type must be application/json' })
    }
  }

  if (method === 'GET' && (path === '/ping' || path === '/')) {
    return send(res, 200, {
      ok: true,
      version: VERSION,
      statePath: stateFile(),
      // Which interpreter would run pnpm; a console node keeps it windowless.
      pnpmNode: nodeRuntime(),
      pnpmScript: pnpmScript(),
    })
  }
  if (method === 'GET' && path === '/state') {
    return send(res, 200, await snapshot(ctx))
  }
  // 给脚本/未来的 agent 工具用的精简快照：每行只保留名字、版本、开关、phase、
  // 是否自动、是否核心。比 /state 干净，不带详情缓存、不带 bulk 进度。
  if (method === 'GET' && path === '/summary') {
    const rows = await readRows(ctx)
    const state = roster()
    const auto = new Set(state.auto)
    return send(res, 200, {
      ok: true,
      rows: rows.map(row => ({
        name: row.name,
        version: row.version,
        enabled: row.enabled,
        phase: row.phase,
        official: row.official,
        manageable: row.manageable,
        auto: auto.has(row.patchId),
        description: row.description,
      })),
    })
  }
  if (method === 'GET' && path === '/detail') {
    const entryId = url.searchParams.get('entryId') ?? ''
    if (entryId.length === 0) throw new HttpError(400, 'entryId is required')
    return send(res, 200, { ok: true, ...(await detailFor(ctx, entryId)) })
  }
  if (method === 'GET' && path === '/updates') {
    return send(res, 200, await checkUpdates(ctx))
  }
  if (method === 'POST' && path === '/updates') {
    // 更新同样要动 package.json + pnpm-lock.yaml，必须和其它写操作互斥。
    if (!beginMutation()) {
      return send(res, 200, { ok: false, message: BUSY_MESSAGE })
    }
    try {
      const body = await readJsonBody(req)
      const names = Array.isArray(body.names) ? body.names : []
      return send(res, 200, await applyUpdates(ctx, names))
    } finally {
      endMutation()
    }
  }
  if (method === 'GET' && path === '/updatelog') {
    const file = join(stateDir(), 'last-update.log')
    try {
      const text = readFileSync(file, 'utf8')
      send(res, 200, { ok: true, path: file, text })
    } catch {
      send(res, 200, { ok: true, path: file, text: null })
    }
    return
  }

  if (method === 'GET' && path === '/extras') {
    return send(res, 200, await listExtras(ctx))
  }
  if (method === 'POST' && path === '/extras') {
    // 「重新拉取 / 改为按版本安装」也会跑 pnpm，同样进互斥区。
    if (!beginMutation()) {
      return send(res, 200, { ok: false, message: BUSY_MESSAGE })
    }
    try {
      const body = await readJsonBody(req)
      return send(res, 200, await applyExtras(ctx, String(body.name ?? ''), String(body.action ?? '')))
    } finally {
      endMutation()
    }
  }
  if (method === 'GET' && path === '/registries') {
    const info = await ctx.pluginManager.registries()
    return send(res, 200, { ok: true, ...(info ?? {}), github: typeof process.env.GITHUB_TOKEN === 'string' && process.env.GITHUB_TOKEN.trim().length > 0 })
  }
  if (method === 'GET' && path === '/inspect') {
    // 只做预检，不装任何东西：把宿主 inspect 的结果原样交给界面，
    // 这样「安装」按钮点下去之前，用户已经能看到要装的到底是哪个包、什么版本。
    const spec = (url.searchParams.get('spec') ?? '').trim()
    if (spec === '') return send(res, 400, { ok: false, message: 'spec is required' })
    try {
      return send(res, 200, { ok: true, inspection: await ctx.pluginManager.inspect(spec) })
    } catch (error) {
      return send(res, 200, { ok: false, message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (method === 'GET' && path === '/fileplan') {
    // 本地 file: 包的升级预览：只读，不下载、不改任何文件。
    const name = (url.searchParams.get('name') ?? '').trim()
    if (name === '') return send(res, 400, { ok: false, message: 'name is required' })
    try {
      return send(res, 200, await planFileUpgrade(ctx, name))
    } catch (error) {
      return send(res, 200, { ok: false, message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (method === 'GET' && path === '/removable') {
    return send(res, 200, { ok: true, rows: await listRemovable(ctx) })
  }
  if (method === 'POST' && path === '/install') {
    if (!beginMutation()) {
      return send(res, 200, { ok: false, message: BUSY_MESSAGE })
    }
    try {
      const body = await readJsonBody(req)
      return send(res, 200, await actInstall(ctx, body.spec))
    } finally {
      endMutation()
    }
  }
  if (method === 'POST' && path === '/uninstall') {
    if (!beginMutation()) {
      return send(res, 200, { ok: false, message: BUSY_MESSAGE })
    }
    try {
      const body = await readJsonBody(req)
      return send(res, 200, await actUninstall(ctx, body.name))
    } finally {
      endMutation()
    }
  }
  if (method === 'POST' && path === '/plugin') {
    return send(res, 200, await actPlugin(ctx, await readJsonBody(req)))
  }
  if (method === 'POST' && path === '/bulk') {
    const body = await readJsonBody(req)
    if (body.cancel === true) return send(res, 200, cancelBulk())
    if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean')
    const mode = body.save === true ? 'save' : 'live'
    return send(res, 200, await actBulk(ctx, body.enabled, String(body.scope ?? ''), mode))
  }
  if (method === 'POST' && path === '/roster') {
    const body = await readJsonBody(req)
    return send(
      res,
      200,
      await actRoster(ctx, String(body.mode ?? ''), String(body.scope ?? ''), body.auto === true),
    )
  }
  const allowed = ROUTES[path]
  if (allowed !== undefined) {
    res.setHeader('allow', allowed.join(', '))
    return send(res, 405, { ok: false, message: `method ${method} is not allowed on ${path}` })
  }
  return send(res, 404, { ok: false, message: `unknown route ${method} ${path}` })
}

export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) =>
        handle(ctx, req, res).catch(error => {
          const message = error instanceof Error ? error.message : String(error)
          const status = error instanceof HttpError ? error.status : 500
          if (!res.headersSent) send(res, status, { ok: false, message })
          else res.end()
        }),
    }),
  )
}
