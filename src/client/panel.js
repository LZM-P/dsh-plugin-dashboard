    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'plugin-rack';
    const API = '/api/dsh-plugin-rack';
    const NS = 'plugin-rack';
    async function request(path, body, options) {
      const timeoutMs =
        options && typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
      const init =
        body === undefined
          ? { method: 'GET', headers: { accept: 'application/json' } }
          : {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                // 和宿主端的写操作闸门配对：面板自己永远带这个头，所以即使
                // 某个环境下浏览器没发 Origin / Sec-Fetch-Site 也照样放行。
                'x-dsh-plugin-rack': '1',
              },
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
      // 服务端失败时常常带着细节（回滚那段 pnpm 输出在 data.failed.output 里），
      // 之前只取 message 就抛，于是「为什么失败」的信息到不了界面。把整个 data
      // 挂到 error 上，调用方要用就有。
      if (!response.ok || data === null || data.ok !== true) {
        const message =
          (data && data.message) || (response.ok ? 'malformed response' : response.status + ' ' + response.statusText);
        const error = new Error(message);
        if (data !== null && typeof data === 'object') error.data = data;
        throw error;
      }
      return data;
    }

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
        // 已经下好、只等会话空闲就会自己装上的那些更新。
        const [queued, setQueued] = React.useState([]);

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
            // 返回新快照：调用方要拿它和「操作成功应有的样子」比对，判断一次
            // 失败是不是假失败。返回 undefined 会让那个判断在拿 null 判空之后
            // 直接读到 undefined.rows。
            return next;
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
            return null;
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
            // 记下「操作成功的话，列表应该长成什么样」。catch 里拿它判断这次
            // 失败是不是假失败：宿主重载配置会重置连接，但改动已经生效了。
            //
            // 用当前这次渲染里的 data 直接算，不靠 setData 的 updater 被调用的
            // 时机——updater 是 React 之后才跑的，在它里面赋值等于赌调度顺序。
            let expected = null;
            if (optimistic) {
              if (data !== null) expected = optimistic(data);
              setData((prev) => (prev === null ? prev : optimistic(prev)));
            }
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
              // 关掉/打开一个插件会让宿主重载配置，连接被重置是常见的正常收尾，
              // 操作其实已经生效了。先自愈再判断：如果重新读回来的状态和乐观更新
              // 预测的一致，就别弹红错——用户实测过「明明成功了却报 unreachable」。
              const message = failure instanceof Error ? failure.message : String(failure);
              const healed = await load();
              const verdict = failureOutcome(message, expected, healed);
              if (verdict.kind === 'warn') {
                setToast({ kind: 'warn', text: label + ': ' + t(verdict.reason) });
              } else if (verdict.kind === 'err') {
                setToast({ kind: 'err', text: label + ': ' + verdict.text });
              }
              // verdict.kind === null：状态已经对上了，静默收尾。
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
          // data 进了依赖：run 现在要读当前快照来算乐观预期，依赖数组不带上
          // 它会一直闭包到第一次渲染时那份（通常是 null），导致判断永远跳过。
          [load, data],
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
            // 「其他安装方式」那一栏已经去掉，file / github / tarball 的更新
            // 信息统一并进这一个列表。它们不能走 POST /updates（那里只认精确
            // 版本锁定的依赖），所以勾选时记下每个包属于哪条通道。
            let extrasNext = null;
            try {
              extrasNext = await request('/extras');
              setExtras(extrasNext);
            } catch {
              // 拿不到 extras 不影响精确版本的那些包。
              extrasNext = null;
            }
            const choice = {};
            for (const row of next.rows || []) if (row.hasUpdate) choice[row.name] = true;
            if (extrasNext !== null && Array.isArray(extrasNext.rows)) {
              for (const row of extrasNext.rows) {
                if (row.hasUpdate !== true) continue;
                if (typeof row.name !== 'string') continue;
                choice[row.name] = true;
              }
            }
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
            // 勾选的包分两条通道：精确版本锁定的走 POST /updates（一次 pnpm 装完），
            // 本地压缩包 / github / 压缩包地址走 POST /extras（逐个下载校验）。
            const plan = partitionTargets(names, extras !== null && Array.isArray(extras.rows) ? extras.rows : []);
            // 每一条渠道各自 try/catch：request() 在 ok !== true 时抛错，如果不接住，
            // 一个包失败会让后面的渠道一个都不跑，前面已成功的也拿不到报告。
            const results = [];
            if (plan.npm.length > 0) {
              try {
                // A registry download per package; the host serializes them under one
                // maintenance hold, so this can legitimately outlive the default budget.
                results.push(await request('/updates', { names: plan.npm }, { timeoutMs: WRITE_TIMEOUT_MS }));
              } catch (error) {
                results.push(failureEntry(error, plan.npm.join(', ')));
              }
            }
            for (const item of plan.extras) {
              try {
                const next = await request(
                  '/extras',
                  { name: item.name, action: item.action },
                  { timeoutMs: WRITE_TIMEOUT_MS },
                );
                results.push({ name: item.name, ...next });
              } catch (error) {
                results.push(failureEntry(error, item.name));
              }
            }
            const merged = mergeUpdateReport(results, (n, total) => t('updatePartial', { n, total }));
            if (merged === undefined) {
              // 勾到的全是软链包之类的「没有升级这回事」的行：不编造报告。
              setToast({ kind: 'warn', text: t('updateNothing') });
              return;
            }
            setUpdateLog(merged);
            // 全部成功才重新拉一遍：有失败时保留刚才那份报告，别立刻把它冲掉。
            if (merged.ok === true) {
              await load();
              await checkUpdates();
            }
          } catch (error) {
            // 兜底：流水线之外真有东西抛了，也要给用户一句话，并且不把按钮卡死。
            setUpdateLog({ ok: false, message: String(error && error.message) });
          } finally {
            // 不管走哪条路径都要清掉 —— 之前把这一步写在末尾，一旦中间抛错
            // （比如 load() 改成会抛之后）按钮就永远停在「更新中」。
            setUpdatesBusy('');
          }
        }, [picked, updatesBusy, extras, load, checkUpdates, t]);

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
          } catch (error) {
            // 进面板那一次自动检查失败时静默，别一打开就弹错。
            if (quiet !== true) setExtras({ ok: false, message: String(error && error.message) });
          } finally {
            setExtrasBusy('');
          }
        }, [extrasBusy]);


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
          const { enabled, scope, save } = ask;
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
              setQueued(Array.isArray(answer.queue) ? answer.queue : []);
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
          // patchId 进搜索词：像 cc-safety-net 这种 moduleName 是一条 file:// 路径、
          // 包名要靠 patchId 才认得出来的行，用户凭包名也得能搜到。
          // description 也进：有人记得「余额挂件」但不记得包名。
          const haystack = (
            row.name +
            ' ' +
            row.moduleName +
            ' ' +
            row.entryId +
            ' ' +
            (row.patchId === null || row.patchId === undefined ? '' : row.patchId) +
            ' ' +
            (row.description === null || row.description === undefined ? '' : row.description)
          ).toLowerCase();
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
          { key: 'updates', title: t('tabUpdates'), badge: updates === null && extras === null ? null : updatableTotal(updates, extras) },
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
              updateOf.set(item.name, {
                label: 'v' + item.latest,
                source: 'npm',
                action: 'npm',
                spec: typeof item.spec === 'string' ? item.spec : '',
                ranged: item.kind !== 'exact',
              });
            } else if (item.outOfRange === true && typeof item.latest === 'string') {
              // 服务端已经判定这个新版本不满足 package.json 里写的范围，
              // 批量更新也不会动它。主列表仍然要让人看见「有新版但不升」，
              // 否则用户只会觉得「检查更新坏了」。
              updateOf.set(item.name, {
                label: 'v' + item.latest,
                source: 'npm',
                action: 'npm',
                outOfRange: true,
                spec: typeof item.spec === 'string' ? item.spec : '',
              });
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
                  const badge = badgeOf(info, srcOf.get(row.name));
                  if (badge.kind === 'none') return null;
                  if (badge.kind === 'src') return h('span', { className: 'pd-src' }, badge.label);
                  const updating = pending['update:' + row.entryId] === true;
                  if (badge.kind === 'outOfRange') {
                    // 有新版、但不在 package.json 声明的范围内：这里不能给按钮，
                    // 点了也不会升，只会让人以为按钮失灵。
                    return h(
                      'span',
                      {
                        className: 'pd-src pd-src-warn',
                        title: t('updateOutOfRangeHint', { v: badge.label, spec: badge.spec }),
                      },
                      t('updateOutOfRange'),
                    );
                  }
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
        const updateRowNode = (row) => {
          // The host job runs pnpm once for the whole batch, so no row ever flips
          // its own phase to "running". Mark the names the job carries instead,
          // otherwise the banner spins while the list looks dead.
          const busyNow =
            job !== null &&
            job.running === true &&
            Array.isArray(job.names) &&
            job.names.indexOf(row.name) >= 0;
          return h(
            'label',
            { key: row.name, className: busyNow ? 'pd-update-row pd-update-row-busy' : 'pd-update-row' },
            h('input', {
              type: 'checkbox',
              className: 'pd-check',
              checked: picked[row.name] === true,
              disabled: updatesBusy !== '' || busyNow,
              onChange: () =>
                setPicked((prev) => ({ ...prev, [row.name]: prev[row.name] !== true })),
            }),
            h('span', { className: 'pd-update-name' }, row.name),
            h('span', { className: 'pd-update-ver' }, row.current + ' → ' + row.latest),
            typeof row.spec === 'string' && row.kind !== 'exact'
              ? h('code', { className: 'pd-update-spec', title: row.spec }, row.spec)
              : null,
            busyNow ? h('span', { className: 'pd-spin pd-update-busy', title: t('rowUpdating') }) : null,
          );
        };

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
          (() => {
            const state = updatePageState(updates, updatesBusy === 'check');
            if (state.kind === 'list') return state.updatable.map(updateRowNode);
            if (state.kind === 'error') return h('div', { className: 'pd-empty' }, state.message);
            if (state.kind === 'none') return h('div', { className: 'pd-empty' }, t('updateNone'));
            const key = state.kind === 'checking' ? 'updateChecking' : 'updateIdle';
            return h('div', { className: 'pd-empty' }, t(key));
          })(),
          (() => {
            // 「有新版但超出范围」单独列一段：它不是错误，也不该被批量更新
            // 静默吞掉，放在主列表下面说明原因最省解释成本。
            const state = updatePageState(updates, false);
            const outOfRange = state.kind === 'list' ? state.outOfRange : [];
            if (outOfRange.length === 0) return null;
            return h(
              'div',
              { className: 'pd-up-section' },
              h('div', null, t('updateOutOfRange') + ' (' + outOfRange.length + ')'),
              h(
                'div',
                { className: 'pd-up-oob' },
                outOfRange.map((row) =>
                  h(
                    'div',
                    { key: row.name, className: 'pd-up-oob-row' },
                    h('b', null, row.name),
                    h('span', null, row.current + ' → ' + row.latest),
                    typeof row.spec === 'string' ? h('code', null, row.spec) : null,
                  ),
                ),
              ),
            );
          })(),
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
                        ? updateLog.partialSwap === true
                          ? // 一部分渠道换进去了、一部分没有：既不能说"已热替换"，
                            // 也不能说全都要重启。
                            t('updatePartialSwap')
                          : updateLog.hotSwap && updateLog.hotSwap.ok === true
                            ? t('updateSwapped')
                            : t('updateRestart')
                        : updateLog.waiting === true
                          ? t('updateWait')
                          : String(updateLog.message || '')),
                  ),
                ),
                // 只算一次，两个列表共用一份结果：纯函数重复调用没有副作用，
                // 但两处各算一次意味着两份渲染可能对不上（上一次就是这么漂的）。
                (() => {
                  const lines = renderUpdateReport(updateLog, { unknown: t('updateUnknown') });
                  return [
                    lines.updated.length > 0
                      ? h(
                          'div',
                          { key: 'ok-list', className: 'pd-update-list' },
                          lines.updated.map((line, index) =>
                            h('div', { key: index, className: 'pd-update-item' }, line),
                          ),
                        )
                      : null,
                    // failed 是空数组时不画框：一个空的 pd-update-log-out 看起来像
                    // 「有失败但没显示」，比不画更让人困惑。
                    lines.failed.length > 0
                      ? h(
                          'div',
                          { key: 'fail-list', className: 'pd-update-log-out' },
                          lines.failed.map((line, index) =>
                            h('div', { key: index, className: 'pd-update-item' }, line),
                          ),
                        )
                      : null,
                  ];
                })(),
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
                  h(
                    'span',
                    null,
                    t('jobRunning', { n: String(Array.isArray(job.names) ? job.names.length : 0) }) +
                      (jobPhaseKey(job.phase) === null ? '' : ' · ' + t(jobPhaseKey(job.phase))) +
                      (typeof job.startedAt === 'string' && Number.isFinite(Date.parse(job.startedAt))
                        ? ' · ' + Math.max(0, Math.round((Date.now() - Date.parse(job.startedAt)) / 1000)) + 's'
                        : ''),
                  ),
                  // 服务端判断这个任务此刻能不能取消。回滚阶段是唯一必须跑完的
                  // 一段，client 不能靠 job.running 自己猜——那样回滚时按钮还在，
                  // 再点一次会把回滚用的 pnpm install 也杀掉。
                  job.cancelable === false
                    ? null
                    : h(
                        'button',
                        { className: 'pd-jobbar-cancel', type: 'button', onClick: cancelJob },
                        t('jobCancel'),
                      ),
                )
              : queued.length > 0
                ? h(
                    'div',
                    { className: 'pd-jobbar' },
                    h('span', null, t('jobQueued', { n: String(queued.length) })),
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
            ? h('div', null, installPanel, updatePanel)
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

export { makeDashboard }
