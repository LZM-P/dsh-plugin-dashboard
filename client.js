/**
 * Client half of the plugin dashboard.
 *
 * Registers a sidebar entry and the matching main panel. Every write goes to
 * the Host half over the same-origin JSON route, so nothing here depends on the
 * Client-side Remote access policy.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-rack',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'plugin-rack';
    const API = '/api/dsh-plugin-rack';
    const NS = 'plugin-rack';

    const DICT = {
      en: {
        title: 'Plugin rack',
        subtitle: 'Per-plugin power switch and an auto/manual flag that decides who follows the one-click actions.',
        refresh: 'Refresh',
        enableAll: 'Turn all on',
        disableAll: 'Turn all off',
        markAllAuto: 'All auto',
        markNoneAuto: 'All manual',
        resetInstalled: 'Auto = installed',
        rosterLabel: 'Auto list',
        rosterCount: '{n} plugins follow the one-click actions',
        groupFailed: 'Failed',
        groupInstalled: 'Installed plugins',
        groupCore: 'Core components',
        groupSetAuto: 'Mark group auto',
        groupSetManual: 'Mark group manual',
        groupAutoOf: '{n} / {m} auto',
        groupPowerHint: 'On / off',
        groupCoreHidden: 'Switched off by a bundle',
        groupCoreHiddenNote: 'Hidden by dsh-ops, not broken — turn off hideOfficialTools there to restore them',
        groupAllAuto: 'Whole group is auto',
        groupAllManual: 'Whole group is manual',
        colName: 'Plugin',
        colPower: 'On/off',
        colMode: 'Mode',
        modeAuto: 'Auto',
        modeManual: 'Manual',
        filterAll: 'All',
        filterEnabled: 'On',
        filterDisabled: 'Off',
        filterFailed: 'Failed',
        onlyInstalled: 'Hide core',
        search: 'Search plugins...',
        shown: 'shown',
        total: 'total',
        auto: 'auto',
        on: 'on',
        off: 'off',
        failed: 'failed',
        empty: 'No plugin matches this filter.',
        loadFailed: 'Could not load plugins',
        hostMissing: 'The Host half did not answer. It may be disabled, or the app needs a restart.',
        readOnly: 'read-only',
        rawManagement: 'core',
        rawUnaddressable: 'unaddressable',
        selfTag: 'this plugin',
        rosterEmpty: 'The auto list is empty: mark the plugins you want the one-click actions to cover.',
        persisted: 'Auto list saved to',
        memoryOnly: '(memory only this session)',
        confirmEnable: 'Turn on these {n} plugins on this page?',
        confirmDisable: 'Turn off these {n} plugins on this page?',
        bulkConfirmOn: 'Turn on {n} plugin(s) on this page?',
        bulkConfirmOff: 'Turn off {n} plugin(s) on this page?',
        bulkConfirmSave: 'One write to the profile file — the host reloads the whole set in one pass instead of one by one.',
        bulkConfirmOk: 'Do it',
        bulkCancel: 'Cancel',
        enableAllSave: 'Turn all on (one pass)',
        disableAllSave: 'Turn all off (one pass)',
        saveApplied: 'Written to the profile file; the host reloaded the whole set in one pass.',
        done: 'Saved',
        withFailures: 'Saved with {n} failure(s)',
        withGuarded: '{n} skipped (this panel cannot switch itself off)',
        withUnchanged: '{n} already in that state',
        nothingToDo: 'Nothing to change',
        runningBulk: 'Working… {n}/{total}',
        stop: 'Stop',
        stopping: 'Stopping…',
        selfLocked: 'The dashboard cannot switch itself',
        loading: 'loading',
        detail: 'Details',
        dModule: 'Module',
        dEntry: 'Entry id',
        dPatch: 'Patch id',
        dPhase: 'State',
        dMode: 'One-click',
        dModeAuto: 'follows the auto list',
        dModeManual: 'excluded from one-click',
        dOfficial: 'Official',
        dManageable: 'Toggleable',
        dReason: 'Read-only reason',
        dDiagnostic: 'Error',
        yes: 'yes',
        no: 'no',
        close: 'Close',
        links: 'Links',
        dVersion: 'Version',
        dLicense: 'License',
        dAuthor: 'Author',
        dDir: 'Directory',
        dDeps: 'Dependencies',
        detailFail: 'Could not load details',
        uninstall: 'Uninstall',
        uninstallConfirm: 'Click again to really uninstall',
        uninstallRunning: 'Uninstalling…',
        uninstallDone: 'Uninstalled',
        uninstallFailed: 'Uninstall failed',
        uninstallWarn: 'Removes the package and its entry in this profile. Make sure you have a backup.',
        uninstallFreeModel: 'This plugin is what provides your free model — uninstalling it takes that away.',
        uninstallUnavailable: 'Could not load the uninstallable list',
        uninstallTitle: 'Uninstall this plugin (click again to confirm)',
        installTitle: 'Install',
        installHint: 'Type a package name and check it first — nothing is installed until you press Install.',
        installSpecPlaceholder: 'package name, e.g. dsh-better-sidebar',
        installCheck: 'Check',
        installRun: 'Install',
        installRunning: 'Installing…',
        installOk: 'Registry accepts this',
        installRefused: 'Not installable',
        installDone: 'Installed',
        installConflicts: '{n} conflict(s) detected; the new row was auto-disabled',
        installBuild: 'This package wants to run build scripts; the host needs to approve it first.',
        none: '—',
        tabPlugins: 'Installed',
        tabCore: 'Core',
        tabFailed: 'Errors',
        tabUpdates: 'Updates',
        checkUpdates: 'Check for updates',
        updateAll: 'Update all',
        updatePreview: 'Will run:',
        updateHint: 'Only packages pinned to an exact version in this profile are updated.',
        updateNone: 'Everything is up to date',
        updateIdle: 'Not checked yet — pick “Check for updates”',
        extrasTitle: 'Other install kinds',
        extrasHint:
          'These were not installed by version number, so the updater above skips them. Compare below, then install by hand.',
        extrasRepull: 'Re-pull',
        extrasPin: 'Pin to a version',
        extrasNoNewer: 'up to date',
        extrasLink: 'local link',
        extrasFile: 'local tarball',
        extrasOpenRelease: 'Open the release page',
        fileUpgrade: 'Upgrade',
        fileUpgradeConfirm: 'Confirm upgrade',
        fileUpgradeRunning: 'Downloading…',
        fileUpgradePlan: 'Will download',
        fileUpgradeSha: 'official sha256',
        srcLocalFile: 'local tarball',
        srcLocalLink: 'local link',
        srcOther: 'other',
        extrasUnknown: 'cannot query',
        extrasWarn: 'A re-pull takes the latest commit; the resulting version cannot be previewed.',
        extrasDone: 'installed',
        extrasRolledBack: 'install failed, files rolled back',
        updateChecking: 'Asking the npm registry…',
        updateWait: 'A session is still running; try again once it is idle',
        updateDone: 'Updated',
        updateRestart: 'Restart DSH once to load the new versions',
        updateSwapped: 'New versions are live; refresh the page for client-side plugins',
        hasNewVersion: 'Update available',
        updateNow: 'Update just this plugin',
        jobRunning: 'Host is updating in the background · {n} plugins',
        jobDone: 'Background update finished',
        jobFailed: 'Background update failed',
        jobInterrupted: 'The last update never finished (host restarted or interrupted)',
        jobCancel: 'Cancel',
        updateRolledBack: 'Rolled back',
        updateFailed: 'Failed',
        updateSelectAll: 'Select all',
        updateBatchHint: 'One pnpm pass installs every picked package; any failure rolls all of them back.',
        updateAllowHint: 'New versions are whitelisted for the supply-chain age policy automatically.',
        viewLog: 'Last log',
        logEmpty: 'No update log yet',
        logPath: 'Log file',
        dFunction: 'What it does',
        phaseActive: 'Running',
        phaseFailed: 'Failed',
        phaseLoading: 'Loading',
        phaseOff: 'Stopped',
        reasonManagement: 'Managed by the core',
        reasonUnaddressable: 'Not addressable',
        homepage: 'Homepage',
        unitPlugins: 'plugins',
      },
      zh: {
        title: '插件管理',
        subtitle: '每个插件一个开关，外加「自动 / 手动」标记：只有标为自动的插件才受一键开启 / 关闭影响。',
        refresh: '刷新',
        enableAll: '一键全部开启',
        disableAll: '一键全部关闭',
        colPower: '开关',
        colMode: '模式',
        markAllAuto: '全部设为自动',
        markNoneAuto: '全部设为手动',
        resetInstalled: '自动=已安装',
        rosterLabel: '自动清单',
        rosterCount: '共 {n} 个插件参与一键操作',
        groupFailed: '异常插件',
        groupInstalled: '已安装插件',
        groupCore: '核心组件',
        groupSetAuto: '整组设为自动',
        groupSetManual: '整组设为手动',
        groupAutoOf: '{n} / {m} 自动',
        groupPowerHint: '开启/关闭',
        groupCoreHidden: '被插件包关闭',
        groupCoreHiddenNote: '被 dsh-ops 隐藏，并非故障——关掉那边的 hideOfficialTools 即可恢复',
        groupAllAuto: '整组已设为自动',
        groupAllManual: '整组已设为手动',
        colName: '插件名称',
        colPower: '开启 / 关闭',
        colMode: '自动 / 手动',
        modeAuto: '自动',
        modeManual: '手动',
        filterAll: '全部',
        filterEnabled: '已启用',
        filterDisabled: '已禁用',
        filterFailed: '异常',
        onlyInstalled: '隐藏核心',
        search: '搜索插件…',
        shown: '显示',
        total: '共',
        auto: '自动',
        on: '启用',
        off: '禁用',
        failed: '异常',
        empty: '没有符合筛选条件的插件。',
        loadFailed: '无法读取插件列表',
        hostMissing: '宿主端没有响应：插件可能被停用，或需要重启。',
        readOnly: '只读',
        rawManagement: '核心',
        rawUnaddressable: '无法定位配置行',
        selfTag: '本插件',
        rosterEmpty: '自动清单为空：请先把要参与一键操作的插件设为「自动」。',
        persisted: '自动清单已保存到',
        memoryOnly: '（本次仅存于内存）',
        confirmEnable: '确认开启这一页的 {n} 个插件？',
        confirmDisable: '确认关闭这一页的 {n} 个插件？',
        bulkConfirmOn: '确认开启这一页的 {n} 个插件？',
        bulkConfirmOff: '确认关闭这一页的 {n} 个插件？',
        bulkConfirmSave: '只写一次配置文件，宿主整批重载一次，而不是一个一个来。',
        bulkConfirmOk: '就这么做',
        bulkCancel: '取消',
        enableAllSave: '一键全部开启（整批一次）',
        disableAllSave: '一键全部关闭（整批一次）',
        saveApplied: '已写入配置文件，宿主整批重载了一次。',
        done: '已保存',
        withFailures: '已保存，{n} 个失败',
        withGuarded: '已跳过 {n} 个（面板不能把自己关掉）',
        withUnchanged: '{n} 个本来就是这个状态',
        nothingToDo: '没有需要改的插件',
        runningBulk: '正在处理… {n}/{total}',
        stop: '停止',
        stopping: '正在停止…',
        selfLocked: '面板不能关闭自己',
        loading: '加载中',
        detail: '详细信息',
        dModule: '模块',
        dEntry: '配置行',
        dPatch: '补丁 id',
        dPhase: '运行状态',
        dMode: '一键操作',
        dModeAuto: '参与自动清单',
        dModeManual: '不参与一键操作',
        dOfficial: '官方',
        dManageable: '可开关',
        dReason: '只读原因',
        dDiagnostic: '错误',
        yes: '是',
        no: '否',
        close: '关闭',
        links: '链接',
        dVersion: '版本',
        dLicense: '许可',
        dAuthor: '作者',
        dDir: '目录',
        dDeps: '依赖',
        detailFail: '无法加载详情',
        uninstall: '卸载',
        uninstallConfirm: '再点一下真的卸载',
        uninstallRunning: '正在卸载…',
        uninstallDone: '已卸载',
        uninstallFailed: '卸载失败',
        uninstallWarn: '会删掉这个包，并从本 profile 的启用清单里移除它。请确认你有备份。',
        uninstallFreeModel: '这个插件就是给你提供免费模型的，卸掉它模型就没了。',
        uninstallUnavailable: '拿不到可卸载列表',
        uninstallTitle: '卸载这个插件（再点一下确认）',
        installTitle: '安装',
        installHint: '先输包名点「检查」看看到底是什么，确认了再点「安装」——不点安装不会动任何东西。',
        installSpecPlaceholder: '包名，例如 dsh-better-sidebar',
        installCheck: '检查',
        installRun: '安装',
        installRunning: '正在安装…',
        installOk: '可以安装',
        installRefused: '装不了',
        installDone: '已安装',
        installConflicts: '检测到 {n} 处冲突，已自动禁用新装的行',
        installBuild: '这个包要跑构建脚本，需要宿主先批准。',
        none: '—',
        tabPlugins: '已安装插件',
        tabCore: '核心组件',
        tabFailed: '异常',
        tabUpdates: '更新',
        checkUpdates: '检查更新',
        updateAll: '全部更新',
        updatePreview: '将执行：',
        updateHint: '只升级本 profile 里按精确版本锁定的包。',
        updateNone: '已经是最新版本',
        updateIdle: '还没检查过，点「检查更新」看有没有新版本',
        extrasTitle: '其他安装方式',
        extrasHint:
          '这几个包不是按版本号安装的，上面的自动更新会跳过它们。先对比，再决定要不要手动装。',
        extrasRepull: '重新拉取',
        extrasPin: '改为按版本安装',
        extrasNoNewer: '已是最新',
        extrasLink: '本地软链',
        extrasFile: '本地文件包',
        extrasOpenRelease: '打开发布页',
        fileUpgrade: '一键升级',
        fileUpgradeConfirm: '确认升级',
        fileUpgradeRunning: '正在下载…',
        fileUpgradePlan: '将下载',
        fileUpgradeSha: '官方 sha256',
        srcLocalFile: '本地文件包',
        srcLocalLink: '本地软链',
        srcOther: '其他',
        extrasUnknown: '无法查询',
        extrasWarn: '重新拉取会取最新提交，拉取前无法预知会变成哪个版本号。',
        extrasDone: '已安装',
        extrasRolledBack: '安装失败，已回滚文件',
        updateChecking: '正在查询 npm…',
        updateWait: '有会话正在运行，等它结束后再试',
        updateDone: '已更新',
        updateRestart: '重启一次 DSH 让新版本生效',
        updateSwapped: '新版本已即时生效；界面类插件刷新页面即可',
        hasNewVersion: '有新版',
        updateNow: '只更新这一个插件',
        jobRunning: '宿主正在后台更新 · {n} 个插件',
        jobDone: '后台更新已完成',
        jobFailed: '后台更新失败',
        jobInterrupted: '上次更新没跑完（宿主重启或中断）',
        jobCancel: '取消',
        updateRolledBack: '已回滚',
        updateFailed: '失败',
        updateSelectAll: '全选',
        updateBatchHint: '一次 pnpm 装完所有勾选的包；任何一个失败会整体回滚。',
        updateAllowHint: '新版本会自动补进 pnpm 的供应链版本白名单。',
        viewLog: '上次日志',
        logEmpty: '还没有更新日志',
        logPath: '日志文件',
        dFunction: '具体功能',
        phaseActive: '运行中',
        phaseFailed: '异常',
        phaseLoading: '加载中',
        phaseOff: '已停止',
        reasonManagement: '由核心统一管理',
        reasonUnaddressable: '无法寻址',
        homepage: '主页',
        unitPlugins: '个插件',
      },
    };

    // 哪个任务的结果已经报过了。存在 localStorage 里，面板关掉再打开不会重复弹。
    const JOB_SEEN_KEY = 'plugin-rack:seenJob';
    const LANG_KEY = 'plugin-rack:lang';
    const DEFAULT_LANG = 'zh';

    function storedLang() {
      try {
        const value = window.localStorage.getItem(LANG_KEY);
        return value === 'zh' || value === 'en' ? value : null;
      } catch (error) {
        void error;
        return null;
      }
    }

    function pickLocale() {
      const stored = storedLang();
      return stored === null ? DEFAULT_LANG : stored;
    }

    function fill(text, vars) {
      if (vars === undefined) return text;
      return text.replace(/\{(\w+)\}/g, (all, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : all,
      );
    }

    function translator(locale) {
      const table = DICT[locale] || DICT.en;
      return (key, vars) => fill(table[key] !== undefined ? table[key] : DICT.en[key] || key, vars);
    }

    const DEFAULT_TIMEOUT_MS = 120000;
    // The Host can legitimately sit on a write for a long time: it waits for an
    // idle session (3 min), runs pnpm (25 min) and, if that fails, restores the
    // manifests and re-syncs node_modules with another pnpm run (25 min).
    // 60 minutes keeps the panel from giving up while the Host is still
    // working — otherwise the UI reports a failure for a run that succeeds.
    const WRITE_TIMEOUT_MS = 60 * 60 * 1000;

    async function request(path, body, options) {
      const timeoutMs =
        options && typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
      const init =
        body === undefined
          ? { method: 'GET', headers: { accept: 'application/json' } }
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify(body),
            };
      // Without this a stuck Host call pins busy/pending forever and the only
      // way out is reloading the page.
      const controller = new AbortController();
      init.signal = controller.signal;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(API + path, init);
      } catch (error) {
        void error;
        throw new Error(controller.signal.aborted ? 'timeout' : 'unreachable');
      } finally {
        clearTimeout(timer);
      }
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        void error;
        data = null;
      }
      if (!response.ok) throw new Error((data && data.message) || response.status + ' ' + response.statusText);
      if (data === null || data.ok !== true) throw new Error((data && data.message) || 'malformed response');
      return data;
    }

    const CSS = [
      '.pd-root{display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;',
      'background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.pd-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden}',
      '.pd-inner{max-width:960px;margin:0 auto;padding:20px 24px 32px;box-sizing:border-box}',
      '.pd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}',
      '.pd-title{font-size:15px;font-weight:600;line-height:22px}',
      '.pd-sub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin-top:2px}',
      '.pd-head-act{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex:none}',
      '.pd-close{appearance:none;font:inherit;font-size:15px;line-height:15px;width:24px;height:24px;padding:0;',
      'margin-left:14px;border-radius:7px;cursor:pointer;flex:none;',
      'border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-state-error-primary)}',
      '.pd-close:hover{background:var(--dsw-alias-interactive-bg-hover-danger);',
      'border-color:var(--dsw-alias-state-error-primary)}',
      '.pd-lang{margin-left:auto;flex:none}',
      '.pd-stats{align-items:center}',
      '.pd-stat{appearance:none;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);',
      'padding:2px 6px;margin:0 -2px;border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer}',
      '.pd-stat:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-stat-on{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-primary)}',
      '.pd-link{color:var(--dsw-alias-state-business-primary);text-decoration:none}',
      '.pd-link:hover{text-decoration:underline}',
      '.pd-dot{color:var(--dsw-alias-label-tertiary)}',
      '.pd-fact-block{align-items:flex-start}',
      '.pd-desc{white-space:normal;word-break:normal;color:var(--dsw-alias-label-secondary)}',
      '.pd-note{margin-top:4px;font-size:11px;line-height:17px;color:var(--dsw-alias-state-warn-label)}',
      '.pd-note-inline{margin:0 0 0 8px;display:inline-block;max-width:520px;vertical-align:middle}',
      '.pd-fileacts{display:inline-flex;align-items:center;gap:6px;flex:none}',
      '.pd-fileplan{flex:1 0 100%;margin-top:2px}',
      '.pd-uninstall{display:flex;align-items:center;flex-wrap:wrap;gap:2px}',
      '.pd-install-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.pd-install-label{font-size:12px;color:var(--dsw-alias-label-secondary);flex:none}',
      '.pd-install-input{flex:1 1 260px;max-width:420px}',
      '.pd-cmd{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px}',
      '.pd-jobbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:var(--dsw-alias-bg-secondary,#f5f5f5);font-size:12px;color:var(--dsw-alias-label-secondary,#666)}',
      '.pd-jobbar-cancel{margin-left:auto;border:0;background:transparent;padding:0 4px;font-size:12px;',
      'color:var(--dsw-alias-label-secondary,#666);cursor:pointer}',
      '.pd-jobbar-cancel:hover{color:var(--dsw-alias-label-primary,#111)}',
      '.pd-toolbar{position:sticky;top:0;z-index:3;display:flex;flex-direction:column;gap:8px;',
      'margin:0 -24px 14px;padding:10px 24px;background:var(--dsw-alias-bg-base);',
      'border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.pd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.pd-bar-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.pd-sep{width:1px;height:18px;background:var(--dsw-alias-border-l2);margin:0 2px}',
      '.pd-btn{appearance:none;font:inherit;font-size:13px;line-height:20px;padding:5px 12px;border-radius:8px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.pd-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.pd-btn-sm{display:inline-flex;align-items:center;justify-content:center;',
      'font-size:12px;line-height:16px;min-height:26px;padding:0 10px;border-radius:7px}',
      '.pd-btn-quiet{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.pd-btn-quiet:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.pd-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.pd-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',
      '.pd-input{width:200px;max-width:100%;font:inherit;font-size:13px;padding:5px 10px;border-radius:8px;outline:none;',
      'border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.pd-input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.pd-stats{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}',
      '.pd-stats b{font-weight:600;color:var(--dsw-alias-label-primary)}',
      // One grid template shared by the column-head line and every row, so the
      // labels sit exactly over their controls and no row can drift sideways.
      '.pd-group{--pd-cols:12px minmax(0,1fr) 40px 56px 28px 20px;',
      'margin-top:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;',
      'background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      // Group header: title line, then a column-head line on the row grid.
      '.pd-group-head{display:flex;flex-direction:column;gap:5px;padding:9px 14px 7px;',
      '.pd-title-row{display:flex;align-items:center;gap:8px;min-width:0}',
      '.pd-colhead{display:grid;grid-template-columns:var(--pd-cols);gap:10px;align-items:center}',
      '.pd-colhead-label{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);',
      'text-align:center;white-space:nowrap}',
      'background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l2)}',
      '.pd-group-head[data-collapsed="true"]{border-bottom:none}',
      '.pd-chevron{appearance:none;border:none;background:transparent;padding:0;cursor:pointer;',
      'color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;',
      'width:16px;height:16px;transition:transform .15s ease}',
      '.pd-chevron[data-collapsed="true"]{transform:rotate(-90deg)}',
      '.pd-group-title{font-size:13px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%}',
      '.pd-group-count{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.pd-group-note{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin-left:2px}',
      // Bulk buttons sit in the name-column cell of the column-head line.
      '.pd-group-bulk{display:flex;align-items:center;gap:8px;min-width:0;overflow-x:auto}',
      '.pd-group-bulk .pd-btn{flex:none}',
      '.pd-group-bulk-sep{width:1px;height:16px;background:var(--dsw-alias-border-l2);margin:0 2px;flex:none}',
      // Small inline uninstall button at the end of a plugin row: grey trash
      // icon, turns red on hover / when it is in the click-again confirm state.
      '.pd-row-uninstall{appearance:none;border:none;background:transparent;padding:0;cursor:pointer;',
      'display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;',
      'color:var(--dsw-alias-label-tertiary);flex:none;justify-self:center}',
      '.pd-row-uninstall:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);',
      'color:var(--dsw-alias-state-error-primary)}',
      '.pd-row:hover .pd-row-uninstall{color:var(--dsw-alias-label-secondary)}',
      '.pd-row-uninstall:disabled{opacity:.45;cursor:not-allowed}',
      '.pd-row-uninstall-confirm{color:var(--dsw-alias-state-error-primary);',
      'background:var(--dsw-alias-interactive-bg-hover-danger)}',
      '.pd-confirm{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;',
      'margin:0 0 10px;padding:10px 14px;border:1px solid var(--dsw-alias-border-l3);',
      'border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.pd-confirm-text{display:flex;flex-direction:column;gap:3px;font-size:12px;line-height:18px}',
      '.pd-confirm-act{display:flex;align-items:center;gap:8px;flex:none}',
      '.pd-item{border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.pd-item:last-child{border-bottom:none}',
      '.pd-row{display:grid;grid-template-columns:var(--pd-cols);',
      'align-items:center;gap:10px;',
      'padding:7px 14px;cursor:pointer}',
      '.pd-cell{display:flex;align-items:center;min-width:0}',
      '.pd-cell-power,.pd-cell-mode{justify-self:center}',
      // 行最左的状态点：颜色即语义，title 写具体状态文本，失败时整行冒红。
      '.pd-dot-status{width:8px;height:8px;border-radius:50%;flex:none;justify-self:center;',
      'background:var(--dsw-alias-border-l3)}',
      '.pd-dot-running{background:var(--dsw-alias-state-success-primary)}',
      '.pd-dot-loading{background:var(--dsw-alias-state-warn-primary);animation:pd-dot-pulse 1.2s ease-in-out infinite}',
      '.pd-dot-failed{background:var(--dsw-alias-state-error-primary)}',
      '.pd-dot-off{background:var(--dsw-alias-border-l3)}',
      '.pd-dot-readonly{background:transparent;border:1.5px solid var(--dsw-alias-border-l3);box-sizing:border-box}',
      '@keyframes pd-dot-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      // 失败行整行染一层薄红，不用展开就能看见。
      '.pd-row-failed{background:var(--dsw-alias-state-error-tertiary, rgba(220,60,60,.06))}',
      '.pd-row-failed:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}',
      // 失败 tag 跟在名字后面，比详情里的字段更早进入视野。
      '.pd-tag-fail{font-size:10px;line-height:16px;padding:0 6px;border-radius:6px;white-space:nowrap;',
      'border:1px solid transparent;background:var(--dsw-alias-state-error-tertiary, rgba(220,60,60,.12));',
      'color:var(--dsw-alias-state-error-primary)}',
      '.pd-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-row-open{background:var(--dsw-alias-interactive-bg-active)}',
      '.pd-version{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);flex:none}',
      '.pd-name-act{flex:none;display:flex;align-items:center;align-self:center;margin-left:2px}',
      '.pd-upbtn-spin{flex:none;margin-right:1px}',
      '.pd-upbtn-open{text-decoration:none}',
      '.pd-src{flex:none;font-size:10px;line-height:16px;padding:0 6px;border-radius:6px;white-space:nowrap;',
      'border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary)}',
      '.pd-upbtn{display:inline-flex;align-items:center;gap:5px;flex:none;font-family:inherit;',
      'font-size:11px;line-height:16px;padding:1px 7px;border-radius:8px;white-space:nowrap;',
      'font-variant-numeric:tabular-nums;cursor:pointer;',
      'border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary);',
      'color:var(--dsw-alias-state-warn-label)}',
      '.pd-upbtn:hover{background:var(--dsw-alias-state-warn-primary);',
      'color:var(--dsw-alias-label-primary-foreground)}',
      '.pd-upbtn[disabled]{cursor:default;opacity:.45}',
      '.pd-upbtn-arrow{font-size:10px;line-height:16px;opacity:.85}',
      '.pd-upbtn-src{font-size:10px;line-height:16px;opacity:.7;text-transform:lowercase}',
      '.pd-tabs{display:flex;gap:2px;padding:3px;border-radius:11px;background:var(--dsw-alias-bg-layer-2);',
      'border:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap}',
      '.pd-tab{appearance:none;font:inherit;font-size:13px;line-height:20px;padding:3px 12px;border-radius:8px;',
      'border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;',
      'display:inline-flex;align-items:center;gap:6px}',
      '.pd-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-tab-on{background:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font-weight:600;',
      'box-shadow:0 1px 2px rgba(0,0,0,.14)}',
      '.pd-tab-on:hover{background:var(--dsw-alias-border-l3)}',
      '.pd-tab-n{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.pd-tab-on .pd-tab-n{color:inherit;opacity:.7}',
      '.pd-desc-k{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}',
      '.pd-row-chev{appearance:none;border:none;padding:0;background:transparent;color:var(--dsw-alias-label-tertiary);',
      'display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;',
      'cursor:pointer;transition:transform .15s ease;justify-self:center}',
      '.pd-row-chev[data-collapsed="true"]{transform:rotate(-90deg)}',
      '.pd-row-chev:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.pd-detail{display:flex;flex-direction:column;gap:2px;padding:2px 14px 10px;background:var(--dsw-alias-bg-layer-1)}',
      '.pd-fact{display:grid;grid-template-columns:104px minmax(0,1fr);gap:10px;font-size:11px;line-height:17px}',
      '.pd-fact-k{color:var(--dsw-alias-label-tertiary)}',
      '.pd-fact-v{color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.pd-name{display:flex;align-items:baseline;gap:8px;min-width:0}',
      '.pd-name-main{font-size:13px;line-height:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}',
      '.pd-name-sub{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0}',
      '.pd-tags{display:flex;gap:4px;flex:0 0 auto;align-items:center}',
      '.pd-tag{font-size:10px;line-height:16px;padding:0 6px;border-radius:6px;white-space:nowrap;',
      'border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary)}',
      '.pd-tag-err{border-color:transparent;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-error-primary)}',
      '.pd-tag-warn{border-color:transparent;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}',
      '.pd-tag-busy{display:inline-flex;align-items:center;gap:5px}',
      '.pd-spin{display:inline-block;width:9px;height:9px;box-sizing:border-box;border-radius:50%;',
      'border:1.5px solid var(--dsw-alias-state-warn-label);border-top-color:transparent;',
      'animation:pd-spin .7s linear infinite}',
      '@keyframes pd-spin{to{transform:rotate(360deg)}}',
      '.pd-switch{position:relative;appearance:none;border:none;padding:0;width:36px;height:20px;border-radius:999px;cursor:pointer;',
      'background:var(--dsw-alias-border-l4);transition:background .15s ease}',
      '.pd-switch-on{background:var(--dsw-alias-state-success-primary)}',
      '.pd-switch:disabled{opacity:.45;cursor:not-allowed}',
      '.pd-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;',
      'background:var(--dsw-alias-label-primary-foreground);transition:transform .15s ease}',
      '.pd-switch-on .pd-knob{transform:translateX(16px)}',
      // A 10px ring built from two stacked circles: a faint full circle plus a
      // bright arc rotating on top. Using an explicit base ring avoids the
      // "broken smile" look a single top-bordered circle has at this size.
      '.pd-switch-wait{display:inline-flex;align-items:center;justify-content:center;',
      'cursor:progress;transition:background .15s ease;--pd-ink:var(--dsw-alias-label-primary)}',
      '.pd-switch-wait.pd-switch-on{--pd-ink:var(--dsw-alias-label-primary-foreground)}',
      '.pd-ring{position:relative;width:10px;height:10px;box-sizing:border-box}',
      '.pd-ring-base{position:absolute;inset:0;box-sizing:border-box;border-radius:50%;',
      'border:1.5px solid var(--pd-ink);opacity:.22}',
      '.pd-ring-arc{position:absolute;inset:0;box-sizing:border-box;border-radius:50%;',
      'border:1.5px solid transparent;border-top-color:var(--pd-ink);',
      'animation:pd-ring .7s linear infinite}',
      '@keyframes pd-ring{to{transform:rotate(360deg)}}',
      '.pd-mode{appearance:none;border:1px solid var(--dsw-alias-border-l3);background:transparent;border-radius:6px;',
      'font:inherit;font-size:11px;line-height:16px;min-width:46px;height:22px;padding:0 6px;cursor:pointer;white-space:nowrap;',
      'display:inline-flex;align-items:center;justify-content:center;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.pd-mode:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-mode:disabled{opacity:.5;cursor:not-allowed}',
      '.pd-mode-auto{border-color:transparent;background:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}',
      '.pd-mode-auto:hover:not(:disabled){background:var(--dsw-alias-border-l3)}',
      '.pd-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;overflow:hidden}',
      '.pd-seg-item{appearance:none;border:none;background:transparent;font:inherit;font-size:12px;line-height:18px;padding:3px 10px;cursor:pointer;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.pd-seg-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-seg-item:disabled{opacity:.5;cursor:not-allowed}',
      '.pd-seg-on{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground)}',
      '.pd-empty{padding:28px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}',
      '.pd-toast{display:flex;gap:8px;font-size:12px;line-height:18px;padding:8px 12px;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.pd-toast-ok{color:var(--dsw-alias-state-success-primary)}',
      '.pd-toast-busy{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary)}',
      '.pd-toast-warn{color:var(--dsw-alias-state-warn-primary)}',
      '.pd-toast-err{color:var(--dsw-alias-state-error-primary)}',
      '.pd-foot{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);word-break:break-all;margin-top:14px}',
      '.pd-updates{display:flex;flex-direction:column;gap:8px;padding:2px 0}',
      '.pd-update-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.pd-hint{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.pd-update-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:9px;cursor:pointer}',
      '.pd-update-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pd-update-name{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pd-update-ver{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.pd-check{flex:none;width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}',
      '.pd-update-log{padding:10px 12px;border-radius:9px;font-size:12px;line-height:18px;background:var(--dsw-alias-bg-layer-2)}',
      '.pd-update-log-ok{border:1px solid var(--dsw-alias-state-success-primary)}',
      '.pd-update-log-bad{border:1px solid var(--dsw-alias-state-error-primary)}',
      '.pd-update-list{margin-top:6px;display:flex;flex-direction:column;gap:2px}',
      '.pd-update-item{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.pd-update-log-out{margin-top:6px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l3);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-all;max-height:140px;overflow:auto}',
    ].join('');

    function SidebarIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 18;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('rect', {
          x: 2.5,
          y: 3.5,
          width: 19,
          height: 17,
          rx: 3.5,
          stroke: 'currentColor',
          strokeWidth: 1.6,
        }),
        h('rect', { x: 6, y: 7.6, width: 7, height: 2, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 6, y: 14.4, width: 7, height: 2, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 15, y: 6.8, width: 5, height: 3.6, rx: 1.8, fill: 'currentColor' }),
        h('rect', { x: 15, y: 13.6, width: 5, height: 3.6, rx: 1.8, fill: 'currentColor', opacity: 0.35 }),
      );
    }

    function PowerSwitch(props) {
      // While the host unloads and loads the plugin the switch keeps its track
      // and shows a thin ring spinning in the middle. The ring uses the track's
      // own contrast (dark on the grey track, white on the green one), so it
      // stays legible in both states instead of glowing an unrelated colour.
      if (props.pending === true) {
        return h(
          'span',
          {
            className: 'pd-switch pd-switch-wait' + (props.checked ? ' pd-switch-on' : ''),
            role: 'status',
            'aria-label': props.label,
          },
          h(
            'span',
            { className: 'pd-ring' },
            h('span', { className: 'pd-ring-base' }),
            h('span', { className: 'pd-ring-arc' }),
          ),
        );
      }
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.checked,
          'aria-label': props.label,
          disabled: props.disabled,
          className: 'pd-switch' + (props.checked ? ' pd-switch-on' : ''),
          onClick: () => props.onChange(!props.checked),
        },
        h('span', { className: 'pd-knob' }),
      );
    }

    function ModeControl(props) {
      const t = props.t;
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.auto,
          'aria-label': t('colMode') + ': ' + (props.auto ? t('modeAuto') : t('modeManual')),
          disabled: props.disabled,
          className: 'pd-mode' + (props.auto ? ' pd-mode-auto' : ''),
          onClick: () => props.onChange(!props.auto),
        },
        props.auto ? t('modeAuto') : t('modeManual'),
      );
    }

    function makeDashboard(ctx) {
      function useLocale() {
        const [locale, setLocale] = React.useState(() => pickLocale());
        const setLang = React.useCallback((next) => {
          try {
            window.localStorage.setItem(LANG_KEY, next);
          } catch (error) {
            void error;
          }
          setLocale(next);
        }, []);
        return [locale, setLang];
      }

      function Dashboard() {
        const [locale, setLang] = useLocale();
        const t = React.useMemo(() => translator(locale), [locale]);

        const [data, setData] = React.useState(null);
        const [error, setError] = React.useState(null);
        const [busy, setBusy] = React.useState(false);
        const [pending, setPending] = React.useState({});
        const [bulkJob, setBulkRun] = React.useState(null);
        const [toast, setToast] = React.useState(null);
        const [filter, setFilter] = React.useState('all');
        const [query, setQuery] = React.useState('');
        const [tab, setTab] = React.useState('plugins');
        const [collapsed, setCollapsed] = React.useState({ 'plugins': false, 'core': true, 'core-off': true, 'failed': false });
        const [expanded, setExpanded] = React.useState({});
        const [details, setDetails] = React.useState({});
        const [updates, setUpdates] = React.useState(null);
        const [updatesBusy, setUpdatesBusy] = React.useState('');
        const [picked, setPicked] = React.useState({});
        const [updateLog, setUpdateLog] = React.useState(null);
        const [extras, setExtras] = React.useState(null);
        const [extrasBusy, setExtrasBusy] = React.useState('');
        const [extraLog, setExtraLog] = React.useState(null);
        const [filePlan, setFilePlan] = React.useState(null);
        const [logText, setLogText] = React.useState(null);
        const [removable, setRemovable] = React.useState(null);
        const [removableError, setRemovableError] = React.useState('');
        const [confirmUninstall, setConfirmUninstall] = React.useState('');
        const [installSpec, setInstallSpec] = React.useState('');
        const [installBusy, setInstallBusy] = React.useState('');
        const [installInfo, setInstallInfo] = React.useState(null);
        const [installLog, setInstallLog] = React.useState(null);
        const [bulkAsk, setBulkAsk] = React.useState(null);
        // 后台更新任务：更新由宿主执行，面板关掉之后它还在跑。回到这里时把
        // 进度、以及「跑完了没、成没成」接回来，而不是让人去翻日志。
        const [job, setJob] = React.useState(null);

        // 展开过的行，详情只取一次并缓存；但列表一刷新（装了一个、卸了一个、
        // 升级了一个），缓存里那份的版本号与描述就全过时了，所以 load() 会把缓存
        // 整份清掉，还展开着的行由下面的 effect 重新取一次。
        const detailBusy = React.useRef({});

        const fetchDetail = React.useCallback(async (row) => {
          if (detailBusy.current[row.entryId] === true) return;
          detailBusy.current[row.entryId] = true;
          setDetails((prev) => ({ ...prev, [row.entryId]: { status: 'loading' } }));
          try {
            const answer = await request('/detail?entryId=' + encodeURIComponent(row.entryId));
            setDetails((prev) => ({ ...prev, [row.entryId]: { status: 'ready', data: answer } }));
          } catch (error) {
            setDetails((prev) => ({
              ...prev,
              [row.entryId]: {
                status: 'error',
                message: String(error && error.message ? error.message : error),
              },
            }));
          } finally {
            delete detailBusy.current[row.entryId];
          }
        }, []);

        const openDetail = React.useCallback(
          (row) => {
            const next = expanded[row.entryId] !== true;
            setExpanded((prev) => ({ ...prev, [row.entryId]: next }));
            if (next) fetchDetail(row);
          },
          [expanded, fetchDetail],
        );

        const load = React.useCallback(async () => {
          try {
            const next = await request('/state');
            setData(next);
            setError(null);
            // 上面那份列表变了，之前缓存的详情就可能全是旧的。
            setDetails({});
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
          }
        }, []);

        React.useEffect(() => {
          load();
        }, [load]);

        // load() 清掉了详情缓存，把仍然展开着的行重新取一遍，别让它们停在空白上。
        // 依赖里带上 details，是为了在“缓存被清空”的那一次渲染后立刻补回来。
        React.useEffect(() => {
          if (data === null) return;
          for (const entryId of Object.keys(expanded)) {
            if (expanded[entryId] !== true) continue;
            if (details[entryId] !== undefined) continue;
            const row = data.rows.find((candidate) => candidate.entryId === entryId);
            if (row !== undefined) fetchDetail(row);
          }
        }, [expanded, details, data, fetchDetail]);

        const roster = data && Array.isArray(data.roster) ? data.roster : [];
        const isAuto = (row) => row.patchId !== null && roster.indexOf(row.patchId) >= 0;

        const run = React.useCallback(
          async (label, optimistic, call, key) => {
            if (key === undefined) setBusy(true);
            else setPending((prev) => ({ ...prev, [key]: true }));
            setToast(null);
            if (optimistic) setData((prev) => (prev === null ? prev : optimistic(prev)));
            try {
              const next = await call();
              if (next !== null && typeof next === 'object' && next.patch === true) {
                setData((prev) => {
                  if (prev === null) return prev;
                  return {
                    ...prev,
                    rows: prev.rows.map((candidate) =>
                      candidate.entryId === next.row.entryId ? next.row : candidate,
                    ),
                    roster: next.roster,
                  };
                });
                const outcome = next.result;
                if (outcome && outcome.notice !== undefined) {
                  setToast({ kind: 'warn', text: outcome.notice });
                } else if (outcome && outcome.ok === false) {
                  setToast({ kind: 'err', text: label + ': ' + (outcome.message ?? 'failed') });
                }
              } else {
                setData(next);
              }
              return next;
            } catch (failure) {
              setToast({ kind: 'err', text: label + ': ' + (failure instanceof Error ? failure.message : String(failure)) });
              await load();
              return null;
            } finally {
              if (key === undefined) setBusy(false);
              else
                setPending((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });
            }
          },
          [load],
        );

        const togglePower = (row) =>
          run(
            row.name,
            (prev) => ({
              ...prev,
              rows: prev.rows.map((candidate) =>
                candidate.entryId === row.entryId ? { ...candidate, enabled: !row.enabled } : candidate,
              ),
            }),
            () => request('/plugin', { entryId: row.entryId, enabled: !row.enabled }),
            row.entryId,
          );

        const checkUpdates = React.useCallback(async (quiet) => {
          if (updatesBusy !== '') return;
          setUpdatesBusy('check');
          try {
            const next = await request('/updates');
            setUpdates(next);
            const choice = {};
            for (const row of next.rows || []) if (row.hasUpdate) choice[row.name] = true;
            setPicked(choice);
            setUpdateLog(null);
          } catch (error) {
            // 进面板时那一次自动检查失败不弹提示，免得一打开就报错。
            if (quiet !== true) {
              setToast({ kind: 'error', text: t('updateFailed') + ' · ' + String(error && error.message) });
            }
          } finally {
            setUpdatesBusy('');
          }
        }, [updatesBusy, t]);

        const applyUpdates = React.useCallback(async () => {
          if (updatesBusy !== '') return;
          const names = Object.keys(picked).filter((name) => picked[name] === true);
          if (names.length === 0) return;
          setUpdatesBusy('apply');
          setUpdateLog(null);
          try {
            // A registry download per package; the host serializes them under one
            // maintenance hold, so this can legitimately outlive the default budget.
            const next = await request('/updates', { names }, { timeoutMs: WRITE_TIMEOUT_MS });
            setUpdateLog(next);
            // Re-check on success so the list and the tab badge stop advertising
            // updates that were just installed.
            if (next.ok === true) {
              await load();
              await checkUpdates();
            }
          } catch (error) {
            setUpdateLog({ ok: false, message: String(error && error.message) });
          } finally {
            setUpdatesBusy('');
          }
        }, [picked, updatesBusy, load, checkUpdates]);

        const viewLog = React.useCallback(async () => {
          if (logText !== null) {
            setLogText(null);
            return;
          }
          try {
            const next = await request('/updatelog');
            setLogText({ path: next.path, text: next.text });
          } catch (error) {
            setLogText({ path: '', text: null, error: String(error && error.message) });
          }
        }, [logText]);

        // Opening the 更新 page with nothing loaded yet is a dead end unless the
        // panel checks on its own; a registry round trip is cheap and read-only.
        // 列表行里要显示「有新版」角标，所以进面板就查一次（只读、便宜）；失败静默。
        React.useEffect(() => {
          if (updates !== null || updatesBusy !== '') return;
          checkUpdates(true);
        }, [updates, updatesBusy, checkUpdates]);

        const checkExtras = React.useCallback(async (quiet) => {
          if (extrasBusy !== '') return;
          setExtrasBusy('check');
          try {
            setExtras(await request('/extras'));
            setExtraLog(null);
          } catch (error) {
            // 进面板那一次自动检查失败时静默，别一打开就弹错。
            if (quiet !== true) setExtras({ ok: false, message: String(error && error.message) });
          } finally {
            setExtrasBusy('');
          }
        }, [extrasBusy]);

        const applyExtra = React.useCallback(
          async (name, action) => {
            if (extrasBusy !== '') return;
            setExtrasBusy(name);
            setExtraLog(null);
            try {
              const next = await request('/extras', { name, action }, { timeoutMs: WRITE_TIMEOUT_MS });
              setExtraLog({ name, ...next });
              if (next.ok === true) {
                await load();
                await checkExtras();
              }
            } catch (error) {
              setExtraLog({ name, ok: false, message: String(error && error.message) });
            } finally {
              setExtrasBusy('');
            }
          },
          [extrasBusy, load, checkExtras],
        );

        // 本地 file: 包的一键升级。它是唯一一个「先看再动」的两步操作：
        // 第一下只去问目标版本、附件名、体积和官方 sha256（只读，什么都不下载），
        // 看过之后第二下才真的下载 + 校验 + 替换 + 重装。
        const checkFilePlan = React.useCallback(async (name) => {
          setFilePlan({ status: 'loading', name });
          try {
            const plan = await request('/fileplan?name=' + encodeURIComponent(name));
            setFilePlan({ status: 'ready', name, plan });
          } catch (error) {
            setFilePlan({
              status: 'error',
              name,
              message: String(error && error.message ? error.message : error),
            });
          }
        }, []);

        const applyFileUpgrade = React.useCallback(
          async (name) => {
            if (extrasBusy !== '') return;
            setExtrasBusy(name);
            setExtraLog(null);
            try {
              const next = await request(
                '/extras',
                { name, action: 'file-upgrade' },
                { timeoutMs: WRITE_TIMEOUT_MS * 2 },
              );
              setExtraLog({ name, ...next });
              setFilePlan(null);
              if (next.ok === true) {
                await load();
                await checkExtras(true);
              }
            } catch (error) {
              setExtraLog({ name, ok: false, message: String(error && error.message) });
            } finally {
              setExtrasBusy('');
            }
          },
          [extrasBusy, load, checkExtras],
        );

        // 行里那个「v旧 ➡ v新 来源」小按钮：点一下就把这一个包更新掉，不用去「更新」页。
        // npm 精确版本包走 /updates，其他安装方式（github / 压缩包）走 /extras。
        // 这里刻意不走 run()：那个函数会把返回值当成整份快照塞进 data，而这两个接口
        // 返回的是更新结果对象，塞进去整块就废了。
        const applyOne = React.useCallback(
          async (row, info) => {
            if (updatesBusy !== '' || extrasBusy !== '') return;
            // 用独立的 pending 键：更新不该让开关（绿色按钮）跟着转，
            // 转圈的应该是被点击的那个黄色按钮自己。
            const key = 'update:' + row.entryId;
            setPending((prev) => ({ ...prev, [key]: true }));
            setToast(null);
            try {
              const next =
                info.action === 'npm'
                  ? await request('/updates', { names: [row.name] }, { timeoutMs: WRITE_TIMEOUT_MS })
                  : await request('/extras', { name: row.name, action: info.action }, { timeoutMs: WRITE_TIMEOUT_MS });
              if (next.ok === true) {
                setToast({ kind: 'ok', text: t('updateDone') + ' · ' + row.name });
                await load();
                await checkUpdates(true);
                await checkExtras(true);
              } else if (next.waiting === true) {
                setToast({ kind: 'warn', text: String(next.message ?? t('updateWait')) });
              } else {
                setToast({
                  kind: 'err',
                  text: t('updateFailed') + ' · ' + row.name + ' · ' + String(next.message ?? ''),
                });
              }
            } catch (error) {
              setToast({ kind: 'err', text: t('updateFailed') + ' · ' + String(error && error.message) });
            } finally {
              setPending((prev) => {
                const done = { ...prev };
                delete done[key];
                return done;
              });
            }
          },
          [updatesBusy, extrasBusy, load, checkUpdates, checkExtras, t],
        );

        // 「可卸载」名单由宿主给：只有 removable === true 且真挂在 profile 上的包才在里面。
        // 核心组件和面板自己会被服务端直接挡掉，这里只是决定要不要显示按钮。
        const checkRemovable = React.useCallback(async () => {
          try {
            const next = await request('/removable');
            setRemovable(Array.isArray(next.rows) ? next.rows.map((item) => item.name) : []);
            setRemovableError('');
          } catch (error) {
            // 拿不到名单时**不能**把它设成空数组：那会让每一行的「卸载」按钮
            // 无声消失，而且 removable 不再是 null，那个「只取一次」的 effect
            // 再也不会重试 —— 这个功能就永远没了。保持 null，把原因留给人看。
            setRemovableError(String(error && error.message ? error.message : error));
          }
        }, []);

        React.useEffect(() => {
          if (removable !== null) return;
          checkRemovable();
        }, [removable, checkRemovable]);

        // 卸载不可逆，所以做成「第一下变成确认、第二下才真卸」。
        // 刻意不用浏览器原生 confirm —— 面板里弹原生框很丑，也容易被拦。
        const applyUninstall = React.useCallback(
          async (row) => {
            if (confirmUninstall !== row.entryId) {
              setConfirmUninstall(row.entryId);
              return;
            }
            setConfirmUninstall('');
            const key = 'uninstall:' + row.entryId;
            setPending((prev) => ({ ...prev, [key]: true }));
            setToast(null);
            try {
              const next = await request('/uninstall', { name: row.name }, { timeoutMs: WRITE_TIMEOUT_MS });
              if (next.ok === true) {
                setToast({ kind: 'ok', text: t('uninstallDone') + ' · ' + row.name });
                setExpanded((prev) => ({ ...prev, [row.entryId]: false }));
                await load();
                await checkRemovable();
                // 卸掉一个包会改变整份依赖图谱，所以顺手把更新/其他安装方式也重查一遍，
                // 不然列表里会留着上一个包的版本角标。
                await checkUpdates(true);
                await checkExtras(true);
              } else {
                setToast({
                  kind: 'err',
                  text:
                    t('uninstallFailed') +
                    ' · ' +
                    row.name +
                    ' · ' +
                    String(next.message ?? ''),
                });
              }
            } catch (error) {
              setToast({
                kind: 'err',
                text: t('uninstallFailed') + ' · ' + String(error && error.message),
              });
            } finally {
              setPending((prev) => {
                const done = { ...prev };
                delete done[key];
                return done;
              });
            }
          },
          [confirmUninstall, load, checkRemovable, checkUpdates, checkExtras, t],
        );

        // 「检查」只调宿主的 inspect，绝不动任何文件；「安装」才真的装。
        const inspectInstall = React.useCallback(async () => {
          const spec = installSpec.trim();
          if (spec === '' || installBusy !== '') return;
          setInstallBusy('check');
          setInstallInfo(null);
          setInstallLog(null);
          try {
            const next = await request('/inspect?spec=' + encodeURIComponent(spec));
            const found = next.inspection;
            if (next.ok === true && found !== null && typeof found === 'object' && found.status === 'accepted') {
              setInstallInfo({ ok: true, data: found });
            } else {
              setInstallInfo({
                ok: false,
                problem: found !== null && typeof found === 'object' ? String(found.problem ?? '') : '',
                message: String(
                  (found !== null && typeof found === 'object' ? found.reason : '') ?? next.message ?? '',
                ),
              });
            }
          } catch (error) {
            setInstallInfo({ ok: false, problem: '', message: String(error && error.message) });
          } finally {
            setInstallBusy('');
          }
        }, [installSpec, installBusy]);

        const runInstall = React.useCallback(async () => {
          const spec = installSpec.trim();
          if (spec === '' || installBusy !== '') return;
          setInstallBusy('install');
          setInstallLog(null);
          try {
            const next = await request('/install', { spec }, { timeoutMs: WRITE_TIMEOUT_MS });
            setInstallLog({ ok: next.ok === true, data: next });
            if (next.ok === true) {
              const conflictCount = Array.isArray(next.conflicts) ? next.conflicts.length : 0;
              if (conflictCount > 0) {
                setToast({
                  kind: 'warn',
                  text:
                    t('installDone') + ' · ' + spec + ' · ' +
                    t('installConflicts', { n: conflictCount }),
                });
              } else {
                setToast({ kind: 'ok', text: t('installDone') + ' · ' + spec });
              }
              setInstallSpec('');
              setInstallInfo(null);
              await load();
              await checkRemovable();
              // 新装的包也要立刻出现在更新列表里（它可能本来就落后于上游）。
              await checkUpdates(true);
              await checkExtras(true);
            } else if (next.stage === 'build-approval') {
              setToast({ kind: 'warn', text: t('installBuild') });
            }
          } catch (error) {
            setInstallLog({ ok: false, data: { message: String(error && error.message) } });
          } finally {
            setInstallBusy('');
          }
        }, [installSpec, installBusy, load, checkRemovable, checkUpdates, checkExtras, t]);

        // 列表行里也要标出「其他安装方式」那几个包有没有新版，所以同样进面板就查一次。
        React.useEffect(() => {
          if (extras !== null || extrasBusy !== '') return;
          checkExtras(true);
        }, [extras, extrasBusy, checkExtras]);

        const setAuto = (row, auto) =>
          run(
            row.name,
            null,
            () => request('/plugin', { entryId: row.entryId, auto }),
            row.entryId,
          );

        const setGroupAuto = (scope, auto) =>
          run(scope, null, () => request('/roster', { mode: 'group', scope, auto }));

        const bulk = async (enabled, scope, count, save) => {
          const total = typeof count === 'number' ? count : roster.length;
          if (total === 0) {
            setToast({ kind: 'warn', text: t('rosterEmpty') });
            return;
          }
          // Two-step confirmation drawn inside the panel: a native dialog would
          // cover the list the user is deciding about, and it cannot explain
          // what the run will actually touch.
          setBulkAsk({ enabled, scope, total, save: save === true });
        };

        const doBulk = async (ask) => {
          if (ask === null) return;
          setBulkAsk(null);
          const { enabled, scope, total, save } = ask;
          let accepted;
          try {
            accepted = await request('/bulk', {
              enabled,
              scope: typeof scope === 'string' ? scope : '',
              save: save === true,
            });
          } catch (failure) {
            setToast({ kind: 'err', text: String(failure && failure.message ? failure.message : failure) });
            return;
          }

          const notes = [];
          if (accepted.unchanged > 0) notes.push(t('withUnchanged', { n: accepted.unchanged }));
          if (accepted.guarded > 0) notes.push(t('withGuarded', { n: accepted.guarded }));

          if (accepted.total === 0) {
            // Nothing to do: say so instead of polling a job that never started.
            setToast({ kind: 'ok', text: [t('nothingToDo')].concat(notes).join(' · ') });
            return;
          }

          if (accepted.saved === true) {
            // `save` only writes the profile file; there is no background run
            // to poll and nothing changes until the next restart.
            setToast({ kind: 'ok', text: [t('saveApplied')].concat(notes).join(' · ') });
            await load();
            return;
          }

          // The Host answers immediately and works through the rows behind this
          // panel; /state carries the progress while it runs.
          setBulkRun({ enabled: accepted.enabled, total: accepted.total, finished: 0, failed: 0, notes: notes });
          await load();
        };

        const bulkRun = data && data.bulk && data.bulk.running === true ? data.bulk : null;
        const running = bulkRun !== null;
        const settled = data && data.bulk && data.bulk.running === false ? data.bulk : null;

        // Poll only while the Host says it is working. `bulkJob` marks that a run
        // was accepted but /state has not confirmed it yet, so the first tick
        // cannot be missed; it is cleared as soon as a run settles.
        const waiting = bulkJob !== null && data !== null;
        React.useEffect(() => {
          if (!running && !waiting) return undefined;
          const timer = setInterval(() => {
            load();
          }, 1200);
          return () => clearInterval(timer);
        }, [running, waiting, load]);

        // 失败行不会自己消失：插件热修复后 phase 会从 failed 回到 active，
        // 不轮询就永远停在红标上。但只有在真出过失败时才轮，平时不打扰服务端。
        const hasFailed = data !== null && Array.isArray(data.rows) && data.rows.some((row) => row.phase === 'failed');
        React.useEffect(() => {
          if (!hasFailed) return undefined;
          const timer = setInterval(() => {
            load();
          }, 5000);
          return () => clearInterval(timer);
        }, [hasFailed, load]);

        // 宿主的后台任务（POST /updates、POST /extras）。这个轮询常驻：面板被
        // 关掉时更新的结局没人接，重新打开只能靠它补一次，顺便把列表演一遍。
        const seenJob = React.useRef(null);
        React.useEffect(() => {
          let alive = true;
          const tick = async () => {
            try {
              const answer = await request('/job');
              if (!alive) return;
              const current = answer.job === undefined ? null : answer.job;
              setJob(current);
              if (current === null || current.finishedAt === null) return;
              if (seenJob.current === null) {
                try {
                  seenJob.current = window.localStorage.getItem(JOB_SEEN_KEY) || '';
                } catch (error) {
                  void error;
                  seenJob.current = '';
                }
              }
              if (seenJob.current === current.id) return;
              seenJob.current = current.id;
              try {
                window.localStorage.setItem(JOB_SEEN_KEY, current.id);
              } catch (error) {
                void error;
              }
              // 只报十分钟内结束的那次：几周前的旧结果不该在打开面板时冒出来。
              const age = Date.now() - Date.parse(current.finishedAt);
              if (Number.isFinite(age) && age > 10 * 60 * 1000) return;
              if (current.ok === true) {
                setToast({ kind: 'ok', text: t('jobDone') });
              } else if (current.interrupted === true) {
                setToast({ kind: 'warn', text: t('jobInterrupted') });
              } else {
                const detail = typeof current.message === 'string' && current.message.length > 0 ? ': ' + current.message : '';
                setToast({ kind: 'warn', text: t('jobFailed') + detail });
              }
              checkUpdates(true);
              load();
            } catch (error) {
              // 宿主正在重启时这里会失败，下一跳再试。
              void error;
            }
          };
          tick();
          const timer = setInterval(tick, 5000);
          return () => {
            alive = false;
            clearInterval(timer);
          };
        }, [t, load, checkUpdates]);

        // 下载卡住时用户得能自己踩刹车，不然这条横幅会一直转到宿主超时。
        const cancelJob = async () => {
          try {
            await request('/job', { action: 'cancel' });
          } catch (error) {
            setToast({ kind: 'warn', text: error instanceof Error ? error.message : String(error) });
          }
        };

        // Report the settled run once, then drop the local marker.
        const settledKey = settled === null ? null : settled.finished + '/' + settled.total + '/' + settled.failed;
        React.useEffect(() => {
          if (settled === null || bulkJob === null) return;
          const parts = [];
          if (settled.failed > 0) parts.push(t('withFailures', { n: settled.failed }));
          else parts.push(t('done') + ' · ' + (settled.total - settled.failed) + '/' + settled.total);
          if (settled.unchanged > 0) parts.push(t('withUnchanged', { n: settled.unchanged }));
          if (settled.guarded > 0) parts.push(t('withGuarded', { n: settled.guarded }));
          setToast({ kind: settled.failed > 0 ? 'warn' : 'ok', text: parts.join(' · ') });
          setBulkRun(null);
        }, [settledKey, bulkJob]);

        if (error !== null) {
          const unreachable = error === 'unreachable';
          return h(
            'div',
            { className: 'pd-root' },
            h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
            h('div', { className: 'pd-title' }, t('title')),
            h('div', { className: 'pd-toast pd-toast-err' }, t('loadFailed') + ': ' + (unreachable ? t('hostMissing') : error)),
            h(
              'div',
              { className: 'pd-bar' },
              h('button', { type: 'button', className: 'pd-btn', onClick: load }, t('refresh')),
            ),
          );
        }

        if (data === null) {
          return h(
            'div',
            { className: 'pd-root' },
            h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
            h('div', { className: 'pd-title' }, t('title')),
            h('div', { className: 'pd-empty' }, '...'),
          );
        }

        const needle = query.trim().toLowerCase();
        const matches = (row) => {
          if (needle.length === 0) return true;
          const haystack = (row.name + ' ' + row.moduleName + ' ' + row.entryId).toLowerCase();
          return haystack.indexOf(needle) >= 0;
        };
        const stateOk = (row) => {
          if (filter === 'enabled') return row.enabled;
          if (filter === 'disabled') return !row.enabled;
          if (filter === 'auto') return isAuto(row);
          return true;
        };
        const byName = (a, b) => a.name.localeCompare(b.name);

        // 核心组件与异常各自成页，主列表只放真正安装的插件。
        const isPlugin = (row) => !row.official && row.phase !== 'failed';
        const isCore = (row) => row.official && row.phase !== 'failed';
        const isFailed = (row) => row.phase === 'failed';

        const pageRows = (key) =>
          key === 'updates'
            ? []
            : key === 'core'
              ? data.rows.filter(isCore)
              : key === 'failed'
                ? data.rows.filter(isFailed)
                : data.rows.filter(isPlugin);

        const pages = [
          { key: 'plugins', title: t('tabPlugins') },
          { key: 'core', title: t('tabCore') },
          { key: 'failed', title: t('tabFailed') },
          { key: 'updates', title: t('tabUpdates'), badge: updates === null ? null : updates.updates },
        ].map((page) => ({ ...page, rows: pageRows(page.key) }));

        const current = pages.find((page) => page.key === tab) || pages[0];

        const makeGroup = (key, title, scope, rows, options) => ({
          key: key,
          title: title,
          scope: scope,
          rows: rows.filter((row) => matches(row) && stateOk(row)).sort(byName),
          showBulk: !options || options.showBulk !== false,
        });

        // The core page splits in two: tools the harness still runs, and tools a
        // bundle (dsh-ops' hideOfficialTools) has switched off on purpose. The
        // second set looks alarming in a flat list, so it folds away by default.
        const groups =
          current.key === 'core'
            ? [
                makeGroup(current.key, current.title, 'core', current.rows.filter((row) => row.enabled)),
                makeGroup(
                  current.key + '-off',
                  t('groupCoreHidden'),
                  'core',
                  current.rows.filter((row) => !row.enabled),
                  { showBulk: false },
                ),
              ].filter((group) => group.rows.length > 0)
            : [
                makeGroup(
                  current.key,
                  current.title,
                  current.key === 'plugins' ? 'installed' : current.key,
                  current.rows,
                ),
              ].filter((group) => group.rows.length > 0);

        const visibleCount = groups.reduce((sum, group) => sum + group.rows.length, 0);

        const counts = { total: current.rows.length, auto: 0, on: 0, off: 0 };
        for (const row of current.rows) {
          if (row.enabled) counts.on += 1;
          else counts.off += 1;
          if (isAuto(row)) counts.auto += 1;
        }

        const statItem = (key, content) =>
          h(
            'button',
            {
              type: 'button',
              className: 'pd-stat' + (filter === key ? ' pd-stat-on' : ''),
              'aria-pressed': filter === key,
              onClick: () => setFilter(filter === key ? 'all' : key),
            },
            content,
          );

        // 有新版就直接标在行里（开关左边那一列），不用专门去「更新」页看。
        // 两个来源都算上：「检查更新」的精确版本包（npm），和「其他安装方式」里查到新版的包。
        // 每一项记 { label, source, action }：label 是箭头后面显示的版本，source 是
        // 「从哪儿下的」（npm / github / npmmirror…），action 决定点一下走哪个接口。
        // 注意：这里**刻意不用 useMemo**——组件在 data===null 时会提前 return，
        // 任何 hook 放到那之后，都会让两次渲染的 hook 数量不一致，整块直接崩掉。
        // 数据只有几十条，直接算就好。
        const sourceOf = (spec) => {
          const text = typeof spec === 'string' ? spec : '';
          const matched = /^https?:\/\/([^/]+)/.exec(text);
          if (matched === null) return 'tarball';
          const host = matched[1].toLowerCase();
          if (host.indexOf('npmmirror') >= 0) return 'npmmirror';
          if (host.indexOf('npmjs') >= 0) return 'npm';
          if (host.indexOf('github') >= 0 || host.indexOf('codeload') >= 0) return 'github';
          return host;
        };
        // 每一行的「这东西是怎么装的」也要在主页面看得到，所以同一份数据里
        // 再收一张「名字 → 来源」表：精确版本的是 npm，其他按 extras 报上来的
        // kind 分（github / 压缩包域名 / 本地文件包 / 本地软链）。
        const srcLabelOf = (item) => {
          if (item.kind === 'github') return 'github';
          if (item.kind === 'tarball') return sourceOf(item.spec);
          if (item.kind === 'file') return t('srcLocalFile');
          if (item.kind === 'link') return t('srcLocalLink');
          return t('srcOther');
        };
        const srcOf = new Map();
        const updateOf = new Map();
        if (updates !== null && Array.isArray(updates.rows)) {
          for (const item of updates.rows) {
            if (typeof item.name !== 'string') continue;
            srcOf.set(item.name, 'npm');
            if (item.hasUpdate === true && typeof item.latest === 'string') {
              updateOf.set(item.name, { label: 'v' + item.latest, source: 'npm', action: 'npm' });
            }
          }
        }
        if (extras !== null && Array.isArray(extras.rows)) {
          for (const item of extras.rows) {
            if (typeof item.name !== 'string') continue;
            srcOf.set(item.name, srcLabelOf(item));
            if (item.hasUpdate !== true) continue;
            const head = item.head;
            const release = item.latestRelease;
            if (item.kind === 'github' && head !== null && typeof head === 'object' && typeof head.sha === 'string') {
              updateOf.set(item.name, { label: head.sha.slice(0, 7), source: 'github', action: 'repull' });
            } else if (item.kind === 'tarball' && typeof item.npmLatest === 'string') {
              updateOf.set(item.name, {
                label: 'v' + item.npmLatest,
                source: sourceOf(item.spec),
                action: 'pin',
              });
            } else if (
              item.kind === 'file' &&
              release !== null &&
              typeof release === 'object' &&
              typeof release.version === 'string'
            ) {
              // 本地压缩包走 /extras 的 file-upgrade：下载官方附件、核对 sha256、
              // 替换 vendor 里的文件再重装，失败会整块回滚，所以这里可以一键。
              updateOf.set(item.name, {
                label: 'v' + release.version,
                source: 'github',
                action: 'file-upgrade',
              });
            }
          }
        }

        const rowNode = (row) => {
          const auto = isAuto(row);
          const locked = !row.manageable;
          const selfLocked = row.self === true;
          const isOpen = expanded[row.entryId] === true;
          const detail = details[row.entryId] || {};
          const pkg = detail.data && detail.data.package ? detail.data.package : null;
          const desc = row.description || (pkg === null ? null : pkg.description);
          const tags = [];
          if (row.self) tags.push(h('span', { key: 'self', className: 'pd-tag' }, t('selfTag')));
          if (locked) {
            tags.push(
              h(
                'span',
                { key: 'locked', className: 'pd-tag' },
                t('readOnly') + ' · ' + t(row.readOnlyReason === 'management-required' ? 'rawManagement' : 'rawUnaddressable'),
              ),
            );
          }
          // The switch already spins while this row is switching, so a tag here
          // would be a second loading indicator for one action. One is enough.
          if (row.phase === 'failed') {
            tags.push(h('span', { key: 'failed', className: 'pd-tag pd-tag-err' }, t('failed')));
          } else if (row.phase === 'pending' || row.phase === 'loading') {
            tags.push(h('span', { key: 'loading', className: 'pd-tag pd-tag-warn' }, t('loading')));
          }
          // The raw entry id (`include:genui`) is an internal handle, not
          // something a user needs in the list. Only a real diagnostic or a
          // short Chinese label is worth showing here.
          const subtitle = row.diagnostic || row.description || null;
          const facts = [
            [t('dModule'), row.moduleName],
            [t('dEntry'), row.entryId],
            [t('dPatch'), row.patchId || '—'],
            [
              t('dPhase'),
              row.phase === 'failed'
                ? t('phaseFailed')
                : row.phase === 'pending' || row.phase === 'loading'
                  ? t('phaseLoading')
                  : row.enabled
                    ? t('phaseActive')
                    : t('phaseOff'),
            ],
            [t('dMode'), auto ? t('dModeAuto') : t('dModeManual')],
            [t('dOfficial'), row.official ? t('yes') : t('no')],
            [t('dManageable'), row.manageable ? t('yes') : t('no')],
          ];
          if (row.readOnlyReason) {
            facts.push([
              t('dReason'),
              row.readOnlyReason === 'management-required' ? t('reasonManagement') : t('reasonUnaddressable'),
            ]);
          }
          if (row.diagnostic) facts.push([t('dDiagnostic'), row.diagnostic]);
          if (pkg) {
            if (pkg.version) facts.push([t('dVersion'), pkg.version]);
            if (pkg.license) facts.push([t('dLicense'), pkg.license]);
            if (pkg.author) facts.push([t('dAuthor'), pkg.author]);
            if (pkg.dir) facts.push([t('dDir'), pkg.dir]);
            if (Array.isArray(pkg.dependencies) && pkg.dependencies.length > 0) {
              facts.push([t('dDeps'), pkg.dependencies.join(', ')]);
            }
          }

          const links = [];
          // 仓库、npm 主页、作者主页都列出来；同一个地址只出现一次。
          const seenHref = new Set();
          const addLink = (label, href) => {
            if (typeof href !== 'string' || href === '') return;
            if (seenHref.has(href)) return;
            seenHref.add(href);
            links.push({ label, href });
          };
          if (pkg) {
            addLink('GitHub', pkg.github);
            addLink('npm', pkg.npmUrl);
            addLink(t('homepage'), pkg.homepage);
          }

          return h(
            'div',
            { className: 'pd-item', key: row.entryId },
            h(
              'div',
              {
                className:
                  'pd-row' + (isOpen ? ' pd-row-open' : '') + (row.phase === 'failed' ? ' pd-row-failed' : ''),
                onClick: () => {
                  openDetail(row);
                },
              },
              (() => {
                // 状态点：颜色即语义，title 写一句话说明，失败的行已经被整行染红。
                const failed = row.phase === 'failed';
                const loading = row.phase === 'pending' || row.phase === 'loading';
                const state = failed
                  ? 'failed'
                  : loading
                    ? 'loading'
                    : locked
                      ? 'readonly'
                      : row.enabled
                        ? 'running'
                        : 'off';
                const label =
                  state === 'failed'
                    ? t('phaseFailed')
                    : state === 'loading'
                      ? t('phaseLoading')
                      : state === 'readonly'
                        ? t('readOnly')
                        : state === 'running'
                          ? t('phaseActive')
                          : t('phaseOff');
                return h('span', {
                  className: 'pd-dot-status pd-dot-' + state,
                  title: label,
                  'aria-label': label,
                });
              })(),
              h(
                'div',
                { className: 'pd-name' },
                h('div', { className: 'pd-name-main', title: row.moduleName }, row.name),
                row.version ? h('span', { className: 'pd-version' }, 'v' + row.version) : null,
                subtitle === null
                  ? null
                  : h('div', { className: 'pd-name-sub', title: subtitle }, subtitle),
                tags.length > 0 ? h('div', { className: 'pd-tags' }, tags) : null,
              h(
                'div',
                { className: 'pd-name-act', onClick: (event) => event.stopPropagation() },
                (() => {
                  const info = updateOf.get(row.name);
                  if (info === undefined) {
                    const src = srcOf.get(row.name);
                    // 普通 npm 装的是默认情况，标出来只是噪音；只有「不是按常规方式
                    // 装的」才值得在主列表里露一个标签。
                    return src === undefined || src === 'npm' ? null : h('span', { className: 'pd-src' }, src);
                  }
                  const updating = pending['update:' + row.entryId] === true;
                  const parts = [
                    updating ? h('span', { key: 'spin', className: 'pd-spin pd-upbtn-spin' }) : null,
                    'v' + (row.version ?? '?'),
                    h('span', { key: 'arrow', className: 'pd-upbtn-arrow' }, '➡'),
                    info.label,
                    h('span', { key: 'src', className: 'pd-upbtn-src' }, info.source),
                  ];
                  const label =
                    t('updateNow') + '（' + info.source + '）：v' + (row.version ?? '?') + ' → ' + info.label;
                  return h(
                    'button',
                    {
                      type: 'button',
                      className: 'pd-upbtn',
                      disabled: busy || updating || pending[row.entryId] === true,
                      title: label,
                      onClick: () => {
                        applyOne(row, info);
                      },
                    },
                    parts,
                  );
                })(),
              ),
              ),
              h(
                'div',
                {
                  className: 'pd-cell pd-cell-power',
                  onClick: (event) => event.stopPropagation(),
                  title: selfLocked ? t('selfLocked') : undefined,
                },
                h(PowerSwitch, {
                  checked: row.enabled,
                  pending: pending[row.entryId] === true,
                  disabled: locked || selfLocked || pending[row.entryId] === true,
                  label: row.name + ' — ' + t('colPower'),
                  onChange: () => togglePower(row),
                }),
              ),
              h(
                'div',
                { className: 'pd-cell pd-cell-mode', onClick: (event) => event.stopPropagation() },
                h(ModeControl, {
                  auto: auto,
                  disabled: locked || pending[row.entryId] === true,
                  t: t,
                  onChange: (next) => setAuto(row, next),
                }),
              ),
              // 行尾卸载入口：一个垃圾桶图标，平时灰色、hover 变红；
              // 复用 applyUninstall 的「点一下变确认、再点才真卸」两步流程。
              // 只有宿主说 removable 的行才有图标；其余行渲染一个空占位，
              // 占住同一列，保证所有行的开关/模式/箭头都对齐。
              removable !== null && removable.indexOf(row.name) >= 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className:
                        'pd-row-uninstall' +
                        (confirmUninstall === row.entryId ? ' pd-row-uninstall-confirm' : ''),
                      disabled:
                        pending['uninstall:' + row.entryId] === true || busy || installBusy !== '',
                      title: t('uninstallTitle'),
                      'aria-label': t('uninstall') + ' ' + row.name,
                      onClick: (event) => {
                        event.stopPropagation();
                        applyUninstall(row);
                      },
                    },
                    pending['uninstall:' + row.entryId] === true
                      ? h('span', { className: 'pd-spin' })
                      : h(
                          'svg',
                          {
                            width: 14,
                            height: 14,
                            viewBox: '0 0 14 14',
                            fill: 'none',
                            'aria-hidden': true,
                          },
                          h('path', {
                            d: 'M2.5 3.5 h9 M5.5 3.5 v-1 h3 v1 M4 3.5 l.5 8 h5 l.5 -8 M6 6 v3.5 M8 6 v3.5',
                            stroke: 'currentColor',
                            strokeWidth: 1.2,
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                          }),
                        ),
                  )
                : h('span', null),
              h(
                'button',
                {
                  type: 'button',
                  className: 'pd-row-chev',
                  'data-collapsed': isOpen ? 'false' : 'true',
                  'aria-expanded': isOpen,
                  'aria-label': t('detail'),
                  title: t('detail'),
                  onClick: () => {
                    openDetail(row);
                  },
                },
                h(
                  'svg',
                  { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
                  h('path', {
                    d: 'M2 4.2 L6 8 L10 4.2',
                    stroke: 'currentColor',
                    strokeWidth: 1.4,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  }),
                ),
              ),
            ),
            isOpen
              ? h(
                  'div',
                  { className: 'pd-detail' },
                  links.length > 0
                    ? h(
                        'div',
                        { className: 'pd-fact' },
                        h('span', { className: 'pd-fact-k' }, t('links')),
                        h(
                          'span',
                          { className: 'pd-fact-v' },
                          links.flatMap((link, index) =>
                            index === 0
                              ? [
                                  h(
                                    'a',
                                    {
                                      key: link.href,
                                      className: 'pd-link',
                                      href: link.href,
                                      target: '_blank',
                                      rel: 'noreferrer',
                                    },
                                    link.label,
                                  ),
                                ]
                              : [
                                  h('span', { key: link.href + ':dot', className: 'pd-dot' }, ' · '),
                                  h(
                                    'a',
                                    {
                                      key: link.href,
                                      className: 'pd-link',
                                      href: link.href,
                                      target: '_blank',
                                      rel: 'noreferrer',
                                    },
                                    link.label,
                                  ),
                                ],
                          ),
                        ),
                      )
                    : null,
                  facts.map(([label, value]) =>
                    h(
                      'div',
                      { className: 'pd-fact', key: label },
                      h('span', { className: 'pd-fact-k' }, label),
                      h('span', { className: 'pd-fact-v', title: String(value) }, String(value)),
                    ),
                  ),
                  desc === null
                    ? null
                    : h(
                        'div',
                        { className: 'pd-fact pd-fact-block' },
                        h('span', { className: 'pd-fact-k' }, t('dFunction')),
                        h('span', { className: 'pd-fact-v pd-desc' }, desc),
                      ),
                  detail.status === 'error'
                    ? h('div', { className: 'pd-note' }, t('detailFail') + ' · ' + detail.message)
                    : null,
                  detail.status === 'loading'
                    ? h('div', { className: 'pd-note' }, t('loading'))
                    : null,
                  removable !== null && removable.indexOf(row.name) >= 0
                    ? h(
                        'div',
                        { className: 'pd-fact pd-fact-block' },
                        h('span', { className: 'pd-fact-k' }, t('uninstall')),
                        h(
                          'span',
                          { className: 'pd-fact-v pd-uninstall' },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'pd-btn pd-btn-danger',
                              disabled:
                                pending['uninstall:' + row.entryId] === true ||
                                busy ||
                                installBusy !== '',
                              onClick: () => {
                                applyUninstall(row);
                              },
                            },
                            pending['uninstall:' + row.entryId] === true
                              ? t('uninstallRunning')
                              : confirmUninstall === row.entryId
                                ? t('uninstallConfirm')
                                : t('uninstall'),
                          ),
                          h(
                            'span',
                            { className: 'pd-note pd-note-inline' },
                            row.name === 'dsh-our-free-model'
                              ? t('uninstallFreeModel')
                              : t('uninstallWarn'),
                          ),
                        ),
                      )
                    : removable === null && removableError !== ''
                      ? h(
                          'div',
                          { className: 'pd-note' },
                          t('uninstallUnavailable') + ' · ' + removableError + ' ',
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'pd-btn',
                              onClick: () => {
                                checkRemovable();
                              },
                            },
                            t('refresh'),
                          ),
                        )
                      : null,
                )
              : null,
          );
        };

        const groupNode = (group) => {
          const isCollapsed = collapsed[group.key] === true;
          const allLocked = group.rows.length > 0 && group.rows.every((row) => !row.manageable);
          // The server acts on 自动清单 ∩ 页面范围, not on what the search box
          // happens to show, so the confirm dialog must count that set —
          // group.rows is the filtered view and can understate it badly.
          const autoInScope = current.rows.filter(
            (row) => row.manageable && isAuto(row) && !row.self,
          ).length;
          return h(
            'div',
            { className: 'pd-group', key: group.key },
            h(
              'div',
              { className: 'pd-group-head', 'data-collapsed': isCollapsed ? 'true' : 'false' },
              h('div', { className: 'pd-title-row' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'pd-chevron',
                  'data-collapsed': isCollapsed ? 'true' : 'false',
                  'aria-expanded': !isCollapsed,
                  'aria-label': group.title,
                  onClick: () => setCollapsed((prev) => ({ ...prev, [group.key]: !isCollapsed })),
                },
                h(
                  'svg',
                  { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true },
                  h('path', {
                    d: 'M2 4.2 L6 8 L10 4.2',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: 1.4,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  }),
                ),
              ),
              h('div', { className: 'pd-group-title' }, group.title),
              h('div', { className: 'pd-group-count' }, String(group.rows.length)),
              ),
              group.showBulk === false
                ? h('div', { className: 'pd-group-note' }, t('groupCoreHiddenNote'))
                : h(
                    'div',
                    { className: 'pd-colhead', onClick: (event) => event.stopPropagation() },
                    h('span', null),
                    h(
                      'div',
                      { className: 'pd-group-bulk' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pd-btn pd-btn-sm pd-btn-primary',
                    // Nothing on this page is marked 自动, so the one-click
                    // actions would do nothing. Grey them out instead of
                    // letting the user fire an empty run.
                    disabled: busy || allLocked || running || autoInScope === 0,
                    title: autoInScope === 0 ? t('rosterEmpty') : undefined,
                    onClick: () => bulk(true, group.scope, autoInScope),
                  },
                  t('enableAll'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pd-btn pd-btn-sm pd-btn-danger',
                    disabled: busy || allLocked || running || autoInScope === 0,
                    title: autoInScope === 0 ? t('rosterEmpty') : undefined,
                    onClick: () => bulk(false, group.scope, autoInScope),
                  },
                  t('disableAll'),
                ),
                // 「整批一次」按钮从这里删掉了：更新流程本来就内嵌了整批热替换
                // (applyUpdates -> hotSwapUpdated)，主列表不需要常驻入口；
                // server 端 /bulk save:true API 保留，真要用加个开关就能回来。
                h('span', { className: 'pd-group-bulk-sep' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pd-btn pd-btn-sm',
                    disabled: busy || running,
                    onClick: () => setGroupAuto(group.scope, true),
                  },
                  t('markAllAuto'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pd-btn pd-btn-sm',
                    disabled: busy || running,
                    onClick: () => setGroupAuto(group.scope, false),
                  },
                  t('markNoneAuto'),
                ),
                    ),
                    h('span', { className: 'pd-colhead-label' }, t('colPower')),
                    h('span', { className: 'pd-colhead-label' }, t('colMode')),
                    h('span', null),
                    h('span', null),
                  ),
            ),
            isCollapsed ? null : h('div', null, group.rows.map(rowNode)),
          );
        };

        const pickedNames = Object.keys(picked).filter((name) => picked[name] === true);
        const updateRowNode = (row) =>
          h(
            'label',
            { key: row.name, className: 'pd-update-row' },
            h('input', {
              type: 'checkbox',
              className: 'pd-check',
              checked: picked[row.name] === true,
              disabled: updatesBusy !== '',
              onChange: () =>
                setPicked((prev) => ({ ...prev, [row.name]: prev[row.name] !== true })),
            }),
            h('span', { className: 'pd-update-name' }, row.name),
            h('span', { className: 'pd-update-ver' }, row.current + ' → ' + row.latest),
          );

        const shortSha = (value) => (typeof value === 'string' ? value.slice(0, 7) : '');

        const extraRowNode = (row) => {
          const busyHere = extrasBusy === row.name;
          const newer = row.kind === 'github' ? row.head !== null && row.installedCommit !== row.head.sha : row.hasUpdate === true;
          let compare;
          if (row.kind === 'github') {
            compare =
              row.head === null
                ? String(row.error || t('extrasUnknown'))
                : shortSha(row.installedCommit || '') + ' → ' + shortSha(row.head.sha) +
                  (row.head.date ? ' · ' + String(row.head.date).slice(0, 10) : '');
          } else if (row.kind === 'tarball') {
            compare = row.npmLatest === null ? String(row.error || t('extrasUnknown')) : row.current + ' → ' + row.npmLatest;
          } else if (row.kind === 'link') {
            compare = t('extrasLink');
          } else if (row.latestRelease !== null && typeof row.latestRelease === 'object') {
            compare =
              'v' + String(row.current ?? '?') + ' → v' + row.latestRelease.version + ' · ' + t('extrasFile');
          } else {
            // file: 装的本地压缩包；没找到仓库或对方没发过 Release，就只报本地版本
            compare = (row.current ? 'v' + row.current + ' · ' : '') + t('extrasFile');
          }
          return h(
            'div',
            { key: row.name, className: 'pd-update-row' },
            h('span', { className: 'pd-update-name' }, row.name),
            h('span', { className: 'pd-update-ver' }, compare),
            row.kind === 'github'
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'pd-btn',
                    disabled: extrasBusy !== '' || newer !== true,
                    onClick: () => applyExtra(row.name, 'repull'),
                  },
                  busyHere ? '…' : newer === true ? t('extrasRepull') : t('extrasNoNewer'),
                )
              : row.kind === 'tarball'
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'pd-btn',
                      disabled: extrasBusy !== '' || newer !== true,
                      onClick: () => applyExtra(row.name, 'pin'),
                    },
                    busyHere ? '…' : newer === true ? t('extrasPin') : t('extrasNoNewer'),
                  )
                : row.kind === 'file' && row.latestRelease !== null && typeof row.latestRelease === 'object'
                  ? h(
                      'span',
                      { className: 'pd-fileacts' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'pd-btn pd-btn-primary',
                          disabled: extrasBusy !== '' || newer !== true,
                          onClick: () => {
                            const planned =
                              filePlan !== null &&
                              filePlan.name === row.name &&
                              filePlan.status === 'ready' &&
                              filePlan.plan !== null &&
                              filePlan.plan.ok === true;
                            if (planned) applyFileUpgrade(row.name);
                            else checkFilePlan(row.name);
                          },
                        },
                        busyHere
                          ? t('fileUpgradeRunning')
                          : filePlan !== null &&
                              filePlan.name === row.name &&
                              filePlan.status === 'ready' &&
                              filePlan.plan !== null &&
                              filePlan.plan.ok === true
                            ? t('fileUpgradeConfirm')
                            : t('fileUpgrade'),
                      ),
                      h(
                        'a',
                        {
                          className: 'pd-btn',
                          href:
                            typeof row.latestRelease.url === 'string' ? row.latestRelease.url : 'https://github.com',
                          target: '_blank',
                          rel: 'noreferrer',
                          title: t('extrasOpenRelease'),
                        },
                        t('extrasOpenRelease'),
                      ),
                    )
                  : null,
            filePlan !== null && filePlan.name === row.name
              ? h(
                  'span',
                  { className: 'pd-hint pd-fileplan' },
                  filePlan.status === 'loading'
                    ? t('updateChecking')
                    : filePlan.status === 'error'
                      ? t('updateFailed') + ' · ' + String(filePlan.message || '')
                      : filePlan.plan !== null && filePlan.plan.ok === true
                        ? t('fileUpgradePlan') +
                          ' ' +
                          filePlan.plan.target.asset.name +
                          ' · ' +
                          Math.round(Number(filePlan.plan.target.asset.size || 0) / 1048576) +
                          ' MB · ' +
                          t('fileUpgradeSha') +
                          ' ' +
                          String(filePlan.plan.target.sha256).slice(0, 16) +
                          '…'
                        : t('updateFailed') + ' · ' + String((filePlan.plan && filePlan.plan.message) || ''),
                )
              : null,
            row.kind === 'github' && row.head !== null && row.head.message !== null
              ? h('span', { className: 'pd-hint' }, row.head.message)
              : null,
          );
        };

        const extrasRows = extras === null || extras.ok !== true ? [] : extras.rows || [];

        const installPanel = h(
          'div',
          { className: 'pd-updates' },
          h(
            'div',
            { className: 'pd-install-head' },
            h('span', { className: 'pd-install-label' }, t('installTitle')),
            h('input', {
              className: 'pd-input pd-install-input',
              type: 'text',
              value: installSpec,
              placeholder: t('installSpecPlaceholder'),
              onChange: (event) => {
                setInstallSpec(event.target.value);
                setInstallInfo(null);
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter') inspectInstall();
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'pd-btn',
                disabled: installBusy !== '' || installSpec.trim() === '',
                onClick: inspectInstall,
              },
              installBusy === 'check' ? t('updateChecking') : t('installCheck'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'pd-btn pd-btn-primary',
                disabled: installBusy !== '' || installSpec.trim() === '',
                onClick: runInstall,
              },
              installBusy === 'install' ? t('installRunning') : t('installRun'),
            ),
          ),
          h('div', { className: 'pd-hint' }, t('installHint')),
          installInfo === null
            ? null
            : installInfo.ok === true
              ? h(
                  'div',
                  { className: 'pd-update-log pd-update-log-ok' },
                  t('installOk') +
                    ' · ' +
                    String(installInfo.data.name ?? '') +
                    (typeof installInfo.data.version === 'string'
                      ? ' v' + installInfo.data.version
                      : '') +
                    (typeof installInfo.data.kind === 'string' ? ' · ' + installInfo.data.kind : '') +
                    (typeof installInfo.data.description === 'string' && installInfo.data.description !== ''
                      ? ' · ' + installInfo.data.description
                      : ''),
                )
              : h(
                  'div',
                  { className: 'pd-update-log pd-update-log-bad' },
                  t('installRefused') +
                    (installInfo.problem !== '' ? ' · ' + installInfo.problem : '') +
                    (installInfo.message !== '' ? ' · ' + installInfo.message : ''),
                ),
          installLog === null
            ? null
            : h(
                'div',
                { className: 'pd-update-log ' + (installLog.ok ? 'pd-update-log-ok' : 'pd-update-log-bad') },
                installLog.ok ? t('installDone') : t('updateFailed'),
                installLog.data.message ? ' · ' + String(installLog.data.message) : '',
                Array.isArray(installLog.data.pendingBuilds) && installLog.data.pendingBuilds.length > 0
                  ? ' · ' + installLog.data.pendingBuilds.join(', ')
                  : '',
                typeof installLog.data.output === 'string' && installLog.data.output !== ''
                  ? h('pre', { className: 'pd-update-log-out' }, installLog.data.output.slice(-1500))
                  : null,
              ),
        );

        const extrasPanel = h(
          'div',
          { className: 'pd-updates' },
          h(
            'div',
            { className: 'pd-update-bar' },
            h('b', null, t('extrasTitle')),
            h('span', { className: 'pd-hint' }, t('extrasHint')),
          ),
          extras === null
            ? h('div', { className: 'pd-empty' }, extrasBusy === 'check' ? t('updateChecking') : t('updateIdle'))
            : extras.ok !== true
              ? h('div', { className: 'pd-empty' }, String(extras.message || 'error'))
              : extrasRows.length === 0
                ? h('div', { className: 'pd-empty' }, t('updateNone'))
                : extrasRows.map(extraRowNode),
          extrasRows.some((row) => row.kind === 'github') ? h('div', { className: 'pd-hint' }, t('extrasWarn')) : null,
          extraLog === null
            ? null
            : h(
                'div',
                { className: 'pd-update-log ' + (extraLog.ok === true ? 'pd-update-log-ok' : 'pd-update-log-bad') },
                h(
                  'b',
                  null,
                  extraLog.ok === true
                    ? t('extrasDone')
                    : extraLog.rolledBack === true
                      ? t('extrasRolledBack')
                      : t('updateFailed'),
                ),
                h('span', null, ' · ' + String(extraLog.name || '') + (extraLog.ok === true ? ' · ' + (extraLog.hotSwap && extraLog.hotSwap.ok === true ? t('updateSwapped') : t('updateRestart')) : '')),
                extraLog.ok === true || extraLog.rolledBack === true
                  ? h('div', { className: 'pd-update-log-out' }, String(extraLog.output || '').slice(-600))
                  : h('div', { className: 'pd-update-log-out' }, String(extraLog.message || extraLog.output || '')),
              ),
        );

        const updatePanel = h(
          'div',
          { className: 'pd-updates' },
          h(
            'div',
            { className: 'pd-update-bar' },
            h(
              'button',
              { type: 'button', className: 'pd-btn', disabled: updatesBusy !== '', onClick: () => checkUpdates() },
              updatesBusy === 'check' ? t('updateChecking') : t('checkUpdates'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'pd-btn pd-btn-primary',
                disabled: updatesBusy !== '' || pickedNames.length === 0,
                onClick: applyUpdates,
              },
              t('updateAll') + (pickedNames.length > 0 ? ' (' + pickedNames.length + ')' : ''),
            ),
            h(
              'button',
              { type: 'button', className: 'pd-btn', onClick: viewLog },
              t('viewLog'),
            ),
            h(
              'span',
              { className: 'pd-hint' },
              t('updateHint') + ' ' + t('updateBatchHint') + ' ' + t('updateAllowHint'),
            ),
          ),
          // 更新前先把要跑的整条命令摆出来，省得「点了之后才发现装了什么」。
          pickedNames.length === 0
            ? null
            : h(
                'div',
                { className: 'pd-hint pd-cmd' },
                t('updatePreview') +
                  ' pnpm add ' +
                  pickedNames
                    .slice(0, 4)
                    .map((name) => {
                      const found = (updates && Array.isArray(updates.rows) ? updates.rows : []).find(
                        (item) => item.name === name,
                      );
                      return name + '@' + String(found && found.latest ? found.latest : '?');
                    })
                    .join(' ') +
                  (pickedNames.length > 4 ? ' …' : '') +
                  ' --save-exact --prefer-offline',
              ),
          logText === null
            ? null
            : h(
                'div',
                { className: 'pd-update-log-out' },
                h('div', null, t('logPath') + ': ' + String(logText.path || '')),
                h(
                  'div',
                  { className: 'pd-update-log-out' },
                  logText.text === null || logText.text === undefined
                    ? (logText.error !== undefined ? String(logText.error) : t('logEmpty'))
                    : String(logText.text).slice(-4000),
                ),
              ),
          updates === null
            ? h(
                'div',
                { className: 'pd-empty' },
                updatesBusy === 'check' ? t('updateChecking') : t('updateIdle'),
              )
            : updates.ok !== true
              ? h('div', { className: 'pd-empty' }, String(updates.message || 'error'))
              : updates.rows.filter((row) => row.hasUpdate).length === 0
                ? h('div', { className: 'pd-empty' }, t('updateNone'))
                : updates.rows.filter((row) => row.hasUpdate).map(updateRowNode),
          updateLog === null
            ? null
            : h(
                'div',
                {
                  className:
                    'pd-update-log ' + (updateLog.ok === true ? 'pd-update-log-ok' : 'pd-update-log-bad'),
                },
                h(
                  'div',
                  null,
                  h(
                    'b',
                    null,
                    updateLog.waiting === true
                      ? '…'
                      : updateLog.ok === true
                        ? t('updateDone') + ' (' + (updateLog.updated ? updateLog.updated.length : 0) + ')'
                        : updateLog.rolledBack === true
                          ? t('updateRolledBack')
                          : t('updateFailed'),
                  ),
                  h(
                    'span',
                    null,
                    ' · ' +
                      (updateLog.ok === true
                        ? updateLog.hotSwap && updateLog.hotSwap.ok === true
                          ? t('updateSwapped')
                          : t('updateRestart')
                        : updateLog.waiting === true
                          ? t('updateWait')
                          : String(updateLog.message || '')),
                  ),
                ),
                Array.isArray(updateLog.updated) && updateLog.updated.length > 0
                  ? h(
                      'div',
                      { className: 'pd-update-list' },
                      updateLog.updated.map((item) =>
                        h(
                          'div',
                          { key: item.name, className: 'pd-update-item' },
                          item.name + '  ' + item.from + ' → ' + item.to,
                        ),
                      ),
                    )
                  : null,
                updateLog.failed !== undefined && updateLog.failed !== null
                  ? h(
                      'div',
                      { className: 'pd-update-log-out' },
                      String(updateLog.failed.name) + ': ' + String(updateLog.failed.output || '').slice(-600),
                    )
                  : null,
              ),
        );

        return h(
          'div',
          { className: 'pd-root' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h(
            'div',
            { className: 'pd-scroll' },
            h(
              'div',
              { className: 'pd-inner' },
              h(
                'div',
                { className: 'pd-head' },
                h(
                  'div',
                  null,
                  h('div', { className: 'pd-title' }, t('title')),
                  h('div', { className: 'pd-sub' }, t('subtitle')),
                ),
                h(
                  'div',
                  { className: 'pd-head-act' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pd-close',
                      title: t('close'),
                      'aria-label': t('close'),
                      onClick: () => {
                        ctx.layout.selectPanel(null);
                      },
                    },
                    '×',
                  ),
                  h(
                    'div',
                    { className: 'pd-seg', role: 'group', 'aria-label': t('title') },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'pd-seg-item' + (locale === 'zh' ? ' pd-seg-on' : ''),
                        'aria-pressed': locale === 'zh',
                        onClick: () => setLang('zh'),
                      },
                      '中文',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'pd-seg-item' + (locale === 'en' ? ' pd-seg-on' : ''),
                        'aria-pressed': locale === 'en',
                        onClick: () => setLang('en'),
                      },
                      'English',
                    ),
                  ),
                ),
              ),
          h(
            'div',
            { className: 'pd-toolbar' },
            h(
              'div',
              { className: 'pd-bar' },
              h(
                'div',
                { className: 'pd-tabs', role: 'tablist', 'aria-label': t('title') },
                pages.map((page) =>
                  h(
                    'button',
                    {
                      key: page.key,
                      type: 'button',
                      role: 'tab',
                      className: 'pd-tab' + (tab === page.key ? ' pd-tab-on' : ''),
                      'aria-selected': tab === page.key,
                      onClick: () => setTab(page.key),
                    },
                    page.title,
                    (() => {
                      const badge =
                        page.badge === undefined ? page.rows.length : page.badge;
                      return badge === null
                        ? null
                        : h('span', { className: 'pd-tab-n' }, String(badge));
                    })(),
                  ),
                ),
              ),
              h('span', { className: 'pd-sep' }),
              h('button', { type: 'button', className: 'pd-btn', disabled: busy, onClick: load }, t('refresh')),
              busy
                ? h(
                    'span',
                    { className: 'pd-tag pd-tag-warn pd-tag-busy' },
                    h('span', { className: 'pd-spin' }),
                    t('loading'),
                  )
                : null,
            ),
            job !== null && job.running === true
              ? h(
                  'div',
                  { className: 'pd-jobbar' },
                  h('span', { className: 'pd-spin' }),
                  h('span', null, t('jobRunning', { n: String(Array.isArray(job.names) ? job.names.length : 0) })),
                  h(
                    'button',
                    { className: 'pd-jobbar-cancel', type: 'button', onClick: cancelJob },
                    t('jobCancel'),
                  ),
                )
              : null,
          ),
          tab === 'updates'
            ? null
            : h(
                'div',
                { className: 'pd-stats' },
                statItem('all', [h('b', { key: 'n' }, String(counts.total)), ' ' + t('unitPlugins')]),
                statItem('enabled', [t('on') + ' ', h('b', { key: 'n' }, String(counts.on))]),
                statItem('disabled', [t('off') + ' ', h('b', { key: 'n' }, String(counts.off))]),
                statItem('auto', [t('auto') + ' ', h('b', { key: 'n' }, String(counts.auto))]),
                visibleCount === counts.total
                  ? null
                  : h('span', null, t('shown') + ' ', h('b', null, String(visibleCount))),
                h('input', {
                  className: 'pd-input',
                  type: 'search',
                  value: query,
                  placeholder: t('search'),
                  onChange: (event) => setQuery(event.target.value),
                }),
              ),
          toast !== null ? h('div', { className: 'pd-toast pd-toast-' + toast.kind }, toast.text) : null,
          bulkAsk !== null
            ? h(
                'div',
                { className: 'pd-confirm' },
                h(
                  'div',
                  { className: 'pd-confirm-text' },
                  h('b', null, t(bulkAsk.enabled ? 'bulkConfirmOn' : 'bulkConfirmOff', { n: bulkAsk.total })),
                  bulkAsk.save === true ? h('span', { className: 'pd-hint' }, t('bulkConfirmSave')) : null,
                ),
                h(
                  'div',
                  { className: 'pd-confirm-act' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pd-btn pd-btn-sm pd-btn-primary',
                      onClick: () => doBulk(bulkAsk),
                    },
                    t('bulkConfirmOk'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'pd-btn pd-btn-sm pd-btn-quiet',
                      onClick: () => setBulkAsk(null),
                    },
                    t('bulkCancel'),
                  ),
                ),
              )
            : null,
          bulkRun !== null
            ? h(
                'div',
                { className: 'pd-toast pd-toast-ok pd-toast-busy' },
                h('span', { className: 'pd-spin' }),
                t('runningBulk', { n: bulkRun.finished, total: bulkRun.total }) +
                  (bulkRun.current ? ' · ' + bulkRun.current : '') +
                  (bulkRun.guarded > 0 ? ' · ' + t('withGuarded', { n: bulkRun.guarded }) : ''),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pd-btn pd-btn-sm pd-btn-quiet',
                    disabled: bulkRun.cancelled === true,
                    onClick: () => {
                      request('/bulk', { cancel: true }).then(load, load);
                    },
                  },
                  bulkRun.cancelled === true ? t('stopping') : t('stop'),
                ),
              )
            : null,
          tab === 'updates'
            ? h('div', null, installPanel, updatePanel, extrasPanel)
            : groups.length === 0
              ? h('div', { className: 'pd-empty' }, t('empty'))
              : groups.map(groupNode),
          h(
            'div',
            { className: 'pd-foot' },
            t('persisted') + ' ' + data.statePath + (data.storage === 'memory' ? ' ' + t('memoryOnly') : ''),
          ),
            ),
          ),
        );
      }

      return Dashboard;
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        const Dashboard = makeDashboard(ctx);

        ctx.effect(() => ctx.locale.register(NS, 'en', DICT.en));
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICT.zh));

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 25,
              label: () => DICT[pickLocale(ctx)].title,
            },
            SidebarIcon,
          ),
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, Dashboard),
        );
      },
    };
  },
});
