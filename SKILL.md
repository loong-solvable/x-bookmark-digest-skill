---
name: x-bookmark-digest
description: "整理 X/Twitter bookmarks：把 https://x.com/i/bookmarks 里的帖子抓到本地，去重、切块、做统计，并产出分类归纳、摘要、阅读队列和索引。用户提到 X 书签、Twitter bookmarks、整理收藏帖子、把 bookmark 分类/总结/本地归档时使用此 skill。"
---

# X Bookmark Digest

这个 skill 用来解决“好帖子先扔进 X Bookmark，之后越积越乱，想回看时根本翻不动”的问题。

它自带一份打包好的 `bb-browser` 运行时，不依赖外部 `bb-browser` / `opencli` skill。运行时会：

1. 连接用户正在使用的真实 Chromium 系浏览器登录态
2. 通过内置 daemon + extension 读取同一个浏览器里的 `https://x.com/i/bookmarks`
3. 连续滚动抓取书签帖子
4. 把原始数据、本地索引、统计摘要、分块文件写到 `runs/<timestamp>/`

这个 skill 不允许偷偷 fallback 到 Playwright、OpenClaw 托管浏览器、复制 profile 的隔离窗口。真实浏览器登录态不可用时，应该直接报错并提示用户完成本机扩展连接。

## 适用场景

- “帮我整理我的 X 书签”
- “把 Twitter bookmarks 分类归纳一下”
- “把 X 里收藏的帖子拉到本地做摘要”
- “我想知道我的 bookmarks 都在收藏什么”

## 硬性要求

- 本机装有 Chromium 系浏览器：Chrome / Brave / Edge / Chromium 之一
- 用户常用的那个浏览器已经登录 X
- 本机有 `node >= 18`
- 第一次使用前，需要把本 skill 自带的扩展目录 `vendor/bb-browser/extension` 加载到这个真实浏览器里

## 先跑哪条命令

先做一次连通性检查：

```bash
node scripts/export_x_bookmarks.mjs --check
```

如果 `extension_connected` 为 `false`，在用户真实浏览器里：

```bash
1. 打开 `chrome://extensions`
2. 开启 Developer Mode
3. 选择 Load unpacked
4. 指向 `vendor/bb-browser/extension`
```

然后正式导出：

```bash
node scripts/export_x_bookmarks.mjs
```

如果用户已经自己打开了 `https://x.com/i/bookmarks`，脚本会优先复用那个 tab。
如果没打开，脚本只会在同一个真实浏览器里补开一个 tab，不会起新窗口。

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

1. 先运行导出脚本，绝不要直接依赖外部 `bb-browser` / `opencli` skill。
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

- 如果 `extension_connected` 为 `false`，不要改走别的浏览器方案，直接让用户在真实浏览器加载 `vendor/bb-browser/extension`
- 如果脚本提示登录失败，让用户先确认这个真实浏览器里 X 账号已经登录
- 如果提示端口占用，先检查 `19824`
- 如果页面加载成功但抓不到帖子，保留 `runs/<timestamp>/summary/session.json` 和 `raw/rounds.json`，再参考 [references/runtime-notes.md](references/runtime-notes.md)

## 隐私边界

- 所有抓取都在本机进行
- 原始书签内容只写本地文件
- 这个 skill 不会自动上传书签数据到第三方
