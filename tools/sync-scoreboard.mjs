#!/usr/bin/env node
/**
 * Locktober 2026 · 公开计分板同步管线（PRD 11 §4）
 *
 *   Google Sheet --(发布 CSV)--> 本脚本 --(解析 / 重算)--> data/data.json
 *
 * 设计原则（PRD 11 §4.3）：**能正确解析出来，就是对的**。不做任何业务校验。
 *
 * 用法：
 *   node tools/sync-scoreboard.mjs --input tools/fixtures/scoreboard.sample.csv
 *   CSV_URL='https://docs.google.com/.../pub?output=csv' node tools/sync-scoreboard.mjs
 *
 * 退出码：0 = 成功（含「内容未变化」）；1 = 解析失败（调用方应保留上一版产物并开 Issue）
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// 配置（区间与清单配置化，不硬编码在逻辑里）
// ---------------------------------------------------------------------------

const CONFIG = {
  activity: {
    start: '2026-10-01',
    end: '2026-10-31',
    timezone: 'Asia/Taipei',
    utcOffset: '+08:00',
  },
  /** 透视表汇总行标识。Sheet 侧改写法时只改这里。 */
  summaryRowLabels: ['总计', 'Total', 'SUM', 'Sum', '合計', '合计'],
  /** 真正表头的首列标识（动态定位，禁止写死行号） */
  headerFirstCell: 'ID',
  schemaVersion: 1,
};

const OFFSET_MS = 8 * 3600 * 1000;

// ---------------------------------------------------------------------------
// 时区：全程只做「UTC 往后挪 8 小时再读 UTC 字段」，不依赖 runner 本地时区
// ---------------------------------------------------------------------------

function orgNow(now = new Date()) {
  const shifted = new Date(now.getTime() + OFFSET_MS);
  const iso = shifted.toISOString();
  return {
    iso: `${iso.slice(0, 19)}${CONFIG.activity.utcOffset}`,
    date: iso.slice(0, 10),
  };
}

function diffDays(fromISO, toISO) {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function dateSequence(fromISO, toISO) {
  const out = [];
  const d = new Date(`${fromISO}T00:00:00Z`);
  const end = new Date(`${toISO}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSV 解析（容忍 BOM / CRLF / LF / 千分位 / 引号）
// ---------------------------------------------------------------------------

/** 极简但正确的 RFC4180 拆分：支持引号包裹与 "" 转义 */
function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function toInteger(raw) {
  if (raw == null) return 0;
  const cleaned = String(raw).replace(/[\s,_'"]/g, '');
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0; // 解析不出数字一律按 0（§4.3 规则 3）
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 把透视表导出的宽表解析为 { sourceUpdatedAt, rows, dateColumns }
 * 行/列数均不固定，一律按表头名匹配（§3.2 规则 1）。
 */
export function parseScoreboardCsv(text) {
  const raw = String(text).replace(/^\uFEFF/, ''); // strip BOM
  const lines = raw.split(/\r\n|\n|\r/);
  let sourceUpdatedAt = '';
  let headerIndex = -1;
  let header = [];

  for (let i = 0; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const first = (cells[0] ?? '').trim();
    if (i === 0) sourceUpdatedAt = first; // A1 = Sheet 侧最后更新时间
    if (first === CONFIG.headerFirstCell) {
      headerIndex = i;
      header = cells.map((c) => c.trim());
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error(`找不到 "${CONFIG.headerFirstCell}" 表头行，无法解析`);
  }

  // 日期列由表头名直接识别（列头已是标准 ISO，无需加工）。
  // 活动前的空表（ID,总计，无日期列、无参与者）是合法空态：days/series 输出为空，
  // 不算结构错误（真正找不到表头才算损坏）。
  const dateColumns = [];
  header.forEach((name, idx) => {
    if (idx > 0 && ISO_DATE.test(name)) dateColumns.push({ name, index: idx });
  });

  const isSummaryRow = (label) =>
    CONFIG.summaryRowLabels.some((s) => label.toLowerCase() === String(s).toLowerCase());

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const label = (cells[0] ?? '').trim();
    if (label === '') continue;
    if (isSummaryRow(label)) continue; // 剔除透视表汇总行，否则「总计」会排到第一
    const daily = dateColumns.map(({ index }) => toInteger(cells[index]));
    rows.push({ id: label, name: label, daily, sheetTotal: toInteger(cells[cells.length - 1]) });
  }

  return { sourceUpdatedAt, rows, dateColumns: dateColumns.map((c) => c.name) };
}

// ---------------------------------------------------------------------------
// 生成 data.json（无状态、纯函数、严格幂等）
// ---------------------------------------------------------------------------

export function buildData(parsed, { now = new Date() } = {}) {
  const today = orgNow(now);
  const { start, end } = CONFIG.activity;

  const phase =
    diffDays(today.date, start) > 0 ? 'upcoming' : diffDays(end, today.date) > 0 ? 'ended' : 'ongoing';

  // 日期轴：用活动起止日生成完整序列；缺列的日子按 0 分补齐（累计分随之沿用前一日）
  const latestInSheet = parsed.dateColumns[parsed.dateColumns.length - 1];
  let axisEnd = end;
  if (phase === 'upcoming') axisEnd = '';
  else if (phase === 'ongoing') axisEnd = latestInSheet > today.date ? latestInSheet : today.date;
  const days = axisEnd ? dateSequence(start, axisEnd).filter((d) => d <= end) : [];

  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const series = parsed.rows.map((row) => {
    const daily = days.map(() => 0);
    parsed.dateColumns.forEach((date, idx) => {
      const target = dayIndex.get(date);
      if (target != null) daily[target] = row.daily[idx];
    });
    const cumul = [];
    let acc = 0;
    for (const v of daily) {
      acc += v;
      cumul.push(acc);
    }
    return { id: row.id, name: row.name, daily, cumul };
  });

  const activityDay = phase === 'ongoing' ? diffDays(start, today.date) + 1 : phase === 'ended' ? 31 : 0;

  return {
    schemaVersion: CONFIG.schemaVersion,
    generatedAt: today.iso,
    sourceUpdatedAt: parsed.sourceUpdatedAt,
    timezone: CONFIG.activity.timezone,
    utcOffset: CONFIG.activity.utcOffset,
    phase,
    activityDay,
    days,
    series,
  };
}

/** 竞赛式排名：同分同名次、按占用人数跳号（三人并列第 1，下一名为第 4） */
export function computeRanks(series) {
  const totals = series.map((s) => s.cumul.at(-1) ?? 0);
  const order = totals.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
  const ranks = new Array(series.length).fill(0);
  let lastScore = null;
  let lastRank = 0;
  order.forEach((entry, position) => {
    const rank = lastScore !== null && entry.score === lastScore ? lastRank : position + 1;
    lastScore = entry.score;
    lastRank = rank;
    ranks[entry.i] = rank;
  });
  return ranks;
}

// ---------------------------------------------------------------------------
// 抓取：主策略失败自动回落到备用端点（§3.4 备用端点）
// ---------------------------------------------------------------------------

async function fetchCsv(url, strategy) {
  const u = new URL(url);
  if (strategy === 'export') {
    // /pub(html)?/...  →  /export?format=csv&gid=..
    const gid = u.searchParams.get('gid');
    u.pathname = u.pathname.replace(/\/pub(html)?$/, '/export');
    u.search = '';
    if (gid) u.searchParams.set('gid', gid);
    u.searchParams.set('format', 'csv');
  } else {
    // 主策略：主办方可能直接粘贴「发布到网页」的 /pubhtml 链接 —— 它返回 HTML 页面，
    // 必须归一化为 /pub?output=csv 才能拿到 CSV
    u.pathname = u.pathname.replace(/\/pubhtml$/, '/pub');
    u.searchParams.set('output', 'csv');
  }
  u.searchParams.set('_cb', String(Date.now())); // 绕过部分缓存（仅改善手段）
  const res = await fetch(u, {
    headers: { 'user-agent': 'locktober-scoreboard-sync/1.0', 'cache-control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${strategy}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`空响应 @ ${strategy}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (/text\/html/i.test(contentType) || /^\s*(<!DOCTYPE\s+html|<html[\s>])/i.test(text)) {
    throw new Error(`响应是 HTML 而非 CSV（检查发布范围与 gid）@ ${strategy}`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = resolve(args.out ?? 'data/data.json');
  const now = args.now ? new Date(args.now) : new Date();

  let text;
  if (args.input) {
    text = await readFile(resolve(args.input), 'utf8');
  } else {
    const url = process.env.CSV_URL;
    if (!url) throw new Error('缺少 CSV_URL 环境变量（或使用 --input 指定本地文件）');
    const order = process.env.CSV_STRATEGY === 'export' ? ['export', 'pub'] : ['pub', 'export'];
    let lastErr;
    for (const strategy of order) {
      try {
        text = await fetchCsv(url, strategy);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!text) throw lastErr;
  }

  const parsed = parseScoreboardCsv(text);
  const data = buildData(parsed, { now });
  const json = `${JSON.stringify(data, null, 2)}\n`;

  let previous = null;
  try {
    previous = await readFile(outPath, 'utf8');
  } catch {
    /* 首次运行没有旧产物，正常 */
  }

  // 幂等比较：忽略 generatedAt（它是每次运行的当前时间，不代表 Sheet 内容变化）。
  // 否则每次运行都会判为「有变化」，cron 会每 30 分钟产生一次空提交（违背 FR-SB-03）。
  const stripVolatile = (jsonText) => {
    try {
      const obj = JSON.parse(jsonText);
      delete obj.generatedAt;
      return JSON.stringify(obj);
    } catch {
      return jsonText;
    }
  };

  const sameContent =
    previous !== null && stripVolatile(previous) === stripVolatile(json);
  await mkdir(dirname(outPath), { recursive: true });
  if (!sameContent) await writeFile(outPath, json, 'utf8');

  const ranks = computeRanks(data.series);
  const leader = data.series.map((s, i) => ({ ...s, rank: ranks[i], total: s.cumul.at(-1) ?? 0 })).sort((a, b) => b.total - a.total)[0];

  console.log(
    JSON.stringify(
      {
        phase: data.phase,
        activityDay: data.activityDay,
        days: data.days.length,
        participants: data.series.length,
        leader: leader ? { name: leader.name, rank: leader.rank, total: leader.total } : null,
        sourceUpdatedAt: data.sourceUpdatedAt,
        changed: !sameContent,
        out: outPath,
      },
      null,
      2,
    ),
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[sync-scoreboard] 解析失败：${err.message}`);
    process.exit(1);
  });
}
