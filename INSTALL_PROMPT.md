# Install Prompt

Copy one of the prompts below into Codex or Claude Code.

## Prompt 1: Install Only

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

## Prompt 2: Install And Run

```text
请先安装这个 GitHub skill，然后立即用它帮我整理我的 X bookmarks。

仓库：
https://github.com/loong-solvable/x-bookmark-digest-skill

要求：
1. 如果你运行在 Codex，把它安装到 ~/.codex/skills/x-bookmark-digest
2. 如果你运行在 Claude Code，把它安装到 ~/.claude/skills/x-bookmark-digest
3. 如果目标目录已存在并且就是这个仓库，更新到最新 main
4. 如果目标目录已存在但不是这个仓库，先备份成同级目录名加时间戳，再重新安装
5. 安装完成后开始运行这个 skill
6. 当前只按 macOS 路径处理
7. 优先使用真实 Chromium 浏览器里的已登录 X 会话
8. 如果第一次读取浏览器 cookie 需要 macOS 钥匙串授权，就明确提示我点“允许”或“始终允许”
9. 任务只有在下面两个文件都写出来之后才算完成：
   - runs/<timestamp>/report/bookmark-digest.md
   - runs/<timestamp>/report/bookmark-index.md
10. 完成后告诉我：
   - skill 安装到了哪里
   - 本次运行目录
   - 导出了多少条 bookmarks
   - digest 和 index 文件路径
```
