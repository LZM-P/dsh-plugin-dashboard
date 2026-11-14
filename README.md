# dsh-plugin-rack · 插件管理

DSH（DeepSeek Harness）的插件面板：**所有插件一屏看完，一个开关直接开关，更新完不用重启。**

装在侧边栏，不用进设置页翻。

## 它解决什么问题

插件多了以后，有几件事很烦：

- 装了哪些、现在开着还是关着、是本地开发版还是线上版，得一个个翻；
- 关一个插件要重启整个 DSH；
- 想看看有没有新版要自己去查 npm，装错了还得自己回滚；
- 有些插件是 GitHub 直装、本地 tar 包、甚至只是个软链，普通办法根本看不出有没有新版。

这个面板把这些一次性收进一个列表里。

## 功能

### 列表

- **四个页签**：已安装插件 / 核心组件 / 异常 / 更新。
- 每行显示：**开关**、**手动或自动**标记、**装法来源**（npm、npmmirror、github、本地文件包、本地软链）、**有新版时的行内更新按钮**。
- **点整行展开详情**：包名、版本、许可、作者、安装目录、依赖、GitHub / npm / 主页链接，以及具体功能说明。
- 核心组件（`@deepseek-ai/*`）也全部列出，并按用途配了中文功能名，例如「插件设置」「文件工具」「会话检索」——知道哪个组件管什么，才不会误关。
- 「异常」页用来放加载失败的插件，写明失败原因；「被插件包关闭」这类由别的插件主动隐藏的组件会单独成组，**那不是故障**。

### 开关

- 每个插件一个开关，**点完立即生效，不需要重启 DSH**（宿主支持热替换时）。
- **手动 / 自动**标记：只有标为「自动」的插件才会被「一键全部开启 / 关闭」影响。标成手动的，一键操作永远不会碰它。
- 每页有自己的一套批量按钮：一键全部开启、一键全部关闭、全部设为自动、全部设为手动，**只对当前这一页生效**。
- 批量操作前在面板内弹出确认条（不是浏览器弹窗），写清楚要动几个、动哪些。
- 每行最左有一盏**状态灯**：绿=运行中、黄=加载中、红=加载失败、灰=未启用、空心=只读核心组件。加载失败的行整行淡红，不用展开就能看见。
- 第一次打开时，「自动」名单默认只包含这个 profile 安装的第三方插件，并且排除本面板自己；内置核心组件一律「手动」，所以一键全关不会把 harness 拆掉。

### 更新

- 「检查更新」把 profile 里按精确版本锁定的依赖逐个查 registry 最新版，有新的直接在列表行里标出来：`⬆ v0.1.29 ➡ v0.1.30 npm`，**点一下只更新那一个插件**。
- 更新由宿主执行：**点完就可以关掉面板**，pnpm 照样跑完。重新打开面板时，顶部会显示「后台更新中 · N 个插件」，跑完了补一条结果提示——不用守着这个界面，也不用去翻日志。卡住了可以点横幅右边的「取消」。
- **会话正忙时也不白点**：需要下载的更新会先把附件取下来、核对 sha256，然后排队；宿主每 10 秒看一眼，等所有会话都空了就自己装上（下载过的东西不会重下）。排队期间横幅显示「已排队…」。
- **网络不用你配**：下载会自动选路——`config.json` 里明确指定的代理 → 环境变量（`HTTPS_PROXY` / `ALL_PROXY`，`NO_PROXY` 会照规矩跳过）→ 系统代理（Windows 的 Internet 设置）→ 直连；一条走不通就换下一条，不会因为代理没开就整个更新失败。HTTP 代理和 SOCKS5 都支持，带用户名密码也行，查 GitHub 接口的部分同样走这些代理。
- **pnpm 从哪来**：先找 PATH 上的 pnpm，再找 `%APPDATA%\npm`、`%LOCALAPPDATA%\pnpm`、`PNPM_HOME`、`~/.local/share/pnpm`、Homebrew 与系统级安装；Windows 的 `pnpm.cmd` / `pnpm.ps1` 会用 `cmd.exe` / `powershell` 包一层再跑。
- 想固定某个代理，在数据目录写 `config.json`：`{ "download": { "proxy": "http://127.0.0.1:7897" } }`；写 `"off"` 就只直连；不写就是自动。
- **断点续传**：连接断了按 `Range` 接着下，取消或失败后保留 `.part`，下次点更新从断的地方继续，不用重下 30 MB。总上限 30 分钟，30 秒没有数据即判定卡死——GitHub 偶尔会把连接挂住，宁可报错也不让面板一直转圈；下过的包按 sha256 复用，重试同一版本不会重新下载。
- 「全部更新」勾选后批量执行，**执行前先把将运行的命令显示给你看**。
- 装完**自动热替换**，新版本当场生效，不用重启；界面类插件刷新一下页面即可。
- 能识别 **GitHub 直装 / npm 镜像 tar 包 / 本地文件包 / 本地软链** 这几种特殊装法，并给出对应的处理方式。
- registry 取 profile 自己的配置（`pluginManager.registries()`），不强行走 npmjs；装了 `GITHUB_TOKEN` 的话查 GitHub 版本会用它提额。

### 安装与卸载

- 输入包名先「检查」：**只做预检，什么都不动**。它会告诉你这是不是个 DSH 插件包、版本多少、干什么用的。像 `is-odd` 这种正常 npm 包会被拦下来——它没声明 `dsh.bundle`，装了也没用。
- 确认了再「安装」，走宿主官方的插件管理接口。
- 每行可以「卸载」，**要点两下确认**；由宿主管理、不允许移除的核心包会被拒绝。

### 安全设计

这个面板能改你的运行环境，所以几条底线是硬编码的：

- **动手之前先备份** `package.json` 与 `pnpm-lock.yaml`，失败整体写回；更新失败还会补跑一次重同步，避免「文件回滚了但 `node_modules` 没回滚」的假回滚。
- **批量操作要过维护门**：有会话正在跑时不动文件，等它空闲。
- **并发守卫**：安装 / 卸载 / 更新 / 批量操作四者互斥。同一个时刻只允许一条写操作在跑——两个 pnpm 同时改同一份 `package.json` 会把 profile 写坏。
- **面板不会卸载自己**；`removable` 为 false 的包一律拒绝。
- 只有标为「自动」的插件才进批量范围，**页面筛选只能缩小范围，不能扩大**。
- 核心组件**不会**被一刀切跳过：204 个 `@deepseek-ai/*` 行里只有 16 个真只读，其余受开关控制。真正被跳过的只有**面板自己那一行**（在自己发起的请求里关自己，会让正在响应的路由断掉）。

## 自检

改动源码后跑一遍，它会检查那些「坏了但不会报错」的东西：

```bash
node test/self-check.mjs
```

检查项：中英文词条是否一一对应、有没有用到字典里没有的键、头部注释里列的路由和实际路由表是否一致、**提前 return 之后有没有落下的 hook**（这个曾经把整个面板搞崩过）、以及残留的调试语句。

## 安装

在 DSH 里装有三条路，任选其一：

**① 从 GitHub 装（推荐，不依赖 npm）**

```bash
dsh plugin add github:LZM-P/dsh-plugin-dashboard
```

**② 从 npm 装（发布后可用）**

```bash
dsh plugin add dsh-plugin-rack
```

**③ 在插件管理界面里点「安装」**，把上面任意一条的 spec 填进去。

装好后侧边栏会出现「插件管理」。

> 如果宿主版本不认 `github:` 前缀，改用 tarball 地址：
> `dsh plugin add https://github.com/LZM-P/dsh-plugin-dashboard/archive/refs/heads/main.tar.gz`

## 数据放在哪

- 代码：插件自己的安装目录。
- 运行时数据目录：`<DSH_HOME>/plugin-rack/profiles/<profile>/`（Windows 默认 `C:\Users\<你>\.dsh\plugin-rack\profiles\desktop\`）。一个 profile 一个目录，里面是：
  - `state.json` —— 「哪些插件被标成了自动」和「面板自己创建过哪些配置覆盖」，几行 JSON。删掉只会让自动清单重置，**不影响任何插件**。
  - `job.json` —— 正在跑或上一次跑完的更新任务，面板关掉再打开靠它接回来。
  - `queue.json` —— 已下载校验、等会话空闲才装的更新。
  - `config.json` —— 下载代理等手工配置。
  - `last-update.log` / `update-log.jsonl` —— 最近一次更新的完整日志 + 每次更新的追加历史。
- **每个 profile 各存一份**：同一个 DSH 下开多个 profile 时，自动清单、正在跑的任务、待装队列、代理配置互不串台。

### 从旧版本升级（单一目录 → 按 profile 分目录）

早期版本把所有东西都放在 `<DSH_HOME>/plugin-rack/` 这一个目录里。升级后第一次启动时，上面这些文件会**逐个复制**到按 profile 分的目录（已存在的不覆盖，旧文件保留不删）：

- 排好队还没装的更新会跟过来，不会静默丢失；
- 手工配的下载代理继续生效，不用重配；
- 任务历史与更新日志都能在面板里看到。

如果旧目录里的文件已经被你手动删掉，那这几项就按新装处理（队列空、代理回落到环境变量、历史为空），不影响插件本身。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主端：注册 `/api/dsh-plugin-rack` 前缀路由，负责读取插件状态、批量操作、更新与安装卸载 |
| `client.js` | 客户端：侧边栏图标 + `main` 面板的界面（无需构建步骤，浏览器直接加载） |
| `cordis.patch.yml` | bundle 补丁，插入 `plugin-rack` 这一行 |
| `locale/{en,zh}.json` | 插件名与描述（插件管理页展示用） |
| `icon.svg` | 插件图标 |
| `test/self-check.mjs` | 自检脚本：词条对照、路由对照、hook 顺序、调试残留 |

## 接口

宿主端只暴露一个同源前缀路由，客户端直接用 `fetch` 调用，因此**不依赖** `remoteAccess` 对 `pluginManager/*` 的授权策略：

```
GET  /api/dsh-plugin-rack/ping        存活探测，不碰任何服务
GET  /api/dsh-plugin-rack/            ping 的别名
GET  /api/dsh-plugin-rack/state       全部插件行 + 自动名单 + 批量进度
GET  /api/dsh-plugin-rack/detail      某个插件的包信息（?entryId=）
GET  /api/dsh-plugin-rack/updates     检查更新（按精确版本锁定的依赖）
GET  /api/dsh-plugin-rack/extras      其他安装方式（github / tar 包 / 本地文件 / 软链）
GET  /api/dsh-plugin-rack/updatelog   上一次更新的日志
GET  /api/dsh-plugin-rack/registries  当前生效的 registry
GET  /api/dsh-plugin-rack/removable   可以卸载的插件名单
GET  /api/dsh-plugin-rack/inspect     安装预检（?spec=，只查不装）
GET  /api/dsh-plugin-rack/fileplan    ?name= 本地 file: 依赖会升到哪个版本
GET  /api/dsh-plugin-rack/job         正在跑的装包任务，或上一次的结果（running / finishedAt / interrupted）+ 待装队列
POST /api/dsh-plugin-rack/job         { action: 'cancel' } 取消正在跑的那一次
GET  /api/dsh-plugin-rack/summary     只读精简行，给脚本和 agent 用
POST /api/dsh-plugin-rack/plugin      { entryId, enabled?, auto? }
POST /api/dsh-plugin-rack/bulk        { enabled, scope, save?, cancel? }
POST /api/dsh-plugin-rack/roster      { mode: 'group', scope, auto }
POST /api/dsh-plugin-rack/updates     { names: [...] }
POST /api/dsh-plugin-rack/extras      { name, action }
POST /api/dsh-plugin-rack/install     { spec }
POST /api/dsh-plugin-rack/uninstall   { name }
```

### `save` 模式

`POST /bulk` 带 `save: true` 时**只写一次 profile 的 `cordis.patch.yml`，不逐个去动插件**：

| | `save: true` | 默认（逐个热生效） |
| --- | --- | --- |
| 写文件耗时 | 约 0.4 秒 | — |
| 重载方式 | 宿主看到文件变了，**一次性重载整批** | 每个插件一次卸载+加载（宿主 O(N) 对账，通常几秒到几十秒） |
| 适合 | 「先全关 → 去更新 → 再重启」 | 想马上看到单个插件的变化 |

写入是原子的（临时文件 + rename），只删自己创建过的覆盖项，用户原有的配置行原样保留。

只读行（`management-required` / `unaddressable`）在界面上开关与模式按钮都被禁用，并带标签说明原因。

## 安全模型

这个插件会写你的 `cordis.patch.yml`、调 pnpm、删包。为了让这些操作可控，做了四层防护：

1. **网络暴露面**：API 只在 `127.0.0.1` / `localhost` / `::1` 上可达。宿主的 web server 本来就只绑 loopback，所以外网碰不到这个端口。
2. **Host / Origin 校验**：每个请求都先过两道闸——Host 头必须指向 loopback，Origin 头（如果存在）也必须解析到 loopback。这挡的是同机浏览器里的恶意网页：它无法用 `<img>` 或 `fetch` 跨站调用你的 API（DNS rebinding / CSRF 都被这两道闸拦下）。
3. **卸载白名单**：界面上的「卸载」按钮不是对所有行都显示。只有宿主 `pluginManager` 服务明确标记为 `removable` 的包才会出现按钮。核心组件、面板自己、harness 命脉——这些**永远不会**出现在可卸载列表里，所以误点卸载也不会把系统拆坏。
4. **更新回滚**：批量更新前会备份 `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` 三个文件。pnpm 返回非零退出码时，先把这三个文件写回原内容，再跑一次 `pnpm install --prefer-offline` 把 `node_modules` 也拨回去。**失败 = 一个包都没改动**，不会留下半个新依赖树。

写入 `cordis.patch.yml` 是原子操作（写临时文件 + rename），只删这个插件自己创建过的覆盖项，用户手写的内容原样保留。

## 兼容性

- DSH 的 Web 界面（`dsh.client.platform = web`）。
- 需要宿主提供 `pluginManager` 服务；没有它会明确报错，而不是假装成功。
- 热替换依赖宿主的 HMR 服务；拿不到时退回提示「重启一次生效」，**不会骗你说已经生效了**。

## English

A plugin dashboard panel for DSH (DeepSeek Harness): every plugin in one list, a power switch per plugin,
an auto/manual flag that scopes the one-click bulk actions, inline update badges, and — the part that
matters — **updates are hot-swapped, so you do not restart DSH**. It also detects GitHub / tarball /
local-file / symlink installs, and can install and uninstall plugins through the host's official plugin
manager API, with backups and rollback.

## License

MIT
