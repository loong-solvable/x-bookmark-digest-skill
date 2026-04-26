---
name: x-bookmark-digest
description: "整理 X/Twitter bookmarks：把 https://x.com/i/bookmarks 里的帖子抓到本地，去重、切块、做统计，并产出分类归纳、摘要、阅读队列和索引。用户提到 X 书签、Twitter bookmarks、整理收藏帖子、把 bookmark 分类/总结/本地归档时使用此 skill。"
---

# X Bookmark Digest

这个 skill 用来解决“好帖子先扔进 X Bookmark，之后越积越乱，想回看时根本翻不动”的问题。

它现在内置了一份只做 bookmark 提取的最小化 `opencli` 风格导出器，不依赖外部 `opencli` / `bb-browser` skill。运行时会：

1. 从用户真实登录过 X 的 Chromium 系浏览器里解析 `auth_token` / `ct0`
2. 直接请求 X 的 Bookmarks GraphQL 接口
3. 分页拉取书签帖子
4. 把原始数据、本地索引、统计摘要、分块文件写到 `runs/<timestamp>/`

这个 skill 是 raw data 采集层，不是自动操作层。不要把它和 `timeline / like / reply` 那类 `opencli` 自动操作工作流混在一起。

## 适用场景

- “帮我整理我的 X 书签”
- “把 Twitter bookmarks 分类归纳一下”
- “把 X 里收藏的帖子拉到本地做摘要”
- “我想知道我的 bookmarks 都在收藏什么”

## 硬性要求

- 本机装有 Chromium 系浏览器：Chrome / Arc / Brave / Edge / Chromium 之一
- 用户常用的那个浏览器已经登录 X
- 本机有 `node >= 18`
- 在 macOS 上，第一次自动读取浏览器 cookie 时，系统可能会弹一次对应浏览器的 Safe Storage 钥匙串授权

如果用户不想碰钥匙串，也可以手动传入：

```bash
--auth-token <value> --ct0 <value>
```

## 先跑哪条命令

先做一次就绪检查：

```bash
node scripts/export_x_bookmarks.mjs --check
```

然后正式导出：

```bash
node scripts/export_x_bookmarks.mjs
```

常用参数：

```bash
node scripts/export_x_bookmarks.mjs --browser chrome --profile Default
node scripts/export_x_bookmarks.mjs --limit 300
node scripts/export_x_bookmarks.mjs --auth-token "$X_AUTH_TOKEN" --ct0 "$X_CT0"
```

## 产物位置

每次运行都会生成一个新目录：

```text
runs/<timestamp>/
├── raw/
│   ├── bookmarks.json
│   ├── bookmarks.jsonl
│   └── rounds.json
├── index/
│   └── bookmarks.csv
├── chunks/
│   └── chunk-001.json ...
├── summary/
│   ├── stats.json
│   ├── seed.md
│   └── session.json
└── report/
```

## Agent 工作流

1. 先运行导出脚本，绝不要直接依赖外部 `opencli` / `bb-browser` skill。
2. 优先读：
   - `summary/stats.json`
   - `summary/seed.md`
   - `index/bookmarks.csv`
3. 如果书签不多（例如 <= 150 条），可以直接读 `raw/bookmarks.json` 做归纳。
4. 如果书签很多，按 `chunks/chunk-*.json` 分块处理，再合并结论。
5. 最终至少写出两个结果文件：

```text
runs/<timestamp>/report/bookmark-digest.md
runs/<timestamp>/report/bookmark-index.md
```

## 输出要求

`bookmark-digest.md` 至少包含：

- 这批 bookmarks 的整体主题
- 3-8 个分类桶，每个桶解释“为什么归到这一类”
- 每类里最值得先看的帖子
- 重复出现的作者 / 站点 / 议题
- “现在就值得回看”的帖子
- “更适合长期存档”的帖子

`bookmark-index.md` 至少包含：

- 分类后的帖子清单
- 每条 1 句摘要
- 原帖链接
- 作者 / handle

更细的格式要求见 [references/report-contract.md](references/report-contract.md)。

## 分析策略

- 先给出高层分类，再下钻到代表性帖子
- 不要把分类做成“按作者硬拆”
- 优先提炼“为什么用户会收藏这类帖子”
- 区分：
  - 可立即执行
  - 值得反复复习
  - 只是资讯噪音
  - 需要转存到其他知识库

## 失败处理

- 如果自动探测不到 cookie，先用 `--check` 看看命中了哪个浏览器 / profile
- 如果脚本提示缺少 `auth_token` / `ct0`，说明当前 profile 没登录 X，或者命中了错误 profile
- 如果 macOS 拒绝读取 Safe Storage，重新运行一次并在钥匙串弹窗里点“允许”或“始终允许”
- 如果接口返回 401 / 403，先确认 X 登录态没过期；必要时重新登录浏览器后再跑
- 如果接口返回证书错误，可以在明确知道这是本机证书链问题时加 `--insecure`
- 如果页面结构或 query id 变了，保留 `runs/<timestamp>/summary/session.json` 和 `raw/rounds.json`，再参考 [references/runtime-notes.md](references/runtime-notes.md)

## 隐私边界

- 所有抓取都在本机进行
- 原始书签内容只写本地文件
- 这个 skill 不会自动上传书签数据到第三方
