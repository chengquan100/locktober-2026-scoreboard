# Locktober 2026 · 公开计分板

一份公开、只读、零登录的活动计分板静态站。无框架、无构建、无外部依赖：首屏只请求一次 `data.json`，其余视图全部在浏览器里运行时渲染。

## 站点结构

```text
index.html                  页面壳 + 路由
assets/                     config / i18n / app / styles
data/data.json              榜单唯一数据来源
tools/sync-scoreboard.mjs   CSV → data.json 的同步管线（无状态、幂等）
sw.js                       Service Worker，离线可看最后一次成功数据
```

## 数据同步

每小时从一份公开发布的 Google Sheets CSV 拉取一次，全量重算后写入 `data/data.json`；内容无变化则不提交。只有抓取失败或表头结构对不上才算故障，此时沿用上一版产物。

管线是无状态的（每日累计分 = 日期列前缀和），重跑即回填，不需要任何历史文件。

## 本地运行

```bash
python3 -m http.server 8791
# 打开 http://127.0.0.1:8791/
```

`data.json` 由 `fetch` 读取，必须通过 HTTP 访问，`file://` 会被 CORS 拦住。

```bash
# 用样本 CSV 跑一遍管线
node tools/sync-scoreboard.mjs --input tools/fixtures/scoreboard.sample.csv
```

## 复用

MIT 协议。fork 后把 `SCOREBOARD_CSV_URL` 换成你自己的发布 CSV 即可；表头行需以 `ID` 开头，日期列用 `2026-10-01` 这种带年份补零的格式。

## 请注意

页面数据来自公开发布的 CSV，内容可能被搜索引擎或 CDN 收录且不可撤回。发布前请确认参与者同意公开其昵称或编号，不要放真实姓名与联系方式。
