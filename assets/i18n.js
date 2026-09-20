/**
 * 三语言词条（PRD 11 §9 / PRD 10）。
 *
 * 约定：
 *   - 语言清单 zh-Hans（兜底）/ zh-Hant / en，缺词条回退到 zh-Hans，禁止显示 key。
 *   - 繁简社群术语按人工校订，禁止机械繁简转换：打卡→簽到、积分→積分、群組、排行。
 *   - 时区恒定 UTC+8，切到英文也不变成 UTC。
 *   - 显示名等内容不翻译。
 */

export const LANGS = ['zh-Hans', 'zh-Hant', 'en'];
export const FALLBACK = 'zh-Hans';

const zhHans = {
  'brand.sub': '公开计分板',



  'hero.upcoming.eyebrow': '距离开始还有',
  'hero.upcoming.lead': '预热期：先看看计分规则，活动开始后这里会实时更新。',
  'hero.ongoing.eyebrow': '活动进行中',
  'hero.ended.eyebrow': '最终成绩',
  'hero.ended.lead': '活动已结束，本页为归档视图，不再更新实时倒计时。',
  'hero.day': 'Day {n}',
  'hero.dayof': '/ {total} 天',
  'hero.progress': '已完成 {done} / {total} 天',
  'hero.stat.todayScorers': '今日参与',
  'hero.stat.participants': '参与人数',
  'hero.stat.todayTotal': '今日得分',
  'hero.stat.grandTotal': '累计总分',
  'hero.lead.leader': '当前领先',
  'hero.lead.none': '还没有任何得分记录',
  'hero.updated': '最后更新 {t}',
  'hero.updated.unknown': '最后更新时间未知',

  'grid.title': '名次网格',
  'grid.desc': '行 = 参与者，列 = 日期；颜色代表当日得分。',
  'grid.search': '搜索参与者…',
  'grid.clear': '清除搜索',
  'grid.showNumbers': '显示数字',
  'grid.legend': '分数色阶（当日得分）',
  'grid.hint': '左侧列已冻结，可横向滚动查看全部日期',
  'grid.hint.hover': '悬停或轻点格子查看「日期 · 得分」',
  'grid.col.rank': '名次',
  'grid.col.name': '参与者',
  'grid.col.total': '总分',
  'grid.col.streak': '连续',
  'grid.empty.title': '尚无数据',
  'grid.empty.desc': '活动开始并产生第一批得分后，这里会出现完整网格。',
  'grid.nomatch.title': '没有匹配的参与者',
  'grid.nomatch.desc': '换一个关键词试试。',
  'grid.streak.unit': '{n} 天',

  'cell.label': '{date} {score} 分',
  'cell.noRecord': '无记录',

  'person.notFound': '找不到这位参与者',
  'person.notFound.desc': '链接可能已失效，或该 id 不在当前数据里。',
  'person.back': '返回总榜',
  'person.calendar': '2026 年 10 月',
  'person.stat.total': '总分',
  'person.stat.rank': '当前名次',
  'person.stat.streak': '当前连续',
  'person.stat.best': '最长连续',
  'person.stat.rankOf': '共 {n} 人',
  'person.scoredDays': '有得分 {n} 天',


  'rules.title': '计分规则',
  'rules.items': ['普通打卡 +5／天：当日任一普通任务被标记 👌 或 🆒，每天最多计一次', '普通任务 +5／个：标记为 🆒 时计分', '特殊任务 +20／个：标记为 🆒 时计分', '连续奖励：普通打卡连续第 5 天起，当天有普通打卡即 +10／天，中断后重新累计连续天数', '排行榜按累计总分降序，同分同名次并跳号；提交时间不参与计分'],
  'side.title': '活动进度',
  'side.window': '活动窗口',
  'side.recorded': '已记录天数',
  'side.updated': '最后更新',
  'rules.scaleTier': '{tier} 档 · {range} 分',


  'state.loading': '正在加载数据…',
  'state.error.title': '数据加载失败',
  'state.error.desc': '可能是网络问题，也可能是同步管线还没产出第一版 data.json。',
  'state.error.retry': '重试',
  'state.offline': '当前离线，显示的是最后一次成功缓存的数据',
  'state.updated': '数据已更新',

  'a11y.skip': '跳到主要内容',
  'unit.score': '分',
  'unit.days': '天',
};

const zhHant = {
  'brand.sub': '公開計分板',
  'hero.upcoming.eyebrow': '距離開始還有',
  'hero.upcoming.lead': '預熱期：先看看計分規則，活動開始後這裡會即時更新。',
  'hero.ongoing.eyebrow': '活動進行中',
  'hero.ended.eyebrow': '最終成績',
  'hero.ended.lead': '活動已結束，本頁為封存檢視，不再更新即時倒數。',
  'hero.day': 'Day {n}',
  'hero.dayof': '/ {total} 天',
  'hero.progress': '已完成 {done} / {total} 天',
  'hero.stat.todayScorers': '今日參與',
  'hero.stat.participants': '參與人數',
  'hero.stat.todayTotal': '今日得分',
  'hero.stat.grandTotal': '累計總分',
  'hero.lead.leader': '目前領先',
  'hero.lead.none': '還沒有任何得分紀錄',
  'hero.updated': '最後更新 {t}',
  'hero.updated.unknown': '最後更新時間未知',
  'grid.title': '名次網格',
  'grid.desc': '列 = 參與者，欄 = 2026 年 10 月各日；顏色代表當日得分。',
  'grid.search': '搜尋參與者…',
  'grid.clear': '清除搜尋',
  'grid.showNumbers': '顯示數字',
  'grid.legend': '分數色階（當日得分）',
  'grid.hint': '左側欄已凍結，可橫向捲動查看全部日期',
  'grid.hint.hover': '滑過或輕點格子查看「日期 · 得分」',
  'grid.col.rank': '名次',
  'grid.col.name': '參與者',
  'grid.col.total': '總分',
  'grid.col.streak': '連續',
  'grid.empty.title': '尚無資料',
  'grid.empty.desc': '活動開始並產生第一批得分後，這裡會出現完整網格。',
  'grid.nomatch.title': '沒有符合的參與者',
  'grid.nomatch.desc': '換一個關鍵字試試。',
  'grid.streak.unit': '{n} 天',
  'cell.label': '{date} {score} 分',
  'cell.noRecord': '無紀錄',
  'person.notFound': '找不到這位參與者',
  'person.notFound.desc': '連結可能已失效，或該 id 不在目前的資料裡。',
  'person.back': '返回總榜',
  'person.calendar': '2026 年 10 月',
  'person.stat.total': '總分',
  'person.stat.rank': '目前名次',
  'person.stat.streak': '目前連續',
  'person.stat.best': '最長連續',
  'person.stat.rankOf': '共 {n} 人',
  'person.scoredDays': '有得分 {n} 天',
  'rules.title': '計分規則',
  'rules.items': ['普通打卡 +5／天：當日任一普通任務被標記 👌 或 🆒，每天最多計一次', '普通任務 +5／個：標記為 🆒 時計分', '特殊任務 +20／個：標記為 🆒 時計分', '連續獎勵：普通打卡連續第 5 天起，當天有普通打卡即 +10／天，中斷後重新累計連續天數', '排行榜按累計總分降序，同分同名次並跳號；提交時間不參與計分'],
  'side.title': '活動進度',
  'side.window': '活動窗口',
  'side.recorded': '已記錄天數',
  'side.updated': '最後更新',
  'rules.scaleTier': '{tier} 檔 · {range} 分',
  'state.loading': '正在載入資料…',
  'state.error.title': '資料載入失敗',
  'state.error.desc': '可能是網路問題，也可能是同步管線還沒產出第一版 data.json。',
  'state.error.retry': '重試',
  'state.offline': '目前離線，顯示的是最後一次成功快取的資料',
  'state.updated': '資料已更新',
  'a11y.skip': '跳到主要內容',
  'unit.score': '分',
  'unit.days': '天',
};

const en = {
  'brand.sub': 'Public scoreboard',
  'hero.upcoming.eyebrow': 'Starts in',
  'hero.upcoming.lead': 'Warm-up: read the rules now — this page fills in once the activity starts.',
  'hero.ongoing.eyebrow': 'Activity live',
  'hero.ended.eyebrow': 'Final results',
  'hero.ended.lead': 'The activity has ended. This is an archived view — no live countdown.',
  'hero.day': 'Day {n}',
  'hero.dayof': '/ {total} days',
  'hero.progress': '{done} / {total} days done',
  'hero.stat.todayScorers': 'Active today',
  'hero.stat.participants': 'Players',
  'hero.stat.todayTotal': 'Points today',
  'hero.stat.grandTotal': 'Total points',
  'hero.lead.leader': 'Currently leading',
  'hero.lead.none': 'No scores recorded yet',
  'hero.updated': 'Last updated {t}',
  'hero.updated.unknown': 'Last update time unknown',
  'grid.title': 'Ranking grid',
  'grid.desc': 'Rows are participants, columns are days; colour encodes the daily score.',
  'grid.search': 'Search participants…',
  'grid.clear': 'Clear search',
  'grid.showNumbers': 'Show numbers',
  'grid.legend': 'Score scale (daily score)',
  'grid.hint': 'Left columns are frozen — scroll sideways for all dates',
  'grid.hint.hover': 'Hover or tap a cell for “date · score”',
  'grid.col.rank': 'Rank',
  'grid.col.name': 'Participant',
  'grid.col.total': 'Total',
  'grid.col.streak': 'Streak',
  'grid.empty.title': 'No data yet',
  'grid.empty.desc': 'The full grid appears once the activity starts producing scores.',
  'grid.nomatch.title': 'No matching participants',
  'grid.nomatch.desc': 'Try a different keyword.',
  'grid.streak.unit': '{n}d',
  'cell.label': '{date} {score} points',
  'cell.noRecord': 'no record',
  'person.notFound': 'Participant not found',
  'person.notFound.desc': 'The link may be stale, or this id is not in the current data.',
  'person.back': 'Back to board',
  'person.calendar': 'October 2026',
  'person.stat.total': 'Total',
  'person.stat.rank': 'Rank',
  'person.stat.streak': 'Streak',
  'person.stat.best': 'Best streak',
  'person.stat.rankOf': 'of {n}',
  'person.scoredDays': 'Scored on {n} days',
  'rules.title': 'Scoring rules',
  'rules.items': ['Daily check-in +5: any regular task marked 👌 or 🆒 that day, counted at most once per day', 'Regular task +5 each: awarded when marked 🆒', 'Special task +20 each: awarded when marked 🆒', 'Streak bonus: from the 5th consecutive daily check-in, +10 per day with a check-in; a break restarts the streak', 'Rankings sort by total score; tied scores share a rank with skip numbering; submission time never affects scores'],
  'side.title': 'Progress',
  'side.window': 'Window',
  'side.recorded': 'Days recorded',
  'side.updated': 'Last update',
  'rules.scaleTier': '{tier} · {range} pts',
  'state.loading': 'Loading data…',
  'state.error.title': 'Could not load data',
  'state.error.desc': 'A network problem, or the sync pipeline has not produced its first data.json yet.',
  'state.error.retry': 'Retry',
  'state.offline': 'Offline — showing the last successfully cached data',
  'state.updated': 'Data updated',
  'a11y.skip': 'Skip to main content',
  'unit.score': 'pts',
  'unit.days': 'days',
};

const DICTS = { 'zh-Hans': zhHans, 'zh-Hant': zhHant, en };

const LOCALE = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', en: 'en-US' };

export function localeOf(lang) {
  return LOCALE[lang] ?? LOCALE[FALLBACK];
}

export function translate(lang, key, vars) {
  const dict = DICTS[lang] ?? DICTS[FALLBACK];
  const raw = dict[key] ?? DICTS[FALLBACK][key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}

/** 取原始词条（数组等非字符串值用；translate 只支持字符串插值） */
export function raw(lang, key) {
  return (DICTS[lang] ?? DICTS[FALLBACK])[key] ?? DICTS[FALLBACK][key] ?? [];
}

/**
 * 语言检测优先级：?lang= → localStorage → navigator.languages → zh-Hans（PRD 11 §9）
 * 语言只存本机，不在 URL 上做分享链接拼接。
 */
export function detectLang(search = window.location.search) {
  const fromQuery = new URLSearchParams(search).get('lang');
  if (fromQuery && LANGS.includes(fromQuery)) return fromQuery;
  try {
    const stored = localStorage.getItem('locktober.lang');
    if (stored && LANGS.includes(stored)) return stored;
  } catch { /* 隐私模式等场景静默降级 */ }
  const nav = navigator.languages ?? [navigator.language ?? ''];
  for (const tag of nav) {
    const lower = String(tag).toLowerCase();
    if (lower.startsWith('zh')) {
      if (/(hant|tw|hk|mo)/.test(lower)) return 'zh-Hant';
      return 'zh-Hans';
    }
    if (lower.startsWith('en')) return 'en';
  }
  return FALLBACK;
}
