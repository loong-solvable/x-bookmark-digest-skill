# X Bookmark Digest

把杂乱的 X / Twitter bookmarks，整理成可读的本地摘要、索引和阅读队列。

这是一个面向 `macOS` 的自包含 skill，适用于 Codex / Claude Code / OpenClaw。它会从用户真实登录过 X 的 Chromium 浏览器会话里提取 bookmarks，保存结构化产物，然后继续整理出：

- 分类 digest
- bookmark index
- 阅读优先队列
- 比“扔进 bookmarks 就不管”更可用的回看结果

<details>
<summary>English</summary>

Turn a messy X/Twitter bookmark pile into a local, readable digest.

This is a self-contained `macOS` skill for Codex / Claude Code / OpenClaw. It exports a logged-in user's X bookmarks from their real Chromium browser session, saves structured local artifacts, and then helps the agent produce:

- a categorized digest
- a bookmark index
- a reading queue
- high-signal summaries instead of a giant unsorted bookmark list

See the Chinese sections below for the full default README. You can also use:

- [INSTALL_PROMPT.md](./INSTALL_PROMPT.md)

</details>

## 这个 skill 解决什么问题

很多人在 X 上都是这个流程：

1. 看到好帖子
2. 扔进 bookmarks
3. 一直不整理
4. 以后真想找的时候，已经完全翻不动

这个 skill 就是为这个问题做的。

## 当前状态

- `macOS only`
- 已用真实登录浏览器会话实测
- 不依赖外部 `opencli`
- 不依赖外部 `bb-browser`
- 不依赖外部 `sqlite3` CLI
- 不需要 `npm install`

它把 bookmark 提取器和 SQLite 读取器都 vendoring 在 skill 里了。

## 运行前提

- `node >= 18`
- 以下浏览器之一：
  - Chrome
  - Arc
  - Brave
  - Edge
  - Chromium
- 该浏览器已经登录 X
- 本机网络可以访问 X

第一次自动读取浏览器 cookie 时，macOS 可能会弹一次对应浏览器的 Safe Storage 钥匙串授权。这个授权只用于解密本地浏览器里的 `auth_token` 和 `ct0`。

## 它是怎么工作的

导出器会：

1. 从真实浏览器会话里找到 `auth_token` 和 `ct0`
2. 直接调用 X 的 Bookmarks GraphQL API
3. 把结果写到 `runs/<timestamp>/`

之后 skill 工作流会继续读取这些本地产物，并写出最终的整理结果。

## 推荐使用方式

推荐把这个仓库作为 skill 放进 Codex / Claude Code / OpenClaw 里运行。

完整任务不是“导出了一堆 raw 文件”就算完成。只有下面这两个文件都写出来，才算真正完成：

```text
runs/<timestamp>/report/bookmark-digest.md
runs/<timestamp>/report/bookmark-index.md
```

## GitHub 首页可直接复制的安装 Prompt

如果你想让别人直接把一段 prompt 复制给自己的 Codex 或 Claude Code，让 agent 自动帮他们安装，这一段可以直接用。

### 只安装和校验

```text
请帮我安装这个 GitHub skill 到你当前宿主的全局 skills 目录里，并完成基础校验。

仓库：
https://github.com/loong-solvable/x-bookmark-digest-skill

安装要求：
1. 如果你运行在 Codex，把它安装到 ~/.codex/skills/x-bookmark-digest
2. 如果你运行在 Claude Code，把它安装到 ~/.claude/skills/x-bookmark-digest
3. 如果目标目录已存在并且就是这个仓库，更新到最新 main
4. 如果目标目录已存在但不是这个仓库，先备份成同级目录名加时间戳，再重新安装
5. 安装完成后，确认以下文件存在：
   - SKILL.md
   - README.md
   - package.json
   - scripts/export_x_bookmarks.mjs
   - vendor/sql.js/dist/sql-wasm.js
   - vendor/sql.js/dist/sql-wasm.wasm
6. 这一步只做安装和静态校验，不要运行 export，不要读取浏览器 cookie，不要触发钥匙串弹窗
7. 最后告诉我：
   - 实际安装路径
   - 是否需要重启或重开当前工具才能识别新 skill
   - 安装是否成功
```

如果你想让别人“安装后直接开始整理 bookmarks”，用这里：

- [INSTALL_PROMPT.md](./INSTALL_PROMPT.md)

## 快速开始

在仓库根目录运行：

```bash
npm run check
npm run export
```

如果自动探测命中了错误 profile：

```bash
node scripts/export_x_bookmarks.mjs --browser chrome --profile Default
```

如果你不想走钥匙串自动读取，也可以手动传 cookie：

```bash
node scripts/export_x_bookmarks.mjs \
  --auth-token "$X_AUTH_TOKEN" \
  --ct0 "$X_CT0"
```

## Skill 模式和脚本模式的区别

这两种不是一回事：

- 脚本模式
  - 运行 `scripts/export_x_bookmarks.mjs`
  - 负责把 bookmarks 导出成结构化本地产物
  - 适合做登录态检查和数据提取验证
- skill 模式
  - 在 Codex / Claude Code / OpenClaw 里作为 skill 运行
  - 先导出 bookmarks
  - 再读取本地产物
  - 最后写出 digest 和 bookmark index

如果你只是在 shell 里单独跑脚本，预期应该是先得到 export 产物，而不是自动得到完整 digest。

## 输出目录结构

每次运行都会创建一个新目录：

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
    ├── bookmark-digest.md
    └── bookmark-index.md
```

## 最终效果是什么样

最终的 `bookmark-digest.md` 应该告诉用户：

- 这批 bookmarks 整体到底在收藏什么
- 主要分类桶有哪些
- 为什么这样分
- 哪些帖子最值得先看
- 重复出现的作者 / 域名 / 主题
- 哪些适合立刻行动
- 哪些更适合长期存档

`bookmark-index.md` 会按分类列出：

- 短标题
- 1 句摘要
- 作者 / handle
- 原始 X 链接

## 隐私边界

- 所有处理都在本机完成
- 原始 bookmark 数据只写本地
- 这个 skill 不会自动把书签上传到第三方服务

## 当前边界

目前只保证 `macOS` 路径自包含可用。

Windows 和 Linux 还没有做到同等标准的打包和验证。
