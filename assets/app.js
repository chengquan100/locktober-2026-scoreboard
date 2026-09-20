/**
 * Locktober 2026 · 公开计分板
 *
 * 一份 index.html + 一份 data.json，其余视图运行时渲染（PRD 11 §6）。
 * 无框架、无构建、无外部依赖，只为在 GitHub Pages 上首屏一次请求就能跑起来。
 */

import {
  ACTIVITY,
  DATA_URL,
  SCORE_TIERS,
  SITE,
  STORAGE,
  rankOf,
  tierFor,
  tierInk,
} from './config.js';
import { detectLang, localeOf, raw, translate } from './i18n.js';

// ===========================================================================
// 状态
// ===========================================================================

const state = {
  data: null,
  status: 'loading', // loading | ready | error
  offline: false,
  lang: detectLang(),
  showNumbers: readBool(STORAGE.showNumbers, false),
  query: '',
  route: parseRoute(),
  slugIndex: new Map(),
};

const el = {
  view: null,
  nav: null,
  toast: null,
  tip: null,
};

function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch { return fallback; }
}
function readStr(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

const t = (key, vars) => translate(state.lang, key, vars);
const locale = () => localeOf(state.lang);

// ===========================================================================
// 时钟：客户端时钟不可信，用 HTTP Date 响应头对齐（PRD 11 §8）
// ===========================================================================

const clock = {
  offsetMs: 0,
  fixed: null,
  async sync() {
    if (this.fixed) return;
    try {
      const started = Date.now();
      const res = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
      const header = res.headers.get('date');
      if (!header) return;
      const server = Date.parse(header);
      if (Number.isNaN(server)) return;
      const rtt = Date.now() - started;
      this.offsetMs = server + rtt / 2 - Date.now();
    } catch {
      this.offsetMs = 0; // 拿不到响应头就退回本地时间，不倒计时造假
    }
  },
  now() {
    return this.fixed ? new Date(this.fixed) : new Date(Date.now() + this.offsetMs);
  },
  fixAt(iso) { this.fixed = iso; },
};

const OFFSET_MS = 8 * 3600 * 1000;

/** 把任意时刻折算成主办方（UTC+8）的日历字段 */
function organizerParts(date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),
    date: shifted.toISOString().slice(0, 10),
  };
}

function phaseNow(now) {
  const start = new Date(ACTIVITY.startAt);
  const end = new Date(ACTIVITY.endAt);
  if (now < start) return { phase: 'upcoming', start, end };
  if (now > end) return { phase: 'ended', start, end };
  return { phase: 'ongoing', start, end };
}

function activityDayOf(now) {
  const start = new Date(ACTIVITY.startAt).getTime();
  return Math.floor((now.getTime() - start) / 86400000) + 1;
}

function countdownText(ms) {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hh = String(Math.floor((total % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  const core = `${hh}:${mm}:${ss}`;
  if (days > 0) return state.lang === 'en' ? `${days}d ${core}` : `${days} 天 ${core}`;
  return core;
}

// ===========================================================================
// 格式化
// ===========================================================================

const nf = (opts = {}) => new Intl.NumberFormat(locale(), opts);
const num = (v) => nf().format(v);

function formatDateShort(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (state.lang === 'en') {
    return new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dt);
  }
  return `${m}月${d}日`;
}

function formatDateFull(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (state.lang === 'en') {
    return new Intl.DateTimeFormat(locale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(dt);
  }
  const dow = new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' }).format(dt);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${dow}`;
}

/** HTML 转义：显示名按原文显示，必须转义后再插入 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===========================================================================
// 派生统计
// ===========================================================================

function totalsOf(data) {
  return data.series.map((s) => s.cumul.at(-1) ?? 0);
}

function buildIndex(data) {
  const totals = totalsOf(data);
  const ranks = rankOf(totals);
  const lastIdx = Math.max(0, data.days.length - 1);
  const rows = data.series.map((s, i) => {
    const streaks = streaksOf(s.daily);
    return {
      id: s.id,
      name: s.name,
      slug: slugOf(s.id),
      daily: s.daily,
      cumul: s.cumul,
      total: totals[i],
      rank: ranks[i],
      streak: s.daily[lastIdx] > 0 ? streaks.current : 0,
      best: streaks.best,
      todayScore: s.daily[lastIdx] ?? 0,
      scoredDays: s.daily.filter((v) => v > 0).length,
    };
  });
  return { rows, totals, lastIdx, byId: new Map(rows.map((r) => [r.id, r])) };
}

/** 连续天数：截至最新一天、连续有得分的天数；当天无得分则归零 */
function streaksOf(daily) {
  let best = 0;
  let run = 0;
  for (const v of daily) {
    run = v > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return { current: run, best };
}

function slugOf(id) {
  const s = String(id);
  return /^[A-Za-z0-9._~-]+$/.test(s) ? s : encodeURIComponent(s);
}

function derive(data) {
  if (state.slugIndex.size === 0) {
    for (const s of data.series) state.slugIndex.set(slugOf(s.id), s.id);
  }
}

// ===========================================================================
// 路由
// ===========================================================================

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path] = raw.split('?');
  if (path === '/' || path === '') return { name: 'home' };
  // 「我的关注」(#/me) 与「规则页」(#/rules) 按主办方决定暂缓（原型无此二页，后续版本可能恢复），
  // 旧链接一律回落首页。
  const m = path.match(/^\/p\/(.+)$/);
  if (m) {
    let slug = m[1];
    try { slug = decodeURIComponent(slug); } catch { /* keep raw */ }
    return { name: 'person', slug };
  }
  return { name: 'home' };
}

function go(hash) {
  if (window.location.hash === hash) { render(); return; }
  window.location.hash = hash;
}

// ===========================================================================
// 数据加载
// ===========================================================================

async function loadData({ silent = false } = {}) {
  if (!silent) { state.status = 'loading'; render(); }
  try {
    const res = await fetch(DATA_URL(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.series) || !Array.isArray(data.days)) {
      throw new Error('data.json 结构不符合预期');
    }
    const previousGeneratedAt = state.data?.generatedAt;
    state.data = data;
    state.offline = false;
    state.status = 'ready';
    derive(data);
    render();
    if (silent && previousGeneratedAt && previousGeneratedAt !== data.generatedAt) toast(t('state.updated'));
    return true;
  } catch (err) {
    if (state.data) {
      state.offline = true;
      state.status = 'ready';
      render();
      if (!silent) toast(t('state.offline'));
      return false;
    }
    state.status = 'error';
    state.errorMessage = err.message;
    render();
    return false;
  }
}

// ===========================================================================
// 渲染：外壳
// ===========================================================================

function navHtml() {
  // 原型仅有「品牌 + 语言切换」；关注 / 规则页入口按主办方决定暂缓，后续版本恢复时在此加回。
  return '';
}

function renderShell() {
  // <html lang> 随语言更新；不写 meta description、不写任何 og:* 标签（PRD 11 §9 / D-SB-04）
  document.documentElement.lang = state.lang;
  document.title = ACTIVITY.title[state.lang] ?? ACTIVITY.title['zh-Hans'];
  const sub = document.querySelector('[data-brand-sub]');
  if (sub) sub.textContent = t('brand.sub');
  if (el.nav) el.nav.innerHTML = navHtml();
  document.querySelectorAll('[data-lang-btn]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.langBtn === state.lang ? 'true' : 'false');
  });
  const skip = document.querySelector('[data-skip]');
  if (skip) skip.textContent = t('a11y.skip');
}

// ===========================================================================
// 渲染：组件
// ===========================================================================

function legendHtml() {
  // 标签显示档位下界（0, 5, 10 … 40, >40）；范围仅用于染色（config 的 label 保留作 tooltip）
  const items = SCORE_TIERS.map(
    (tier, i) =>
      `<span class="legend__item" title="${esc(t('rules.scaleTier', { tier: tier.id, range: tier.label }))}">
         <span class="legend__chip" style="background:${tier.bg}"></span>
         <span class="legend__label">${i === SCORE_TIERS.length - 1 ? '&gt;40' : tier.min}</span>
       </span>`,
  ).join('');
  return `<div class="legend">
      <span class="legend__title">${esc(t('grid.legend'))}</span>
      <div class="legend__items">${items}</div>
    </div>`;
}

function heroHtml() {
  const now = clock.now();
  const { phase } = phaseNow(now);
  const day = phase === 'ongoing' ? activityDayOf(now) : phase === 'ended' ? ACTIVITY.totalDays : 0;
  const done = phase === 'ongoing' ? day - 1 : phase === 'ended' ? ACTIVITY.totalDays : 0;
  const pct = Math.round((done / ACTIVITY.totalDays) * 100);

  const rows = state.data ? buildIndex(state.data).rows : [];
  const latestDay = state.data?.days.at(-1) ?? null;
  const todayScorers = latestDay ? rows.filter((r) => r.daily[state.data.days.length - 1] > 0).length : 0;
  const todayTotal = latestDay ? rows.reduce((sum, r) => sum + (r.daily[state.data.days.length - 1] ?? 0), 0) : 0;
  const leader = rows.slice().sort((a, b) => b.total - a.total)[0];

  const cls = phase === 'upcoming' ? 'hero hero--pre' : phase === 'ended' ? 'hero hero--ended' : 'hero';
  const eyebrow = phase === 'upcoming' ? t('hero.upcoming.eyebrow') : phase === 'ongoing' ? t('hero.ongoing.eyebrow') : t('hero.ended.eyebrow');

  const headline =
    phase === 'upcoming'
      ? `<div class="hero__count">
           <span class="clock__value" style="font-size:34px;letter-spacing:-0.5px">${esc(countdownText(new Date(ACTIVITY.startAt) - now))}</span>
         </div>
         <p class="hero__lead">${esc(t('hero.upcoming.lead'))}</p>`
      : `<div class="hero__count">
           <span class="hero__day num">${esc(t('hero.day', { n: day }))}</span>
           <span class="hero__dayof">${esc(t('hero.dayof', { total: ACTIVITY.totalDays }))}</span>
         </div>
         <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ACTIVITY.totalDays}" aria-valuenow="${done}">
           <div class="progress__track"><div class="progress__fill" style="width:${pct}%"></div></div>
           <div class="progress__meta"><span>${esc(t('hero.progress', { done, total: ACTIVITY.totalDays }))}</span><span class="num">${pct}%</span></div>
         </div>
         <p class="hero__lead">${
           phase === 'ended'
             ? esc(t('hero.ended.lead'))
             : `${esc(t('hero.lead.leader'))}：<b>${leader ? `${esc(leader.name)} · ${num(leader.total)} ${esc(t('unit.score'))}` : esc(t('hero.lead.none'))}</b>`
         }</p>`;

  const totalSum = rows.reduce((sum, r) => sum + r.total, 0);

  const stamp = state.data?.sourceUpdatedAt
    ? t('hero.updated', { t: state.data.sourceUpdatedAt })
    : t('hero.updated.unknown');

  return `<section class="${cls}" aria-label="${esc(eyebrow)}">
    <span class="hero__glow" aria-hidden="true"></span>
    <div class="hero__top">
      <span class="hero__eyebrow"><span class="hero__pulse" aria-hidden="true"></span>${esc(eyebrow)}</span>
      <span class="hero__stamp num">${esc(stamp)}</span>
    </div>
    <div class="hero__headline">
      <div class="hero__countcol">${headline}</div>
    </div>
    <div class="hero__stats">
      <div class="hstat"><div class="hstat__v num">${num(todayScorers)}</div><div class="hstat__k">${esc(t('hero.stat.todayScorers'))}</div></div>
      <div class="hstat"><div class="hstat__v num">${num(todayTotal)}</div><div class="hstat__k">${esc(t('hero.stat.todayTotal'))}</div></div>
      <div class="hstat"><div class="hstat__v num">${num(rows.length)}</div><div class="hstat__k">${esc(t('hero.stat.participants'))}</div></div>
      <div class="hstat"><div class="hstat__v num">${num(totalSum)}</div><div class="hstat__k">${esc(t('hero.stat.grandTotal'))}</div></div>
    </div>
  </section>`;
}

function toolbarHtml() {
  // 原型工具栏 = 搜索 + 显示数字开关；不做排序切换（按名次固定排序）
  return `<div class="toolbar">
    <label class="search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="#8A8A8A" stroke-width="2"/><path d="M16.5 16.5 21 21" stroke="#8A8A8A" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" value="${esc(state.query)}" placeholder="${esc(t('grid.search'))}" aria-label="${esc(t('grid.search'))}" data-search>
      <button class="search__clear" type="button" data-clear data-show="${state.query ? 1 : 0}" aria-label="${esc(t('grid.clear'))}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </label>
    <div class="controls">
      <button class="switch" type="button" data-numbers aria-pressed="${state.showNumbers ? 'true' : 'false'}">
        <span class="switch__track"><span class="switch__knob"></span></span>
        <span>${esc(t('grid.showNumbers'))}</span>
      </button>
    </div>
  </div>`;
}

function gridHtml(rows) {
  const dataDays = state.data.days;
  const todayIso = organizerParts(clock.now()).date;
  // 始终渲染完整 10 月：未记录的日期（未到/缺列）用灰格占位
  const mm = String(ACTIVITY.monthIndex + 1).padStart(2, '0');
  const days = Array.from({ length: ACTIVITY.totalDays }, (_, i) => `${ACTIVITY.year}-${mm}-${String(i + 1).padStart(2, '0')}`);

  const headCells = days
    .map((d) => {
      const isToday = d === todayIso;
      return `<th class="day" scope="col" data-today="${isToday ? 1 : 0}" data-date="${d}" title="${esc(d)}">
        <span class="num">${d.slice(8)}</span>
      </th>`;
    })
    .join('');

  const bodyRows = rows
    .map((r) => {
      const cells = days
        .map((d) => {
          const isToday = d === todayIso;
          const idx = dataDays.indexOf(d);
          if (idx < 0) {
            return `<td class="cell future${isToday ? ' is-today' : ''}" aria-label="${esc(formatDateFull(d))}"></td>`;
          }
          const score = r.daily[idx] ?? 0;
          const tier = tierFor(score);
          const ink = tierInk(tier);
          return `<td class="cell${isToday ? ' is-today' : ''}" data-l="${tier.id}" data-score="${score}" data-date="${d}"
            style="background:${tier.bg};color:${ink}"
            title="${esc(`${d} · ${score} ${t('unit.score')}`)}"
            aria-label="${esc(t('cell.label', { date: formatDateFull(d), score }))}"><span>${score}</span></td>`;
        })
        .join('');

      const medal = r.rank <= 3 ? `<span class="medal num" data-m="${r.rank}">${r.rank}</span>` : `<span class="num">${r.rank}</span>`;
      return `<tr data-id="${esc(r.id)}" tabindex="0" aria-label="${esc(
        `${r.rank}. ${r.name} · ${r.total} ${t('unit.score')}`,
      )}">
        <td class="stick c-rank">${medal}</td>
        <td class="stick c-name"><span class="nm">${esc(r.name)}</span><span class="nm-sub">${esc(t('grid.col.streak'))} ${esc(t('grid.streak.unit', { n: r.streak }))}</span></td>
        <td class="stick c-total num">${num(r.total)}</td>
        <td class="stick c-streak num">${r.streak > 0 ? esc(t('grid.streak.unit', { n: r.streak })) : '—'}</td>
        ${cells}
      </tr>`;
    })
    .join('');

  return `<div class="card gridcard">
    <div class="gridscroll" data-gridscroll>
      <table class="grid" data-numbers="${state.showNumbers ? 1 : 0}">
        <thead>
          <tr>
            <th class="stick c-rank" scope="col">${esc(t('grid.col.rank'))}</th>
            <th class="stick c-name" scope="col">${esc(t('grid.col.name'))}</th>
            <th class="stick c-total" scope="col">${esc(t('grid.col.total'))}</th>
            <th class="stick c-streak" scope="col">${esc(t('grid.col.streak'))}</th>
            ${headCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="grid-foot">
      <span class="grid-foot__hint">${esc(t('grid.hint'))}</span>
      <span class="grid-foot__spacer"></span>
      <span class="grid-foot__hint">${esc(t('grid.hint.hover'))}</span>
    </div>
  </div>`;
}

function calendarHtml(row, { compact = false } = {}) {
  const days = state.data?.days ?? [];
  const todayIso = organizerParts(clock.now()).date;
  const weekStart = state.lang === 'en' ? 0 : 1; // 首列随 locale：en 周日起，中文周一起
  const first = new Date(Date.UTC(ACTIVITY.year, ACTIVITY.monthIndex, 1));
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(Date.UTC(ACTIVITY.year, ACTIVITY.monthIndex + 1, 0)).getUTCDate();

  const dowNames = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(Date.UTC(2026, 9, 4 + ((weekStart + i) % 7))); // 2026-10-04 is Sunday
    dowNames.push(new Intl.DateTimeFormat(locale(), { weekday: 'narrow', timeZone: 'UTC' }).format(d));
  }

  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push('<div class="cal__cell cal__cell--blank" aria-hidden="true"></div>');

  for (let d = 1; d <= daysInMonth; d += 1) {
    const iso = `${ACTIVITY.year}-${String(ACTIVITY.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const idx = days.indexOf(iso);
    const has = idx >= 0;
    const score = has ? (row?.daily[idx] ?? 0) : 0;
    const tier = tierFor(score);
    const ink = tierFor(score).ink ?? tierInk(tier);
    const future = !has;
    const isToday = iso === todayIso;
    const label = has ? t('cell.label', { date: formatDateFull(iso), score }) : `${formatDateFull(iso)} · ${t('cell.noRecord')}`;
    cells.push(`<div class="cal__cell${future ? ' is-future' : ''}${isToday ? ' is-today' : ''}" data-l="${tier.id}"
        style="${future ? '' : `background:${tier.bg};color:${ink}`}"
        tabindex="${future ? -1 : 0}" role="img" aria-label="${esc(label)}" title="${esc(label)}" data-date="${iso}" data-score="${score}">
        <span class="d num">${String(ACTIVITY.monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}</span><span class="s num">${has ? score : ''}</span>
      </div>`);
  }

  return `<div class="cal"${compact ? '' : ' data-cal'}>
    <div class="cal__dow" aria-hidden="true">${dowNames.map((n) => `<span>${esc(n)}</span>`).join('')}</div>
    <div class="cal__grid" role="group" aria-label="${esc(row ? `${row.name} ${t('person.calendar')}` : t('person.calendar'))}">${cells.join('')}</div>
  </div>`;
}

function statCardsHtml(row, totalRows) {
  return `<div class="statgrid">
    <div class="stat stat--accent"><div class="stat__v num">${num(row.total)}</div><div class="stat__k">${esc(t('person.stat.total'))}</div><div class="stat__h">${esc(t('person.scoredDays', { n: row.scoredDays }))}</div></div>
    <div class="stat"><div class="stat__v num">#${row.rank}</div><div class="stat__k">${esc(t('person.stat.rank'))}</div><div class="stat__h">${esc(t('person.stat.rankOf', { n: totalRows }))}</div></div>
    <div class="stat"><div class="stat__v num">${row.streak}</div><div class="stat__k">${esc(t('person.stat.streak'))}</div><div class="stat__h">${esc(t('person.stat.best'))} ${row.best} ${esc(t('unit.days'))}</div></div>
  </div>`;
}

function rulesSummaryHtml() {
  // 原型首页底部 = 单张「计分规则」圆点列表卡（无表格 / FAQ / 规则页链接）。
  const items = raw(state.lang, 'rules.items');
  return `<section class="section">
    <div class="card rules-card">
      <h3 class="rules-card__title">${esc(t('rules.title'))}</h3>
      <ul class="ruleslist">
        ${items.map((x) => `<li>${esc(x)}</li>`).join('')}
      </ul>
    </div>
  </section>`;
}

// footer 已按主办方决定移除（原型无底部数据来源/更新频率/说明区；相关信息由 Hero「最后更新」承担）。

// ===========================================================================
// 渲染：视图
// ===========================================================================

function stateHtml() {
  if (state.status === 'loading') {
    return `<section class="card state"><h2 class="section__title">${esc(t('state.loading'))}</h2>
      <div class="skel" style="height:14px;width:60%"></div><div class="skel" style="height:14px;width:40%"></div></section>`;
  }
  return `<section class="card state">
      <h2 class="section__title">${esc(t('state.error.title'))}</h2>
      <p class="section__desc">${esc(t('state.error.desc'))}</p>
      <button class="btn btn--primary" type="button" data-refresh>${esc(t('state.error.retry'))}</button>
    </section>`;
}

function viewHome() {
  if (state.status !== 'ready') {
    return `<div class="view">${heroHtml()}${stateHtml()}</div>`;
  }
  const data = state.data;
  const { rows } = buildIndex(data);
  const sorted = sortRows(filterRows(rows));

  const grid = sorted.length
    ? gridHtml(sorted)
    : `<div class="card gridempty">
        <div class="gridempty__t">${esc(state.query ? t('grid.nomatch.title') : t('grid.empty.title'))}</div>
        <div class="gridempty__d">${esc(state.query ? t('grid.nomatch.desc') : t('grid.empty.desc'))}</div>
      </div>`;

  return `<div class="view" data-view="home">
    ${heroHtml()}
    <section class="section">
      <div class="section__head">
        <h2 class="section__title">${esc(t('grid.title'))}</h2>
        <p class="section__desc">${esc(t('grid.desc'))}</p>
      </div>
      ${toolbarHtml()}
      ${legendHtml()}
      ${grid}
    </section>
    ${rulesSummaryHtml()}
  </div>`;
}

function filterRows(rows) {
  const q = state.query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || String(r.id).toLowerCase().includes(q));
}

// 排序固定为名次序（同分同名次）；原型不提供排序切换。
function sortRows(rows) {
  return rows.slice().sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, locale()));
}

function viewPerson(slug) {
  if (state.status !== 'ready') {
    return `<div class="view">${heroHtml()}${stateHtml()}</div>`;
  }
  const id = state.slugIndex.get(slug) ?? slug;
  const { rows } = buildIndex(state.data);
  const row = rows.find((r) => r.id === id);
  if (!row) {
    return `<div class="view"><section class="card state">
        <h1 class="section__title">${esc(t('person.notFound'))}</h1>
        <p class="section__desc">${esc(t('person.notFound.desc'))}</p>
        <a class="btn btn--primary" href="#/">${esc(t('person.back'))}</a>
      </section></div>`;
  }
  const rawName = String(row.name);
  const initials = rawName.trim().slice(0, 1).toUpperCase();

  const now = clock.now();
  const { phase } = phaseNow(now);
  const day = phase === 'ongoing' ? activityDayOf(now) : phase === 'ended' ? ACTIVITY.totalDays : 0;
  const done = phase === 'ongoing' ? day - 1 : phase === 'ended' ? ACTIVITY.totalDays : 0;
  const pct = Math.round((done / ACTIVITY.totalDays) * 100);
  const month = String(ACTIVITY.monthIndex + 1).padStart(2, '0');
  const sideDate = organizerParts(now).date;
  const recorded = Math.min(day, state.data.days.length);

  return `<div class="view" data-view="person">
    <section class="personhead">
      <a class="avatar" href="#/" aria-hidden="true" tabindex="-1">${esc(initials)}</a>
      <div class="personhead__id">
        <h1 class="personhead__name">${esc(row.name)}</h1>
        <p class="personhead__sub num">#${row.rank} · ${num(row.total)} ${esc(t('unit.score'))} · ${esc(t('grid.col.streak'))} ${esc(t('grid.streak.unit', { n: row.streak }))}</p>
      </div>
      <div class="personhead__acts">
        <a class="btn btn--sm" href="#/">${esc(t('person.back'))}</a>
      </div>
    </section>
    ${statCardsHtml(row, rows.length)}
    <div class="personcols">
      <section class="panel">
        <div class="panel__head">
          <span class="panel__title">${esc(t('person.calendar'))}</span>
        </div>
        ${calendarHtml(row)}
        ${legendHtml()}
      </section>
      <section class="panel sidecard">
        <div class="panel__head"><span class="panel__title">${esc(t('side.title'))}</span></div>
        <div class="sidecard__day"><b>${esc(t('hero.day', { n: day }))} ${esc(t('hero.dayof', { total: ACTIVITY.totalDays }))}</b><span class="num">${esc(sideDate)}</span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ACTIVITY.totalDays}" aria-valuenow="${done}">
          <div class="progress__track"><div class="progress__fill" style="width:${pct}%"></div></div>
        </div>
        <div class="kv"><span class="k">${esc(t('side.window'))}</span><span class="v num">${month}-01 ~ ${month}-${ACTIVITY.totalDays}</span></div>
        <div class="kv"><span class="k">${esc(t('side.recorded'))}</span><span class="v num">${recorded} / ${ACTIVITY.totalDays}</span></div>
        <div class="kv"><span class="k">${esc(t('side.updated'))}</span><span class="v num">${esc(state.data.sourceUpdatedAt ?? state.data.generatedAt ?? '—')}</span></div>
      </section>
    </div>
  </div>`;
}

// ===========================================================================
// 渲染入口
// ===========================================================================

function render() {
  renderShell();
  const route = state.route;
  // 关注 / 规则页已暂缓：路由统一回落首页或个人页（见 parseRoute）。
  const html = route.name === 'person' ? viewPerson(route.slug) : viewHome();

  el.view.innerHTML = html;
  applyGridBehaviors();
}

/** 移动端默认定位到最近的日期列（PRD 11 §7.2） */
function applyGridBehaviors({ autoScroll = true } = {}) {
  const scroller = el.view.querySelector('[data-gridscroll]');
  if (!scroller || !autoScroll) return;
  if (scroller.scrollWidth > scroller.clientWidth + 8) {
    scroller.scrollLeft = scroller.scrollWidth;
  }
}

// ===========================================================================
// 提示条
// ===========================================================================

let toastTimer = null;
function toast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.dataset.show = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.dataset.show = '0'; }, 3200);
}

// ===========================================================================
// 交互
// ===========================================================================

function bindEvents() {
  window.addEventListener('hashchange', () => {
    state.route = parseRoute();
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  document.addEventListener('click', (e) => {
    const langBtn = e.target.closest('[data-lang-btn]');
    if (langBtn) {
      state.lang = langBtn.dataset.langBtn;
      try { localStorage.setItem(STORAGE.lang, state.lang); } catch { /* ignore */ }
      render();
      return;
    }

    if (e.target.closest('[data-refresh]')) { loadData(); return; }

    // 只匹配开关按钮本身 —— table[data-numbers] 是状态标记，
    // 若用 closest('[data-numbers]') 会把行点击误判成「切换显示数字」
    if (e.target.closest('button[data-numbers]')) {
      state.showNumbers = !state.showNumbers;
      try { localStorage.setItem(STORAGE.showNumbers, state.showNumbers ? '1' : '0'); } catch { /* ignore */ }
      const table = el.view.querySelector('table.grid');
      const toggle = el.view.querySelector('button[data-numbers]');
      if (table) table.dataset.numbers = state.showNumbers ? 1 : 0;
      if (toggle) toggle.setAttribute('aria-pressed', state.showNumbers ? 'true' : 'false');
      return;
    }

    if (e.target.closest('[data-clear]')) {
      state.query = '';
      render();
      el.view.querySelector('[data-search]')?.focus();
      return;
    }

    // 点击行内任意位置（含日期格）进个人页 —— 与原型一致
    const tableRow = e.target.closest('tr[data-id]');
    if (tableRow) {
      const row = state.data ? buildIndex(state.data).byId.get(tableRow.dataset.id) : null;
      if (row) go(`#/p/${row.slug}`);
      return;
    }

    const calCell = e.target.closest('.cal__cell[data-date]');
    if (calCell) { showTip(calCell); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest?.('tr[data-id]');
    if (tr) {
      e.preventDefault();
      const row = state.data ? buildIndex(state.data).byId.get(tr.dataset.id) : null;
      if (row) go(`#/p/${row.slug}`);
    }
  });

  document.addEventListener('input', (e) => {
    const input = e.target.closest('[data-search]');
    if (!input || !state.data) return;
    state.query = input.value;

    const all = buildIndex(state.data).rows;
    const filtered = sortRows(filterRows(all));
    const card = el.view.querySelector('.gridcard') ?? el.view.querySelector('.gridempty');
    if (!card) return;

    const html = filtered.length
      ? gridHtml(filtered)
      : `<div class="card gridempty"><div class="gridempty__t">${esc(t('grid.nomatch.title'))}</div><div class="gridempty__d">${esc(t('grid.nomatch.desc'))}</div></div>`;
    card.replaceWith(document.createRange().createContextualFragment(html));

    el.view.querySelector('[data-clear]')?.setAttribute('data-show', state.query ? '1' : '0');
    const fresh = el.view.querySelector('[data-search]');
    if (fresh && fresh !== input) {
      fresh.focus();
      fresh.setSelectionRange(state.query.length, state.query.length);
    }
    applyGridBehaviors({ autoScroll: false });
  });

  // 悬停/轻点提示：日期 · 得分
  document.addEventListener('pointerover', (e) => {
    const cell = e.target.closest?.('td.cell, .cal__cell');
    if (cell) showTip(cell);
  });
  document.addEventListener('pointerout', (e) => {
    const cell = e.target.closest?.('td.cell, .cal__cell');
    if (cell) hideTip();
  });
  document.addEventListener('scroll', hideTip, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadData({ silent: true });
  });

  // 转屏 / 改窗口尺寸后重新把网格定位到最近日期列
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyGridBehaviors(), 180);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}

function showTip(cell) {
  const date = cell.dataset.date;
  if (!date || !el.tip) return;
  const score = Number(cell.dataset.score ?? 0);
  el.tip.innerHTML = `<div class="tip__d num">${esc(formatDateFull(date))}</div><div class="tip__s num">${score} ${esc(t('unit.score'))}${score === 0 ? ` · ${esc(t('cell.noRecord'))}` : ''}</div>`;
  const rect = cell.getBoundingClientRect();
  el.tip.dataset.show = '1';
  const tipRect = el.tip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  let top = rect.top - tipRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  el.tip.style.left = `${left}px`;
  el.tip.style.top = `${top}px`;
}
function hideTip() { if (el.tip) el.tip.dataset.show = '0'; }

// ===========================================================================
// 启动
// ===========================================================================

async function boot() {
  el.view = document.querySelector('[data-view-host]');
  el.nav = document.querySelector('[data-nav]');
  el.toast = document.querySelector('[data-toast]');
  el.tip = document.querySelector('[data-tip]');

  // 演示 / 调试钩子：?preview=1 把「现在」固定到数据生成时刻（活动前预览骨架同样走这里）
  const params = new URLSearchParams(window.location.search);
  if (params.has('at')) clock.fixAt(params.get('at'));

  renderShell();
  bindEvents();

  await loadData();

  if (params.get('preview') === '1' && state.data?.generatedAt) clock.fixAt(state.data.generatedAt);
  if (!clock.fixed) await clock.sync();
  render();

  setInterval(() => loadData({ silent: true }), SITE.refreshMs);
  window.addEventListener('online', () => loadData({ silent: true }));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 离线能力是增强，不是必需 */ });
  }
}

window.__modLoaded = true;
boot();
