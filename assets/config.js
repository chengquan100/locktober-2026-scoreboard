/**
 * 站点配置。
 *
 * 视觉口径（主办方确认，2026-09-20）：**完全复刻 design/scoreboard-prototype.html**。
 *   1. 分数色阶 10 段细渐变，区间与文字色均以原型为准（原型 tierInk：≥30 白字，否则 #6B4A00）。
 *      原型的 tierOf 存在一处不可达分支（#1A1A1A「>40」永远取不到），此处按其图例语义修正为
 *      40 → L8(#6B4A00)、≥41 → L9(#1A1A1A)，颜色值本身与原型完全一致。
 *   2. 注意：这覆盖了此前「自动对比度切换」的有意偏离——主办方明确选择固定文字色规则，
 *      白字在 #C57C15 上的对比度约 3.3:1（低于 AA），由主办方知情决定接受。
 */

export const ACTIVITY = {
  slug: 'locktober-2026',
  title: {
    'zh-Hans': 'Locktober 2026 公开计分板',
    'zh-Hant': 'Locktober 2026 公開計分板',
    en: 'Locktober 2026 Scoreboard',
  },
  /** 带 offset 的 ISO 常量 —— JS 的 new Date(iso) 会按 offset 正确解析，不需要任何时区库 */
  startAt: '2026-10-01T00:00:00+08:00',
  endAt: '2026-10-31T23:59:59+08:00',
  /** 结算时刻：每日 23:59:59（UTC+8），用于「距今日结算」副文案 */
  dailySettleAt: '23:59:59',
  totalDays: 31,
  monthIndex: 9, // 2026-10 —— 月历只有一张，不跨月
  year: 2026,
  timezoneLabel: 'UTC+8',
};

/** 分数色阶：数值区间 → 底色（10 段，与原型 TIER_COLORS / TIER_STEPS 一一对应）。 */
export const SCORE_TIERS = [
  { id: 'L0', min: 0, max: 4, bg: '#FFFFFF', ink: '#6B4A00', label: '0–4' },
  { id: 'L1', min: 5, max: 9, bg: '#FBE7C6', ink: '#6B4A00', label: '5–9' },
  { id: 'L2', min: 10, max: 14, bg: '#F6CB8C', ink: '#6B4A00', label: '10–14' },
  { id: 'L3', min: 15, max: 19, bg: '#F3BA64', ink: '#6B4A00', label: '15–19' },
  { id: 'L4', min: 20, max: 24, bg: '#EFA83C', ink: '#6B4A00', label: '20–24' },
  { id: 'L5', min: 25, max: 29, bg: '#E09229', ink: '#6B4A00', label: '25–29' },
  { id: 'L6', min: 30, max: 34, bg: '#C57C15', ink: '#FFFFFF', label: '30–34' },
  { id: 'L7', min: 35, max: 39, bg: '#9C6113', ink: '#FFFFFF', label: '35–39' },
  { id: 'L8', min: 40, max: 40, bg: '#6B4A00', ink: '#FFFFFF', label: '40' },
  { id: 'L9', min: 41, max: Number.POSITIVE_INFINITY, bg: '#1A1A1A', ink: '#FFFFFF', label: '> 40' },
];

export const SCALE_INK = { dark: '#221C18', light: '#FFFFFF' };

export const SITE = {
  /** 数据源说明（页脚常驻）。申诉渠道已按主办方决定移除（原型无此入口）。 */
  sheetName: 'Locktober 2026 - 计分板',
  syncIntervalLabel: '30',
  repoUrl: 'https://github.com/Bekun1998/locktober-2026-scoreboard',
  dataPath: './data/data.json',
  /** 抓取频率 ≠ 展示粒度：页面停留期间的重载间隔 */
  refreshMs: 5 * 60 * 1000,
  /** cache-busting：定时 fetch 必须带，否则会被浏览器缓存挡住 */
  cacheBust: true,
};

export const STORAGE = {
  lang: 'locktober.lang',
  follow: 'locktober.followed',
  showNumbers: 'locktober.showNumbers',
  sort: 'locktober.sort',
};

/** 排名语义（PRD 11 §1）：同分同名次、按占用人数跳号，不使用分数以外的破同分条件。 */
export function rankOf(scores) {
  const order = scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
  const ranks = new Array(scores.length).fill(0);
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

function srgbToLinear(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => srgbToLinear(parseInt(full.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 文字色：完全复刻原型的固定规则（≥30 白字，否则 #6B4A00）。
 * 各档 ink 已在 SCORE_TIERS 里显式给出，此处仅在缺失时兜底。
 */
export function tierInk(tier) {
  if (tier.ink) return tier.ink;
  const dark = contrastRatio(tier.bg, SCALE_INK.dark);
  const light = contrastRatio(tier.bg, SCALE_INK.light);
  return dark >= light ? SCALE_INK.dark : SCALE_INK.light;
}

export function tierFor(score) {
  const v = Number(score) || 0;
  for (let i = SCORE_TIERS.length - 1; i >= 0; i -= 1) {
    if (v >= SCORE_TIERS[i].min) return SCORE_TIERS[i];
  }
  return SCORE_TIERS[0];
}

export const DATA_URL = () => {
  const base = new URL(SITE.dataPath, document.baseURI).href;
  return SITE.cacheBust ? `${base}${base.includes('?') ? '&' : '?'}_=${Date.now()}` : base;
};
