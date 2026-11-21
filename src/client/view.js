    const DEFAULT_TIMEOUT_MS = 120000;
    // 技能扫描要逐个读 SKILL.md，比普通 GET 慢；但再慢也不该无限等，
    // 卡住时让面板自己报错比一直转圈强。
    const SKILL_SCAN_TIMEOUT_MS = 30000;

    /**
     * 一次失败的写操作该显示什么。
     *
     * 单独抽出来是为了能被真正测到：它原来是三段 if 嵌在 run() 的 catch 里，
     * 只能靠 grep 源码判断"这行还在不在"，而 bug（load() 返回 undefined 时
     * 走到 sameEnabledMap 里炸掉）恰恰是 grep 查不出来的。
     *
     * 返回 { kind: null } 表示"什么都不弹"——操作其实生效了。
     */
    function failureOutcome(message, expected, healed) {
      if (expected !== null && expected !== undefined && sameEnabledMap(expected, healed)) {
        return { kind: null };
      }
      if (message === 'unreachable' || message === 'timeout') return { kind: 'warn', reason: 'connLost' };
      return { kind: 'err', text: message };
    }

    /**
     * 两份列表的「哪一行是开着的」是否一致。
     *
     * 只比 enabled，不比别的字段：重载之后 fiber id、phase、详情缓存都可能变，
     * 但「用户想关掉的那几个确实关掉了」才是判断这次操作成没成的依据。
     */
    function sameEnabledMap(left, right) {
      // 两个都要先用真值判空：`!== null` 拦不住 undefined，而 load() 在失败
      // 分支返回 null、在旧版本里返回 undefined，两种都会到这里来。
      if (!left || !right) return false;
      if (!Array.isArray(left.rows) || !Array.isArray(right.rows)) return false;
      const flat = new Map();
      for (const row of left.rows) flat.set(row.entryId, row.enabled === true);
      for (const row of right.rows) {
        const want = flat.get(row.entryId);
        // 只比两份都在的行：重载期间某些行可能短暂消失，那不是「操作失败」。
        if (want === undefined) continue;
        if (want !== (row.enabled === true)) return false;
      }
      return true;
    }

    // The Host can legitimately sit on a write for a long time: it waits for an
    // idle session (3 min), runs pnpm (25 min) and, if that fails, restores the
    // manifests and re-syncs node_modules with another pnpm run (25 min).
    // 60 minutes keeps the panel from giving up while the Host is still
    // working — otherwise the UI reports a failure for a run that succeeds.
    const WRITE_TIMEOUT_MS = 60 * 60 * 1000;

    /**
     * 把勾选的包名按更新通道分组。
     *
     * 精确版本锁定的依赖由 POST /updates 一次 pnpm 装完；github / 本地压缩包 /
     * 压缩包地址各自有一个 `/extras` 动作，必须逐个跑。分成纯函数是为了能真的
     * 测到——这个分组错了，`file:` 包会被送进 /updates，然后被 eligibleDeps
     * 静默过滤掉，界面既不报错也不装。
     */
    function partitionTargets(names, extrasRows) {
      const byName = new Map();
      for (const row of Array.isArray(extrasRows) ? extrasRows : []) {
        if (row !== null && typeof row === 'object' && typeof row.name === 'string') byName.set(row.name, row);
      }
      const npm = [];
      const extras = [];
      for (const name of Array.isArray(names) ? names : []) {
        const row = byName.get(name);
        if (row === undefined) {
          npm.push(name);
          continue;
        }
        if (row.kind === 'github') extras.push({ name, action: 'repull' });
        else if (row.kind === 'file') extras.push({ name, action: 'file-upgrade' });
        else if (row.kind === 'link') continue; // 软链没有「升级」这回事
        else if (row.kind === 'tarball') extras.push({ name, action: 'pin' });
        // 读不出来源（kind: 'other'）的行不猜动作：猜成 pin 会对着一个不是
        // 压缩包地址的 spec 调 /extras，只会换来一句「不是压缩包安装的包」。
        // 它本来也不会被勾选（服务端不给 hasUpdate），这里只是把不确定性说清楚。
        else continue;
      }
      return { npm, extras };
    }

    /**
     * 把各通道的结果合并成一条给面板看的报告。
     *
     * 关键约束：每一条都必须保留，包括失败的那条。以前这里是
     * `parts.filter(one => one.ok !== true)`，但 request() 在 ok !== true 时
     * 直接抛错，所以那个 filter 永远为空，updatePartial 一次都不会显示；
     * 而且「一个渠道失败就整批中断、后面一个都不跑」也藏在同一处。
     * 现在调用方逐条收集 { ok, ... }，这里只负责汇总。
     */
    function mergeUpdateReport(results, messageFor) {
      const list = Array.isArray(results) ? results : [];
      // 没有任何渠道真的跑过（比如勾的全是软链包）：返回空，让调用方知道
      // 「这次什么都没做」，而不是编一个 ok:true 的空报告。
      if (list.length === 0) return undefined;
      const failed = list.filter((one) => one !== null && typeof one === 'object' && one.ok !== true);
      if (list.length === 1) {
        // 单通道时保留原始字段（log / hotSwap / restart 面板要靠它显示详情），
        // 但失败必须走 collectFailures 归一化 —— /updates 和 /extras 抛错时
        // 返回的是 { ok:false, name, message }（可能还带一个 failed 对象），
        // 渲染端只认数组。
        const only = list[0];
        if (only !== null && typeof only === 'object' && only.ok !== true) {
          return Object.assign({}, only, { failed: collectFailures(only) });
        }
        return only;
      }
      const updated = [];
      for (const one of list) {
        if (one !== null && typeof one === 'object' && Array.isArray(one.updated)) {
          for (const item of one.updated) updated.push(item);
        }
      }
      // 每个包的 from/to 不在 extras 的返回里，改用它的 name + to 也能说明白。
      for (const one of list) {
        if (one === null || typeof one !== 'object') continue;
        if (typeof one.name === 'string' && typeof one.to === 'string') {
          updated.push({ name: one.name, to: one.to });
        }
      }
      // 只要有一个渠道真的热替换成功，代码就是活的，不该再要求重启。
      // 之前 restart 取 `some(one => one.restart === true)`、hotSwap 取最后一条，
      // 于是「npm 渠道热替换成功 + extras 渠道没跑热替换」会被报成"需重启"。
      // hotSwap 是「整批的代码换没换干净」，不能拿某一个渠道的结果代表全部。
      // 各渠道管的是不同的包：npm 那条热替换成功，不代表 extras 那个包的变更
      // 也生效了。界面只看 hotSwap.ok 决定显示「已热替换」还是「需重启」
      // （restart 字段没有任何渲染消费点），所以这里必须是合取：
      // 只有每一个真的做过热替换的渠道都成功，才算整批成功。
      const swapAttempts = list
        .map((one) => (one !== null && typeof one === 'object' ? one.hotSwap : undefined))
        .filter((one) => one !== undefined && one !== null);
      const anySwapFailed = swapAttempts.some((one) => one.ok !== true);
      const allSwapOk = swapAttempts.length > 0 && !anySwapFailed;
      // 任何一个渠道说「要重启」，就得提示重启：那是它自己管的包没换进去。
      const restart =
        list.some((one) => one !== null && typeof one === 'object' && one.restart === true) || anySwapFailed;
      // 失败原因优先展示（它带 reason），否则第一个成功的。
      const hotSwap =
        swapAttempts.find((one) => one.ok !== true) ??
        (swapAttempts.length > 0 ? swapAttempts[0] : undefined);
      const log = list
        .map((one) => (one !== null && typeof one === 'object' ? one.log : undefined))
        .filter((one) => typeof one === 'string');
      return {
        ok: failed.length === 0,
        updated,
        // 多通道也走 collectFailures：它会把每个渠道的 failed.output 展开出来，
        // 而不只看顶层 message。之前这里手写了一遍，正好把服务端回滚时的
        // pnpm 输出吞掉 —— 混了 github / file / tarball 的全选是这个按钮的主场景。
        failed: failed.flatMap((one) => collectFailures(one)),
        restart,
        hotSwap,
        // 部分渠道换了、部分没换：界面上要说「部分需重启」，不能只说成功或失败。
        partialSwap: swapAttempts.length > 1 && allSwapOk === false && swapAttempts.some((one) => one.ok === true),
        log: log.length > 0 ? log[log.length - 1] : undefined,
        message:
          failed.length === 0
            ? undefined
            : messageFor === undefined
              ? undefined
              : messageFor(failed.length, list.length),
      };
    }

    /**
     * 把更新报告渲染成面板用的几行文本。
     *
     * 单独抽出来是因为这里踩过坑：`failed` 在单通道时是对象、合并后是数组，
     * 而渲染端一律按对象读 `failed.name`，多通道部分失败时详情行变成
     * "undefined: "，恰好把「哪个渠道挂了、为什么」这个最该说的信息丢掉。
     * `from` 同理：extras 的结果只有 name + to，模板写死 item.from 会渲染成
     * "b undefined → 3.0.0"。
     *
     * 返回 { updated: string[], failed: string[] }，每一行都已经拼好。
     */
    function renderUpdateReport(report, options) {
      const unknown = options !== undefined && options !== null && typeof options.unknown === 'string'
        ? options.unknown
        : '?';
      const shown = [];
      const failedLines = [];
      if (report === null || report === undefined || typeof report !== 'object') {
        return { updated: shown, failed: failedLines };
      }
      const updated = Array.isArray(report.updated) ? report.updated : [];
      for (const item of updated) {
        if (item === null || typeof item !== 'object') continue;
        const name = typeof item.name === 'string' && item.name !== '' ? item.name : unknown;
        const to = item.to === undefined || item.to === null || item.to === '' ? unknown : String(item.to);
        // 没有 from 时只写目标版本：编一个假的起点比不写更误导。
        const from = item.from === undefined || item.from === null || item.from === '' ? null : String(item.from);
        shown.push(from === null ? name + '  → ' + to : name + '  ' + from + ' → ' + to);
      }
      // failed 可能是数组（合并后的报告）也可能是单个对象（/updates 原样返回）。
      const raw = Array.isArray(report.failed) ? report.failed : report.failed === undefined || report.failed === null ? [] : [report.failed];
      for (const item of raw) {
        if (item === null || typeof item !== 'object') continue;
        const name = typeof item.name === 'string' && item.name !== '' ? item.name : unknown;
        const output = item.output === undefined || item.output === null ? '' : String(item.output);
        failedLines.push(name + ': ' + output.slice(-600));
      }
      return { updated: shown, failed: failedLines };
    }

    /**
     * 把一个抛出的失败包装成报告条目。
     *
     * request() 现在把整个响应体挂在 error.data 上，因为服务端失败时常常带着
     * 细节 —— 回滚那段 pnpm 输出就放在 data.failed.output 里。之前只留 message，
     * 于是「为什么失败」永远到不了界面。
     */
    function failureEntry(error, fallbackName) {
      const detail =
        error !== null && typeof error === 'object' && error.data !== undefined && error.data !== null
          ? error.data
          : null;
      const base = detail !== null && typeof detail === 'object' ? detail : {};
      const message = error !== null && typeof error === 'object' && typeof error.message === 'string' ? error.message : String(error);
      return Object.assign({}, base, {
        ok: false,
        name: typeof base.name === 'string' && base.name !== '' ? base.name : fallbackName,
        message,
      });
    }

    /**
     * 从一个失败结果里取出所有该展示的详情行。
     *
     * 这是单/多通道都必须走同一条路的归一化点：服务端失败时会把回滚那段
     * pnpm 输出放在 failed.output 里（failureEntry 会把它展开到顶层 failed
     * 字段），而渠道自己还有一句短 message —— 两者都要保留。
     *
     * 之前单通道分支手写了一遍、多通道分支又手写了一遍，后者只看顶层
     * message/output、不读 one.failed.output，于是「混了 github / file /
     * tarball 的全选」这个主场景把 pnpm 输出吞掉了。抽出来共用，加渠道时
     * 不会再漏一次。
     *
     * 返回 [{ name, output }]；数组和单个对象两种形态都吃，空值不产出假行。
     */
    function collectFailures(one) {
      const lines = [];
      if (one === null || one === undefined || typeof one !== 'object') return lines;
      const push = (name, output) => {
        const label = typeof name === 'string' && name !== '' ? name : '';
        const text = output === undefined || output === null ? '' : String(output);
        // 名字和原因都空的条目没有信息量，别在界面上占一行。
        if (label === '' && text === '') return;
        lines.push({ name: label, output: text });
      };
      // 先放服务端带回来的详情（它们更具体，通常带 pnpm 输出）。
      const nested = one.failed;
      if (Array.isArray(nested)) {
        for (const item of nested) {
          if (item === null || item === undefined || typeof item !== 'object') continue;
          push(item.name, item.output ?? item.message);
        }
      } else if (nested !== null && nested !== undefined && typeof nested === 'object') {
        push(nested.name, nested.output ?? nested.message);
      }
      // 再放这一层自己的短消息。名字缺失时用顶层 name 补上，否则用户只看到
      // 一句无所指的「已回滚」。
      const ownName = typeof one.name === 'string' && one.name !== '' ? one.name : '';
      const ownMessage = one.message === undefined || one.message === null ? '' : String(one.message);
      if (ownMessage !== '') {
        // 嵌套详情已经用同样的文本占过位就不再重复。
        const already = lines.some((line) => line.output === ownMessage);
        if (!already) push(ownName, ownMessage);
      } else if (ownName !== '' && lines.length === 0) {
        push(ownName, '');
      }
      // 同一行被重复收集过就只留一条（嵌套详情和顶层消息常常是同一句话）。
      const seen = new Set();
      return lines.filter((line) => {
        const key = line.name + '\u0000' + line.output;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }


/**
 * What to show at the right end of an installed plugin row.
 *
 * The cases are deliberately distinct: a plain npm install gets no label at all
 * (it is the default — a label there is pure noise), a row installed some other
 * way gets a small tag naming the source, and a row with an update gets a button
 * — unless the release sits outside the version range the user wrote, in which
 * case a button would be a lie, so it becomes a warning tag instead.
 *
 * @param {object|undefined} info  the check result for this row, if any
 * @param {string|undefined} src  how the row itself was installed
 * @returns {{kind: 'none'}|{kind: 'src', label: string}|{kind: 'outOfRange', label: string, spec: string}|{kind: 'update', label: string, source: string}}
 */
function badgeOf(info, src) {
  if (info === undefined || info === null) {
    return src === undefined || src === 'npm' ? { kind: 'none' } : { kind: 'src', label: src };
  }
  if (info.outOfRange === true) {
    return { kind: 'outOfRange', label: info.label ?? '', spec: info.spec ?? '' };
  }
  // A row is only worth an update button when the target differs from what is
  // installed. The check used to trust hasUpdate alone, so a snapshot taken
  // while pnpm was still writing node_modules could draw "v0.4.20 ➡ v0.4.20"
  // and offer a button that had nothing to install.
  if (typeof info.from === 'string' && info.from !== '' && info.label === info.from) {
    return src === undefined || src === 'npm' ? { kind: 'none' } : { kind: 'src', label: src };
  }
  return { kind: 'update', label: info.label ?? '', source: info.source ?? 'npm' };
}

/**
 * Which of the update page's states to render.
 *
 * 'none' used to be decided on hasUpdate alone, which made the page claim there
 * was nothing to do while listing out-of-range releases underneath. Both counts
 * decide it now.
 *
 * @param {{ok?: boolean, message?: string, rows?: Array<{hasUpdate?: boolean, outOfRange?: boolean}>}|null} updates
 * @param {boolean} checking
 * @returns {{kind: 'idle'|'checking'|'error'|'none'|'list', message?: string, updatable?: Array<object>, outOfRange?: Array<object>}}
 */
function updatePageState(updates, checking) {
  if (updates === null || updates === undefined) {
    return { kind: checking === true ? 'checking' : 'idle' };
  }
  if (updates.ok !== true) return { kind: 'error', message: String(updates.message ?? 'error') };
  const rows = Array.isArray(updates.rows) ? updates.rows : [];
  const updatable = rows.filter((row) => row.hasUpdate === true);
  const outOfRange = rows.filter((row) => row.outOfRange === true);
  if (updatable.length === 0 && outOfRange.length === 0) return { kind: 'none' };
  return { kind: 'list', updatable: updatable, outOfRange: outOfRange };
}

/**
 * How many entries across both channels can be updated right now.
 *
 * The 更新 tab badge used to read the npm answer alone (`updates.updates`) while
 * the 「全部更新」button counted the github / tarball rows too, so a panel with
 * one github update showed "更新 7" next to "全部更新 (8)".
 *
 * @param {{rows?: Array<object>}|null} updates
 * @param {{rows?: Array<object>}|null} extras
 * @returns {number}
 */
export function updatableTotal(updates, extras, isWatched) {
  const countOf = (answer) => {
    if (answer === null || typeof answer !== 'object' || !Array.isArray(answer.rows)) return 0;
    return answer.rows.filter(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        row.hasUpdate === true &&
        // 一键更新只动勾选过的行。徽标若按「全部可更新」计数，就会和
        // 「全部更新 (N)」对不上——13 对 12 就是这么来的。
        (typeof isWatched === 'function' ? isWatched(row.name) === true : true),
    ).length;
  };
  return countOf(updates) + countOf(extras);
}

/**
 * Which dictionary key describes the phase the host job is in.
 *
 * @param {string|null|undefined} phase
 * @returns {string|null}
 */
export function jobPhaseKey(phase) {
  if (phase === 'start') return 'jobPhaseWait';
  if (phase === 'download') return 'jobPhaseDownload';
  if (phase === 'install') return 'jobPhaseInstall';
  if (phase === 'rollback') return 'jobRollingBack';
  return null;
}

export { DEFAULT_TIMEOUT_MS, SKILL_SCAN_TIMEOUT_MS, WRITE_TIMEOUT_MS, failureOutcome, sameEnabledMap, partitionTargets, mergeUpdateReport, renderUpdateReport, failureEntry, collectFailures, badgeOf, updatePageState }
