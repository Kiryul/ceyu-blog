---
name: ceyu
description: 策屿博客一键发布工具。子命令 article 将 source/_posts/ 下的文章提交并推送到 GitHub 完成发布；子命令 idea 将一条随想插入 source/_data/thoughts.yml 后提交推送。当用户输入 /ceyu article <文件名> 或 /ceyu idea <内容>，或要求发布博客文章、发布随想时使用。
---

# 策屿博客发布（ceyu）

仓库路径：`D:\Project\vibe\ceyu-blog`。所有 git 命令统一使用 `git -C D:\Project\vibe\ceyu-blog ...`，不要 cd。

## 子命令分发

解析参数第一个词：
- `article <文件名>` → 执行「发布文章」流程
- `idea <内容>` → 执行「发布随想」流程（第一个词之后的全部文本作为随想内容）
- 无参数或无法识别 → 向用户说明两种用法，不做任何修改

## 发布文章（article）

1. **定位文件**：
   - 文件名可省略 `.md` 后缀。优先在 `source/_posts/` 下查找；
   - 若参数是指向 `_posts` 之外的 .md 路径且文件存在，用 Read 读取后以 Write 复制到 `source/_posts/`（保留原文件名）；
   - 找不到文件 → 报告用户并终止，不提交任何内容。
2. **校验 front-matter**（用 Read 读取文件头部）：
   - 必须包含 `title`、`date`、`categories`、`tags`。`categories` 取值只能是 `技术博文` 或 `资讯热点`；
   - 若完全没有 front-matter：用 SearchReplace 在文件开头补齐（title 用文件名，date 用当前时间 `YYYY-MM-DD HH:mm:ss`，categories 默认 `技术博文`），并在最终报告中说明补了什么；
   - 若正文没有 `<!-- more -->`：不阻断发布，仅在报告中提醒（影响首页摘要截断）。
3. **提交推送**：按下方「统一发布流程」执行，commit message 为 `post: 发布文章《<title>》`。

## 发布随想（idea）

1. **构造新条目**：id 取 `t` + 当前时间紧凑格式 `tYYYYMMDDHHmmss`（如 t20260730163030，是该随想回复线程的唯一标识，发布后不可改）；date 取当前时间 `YYYY-MM-DD HH:mm:ss`；content 为用户输入原文。
   - 若内容包含 `: `、`#`，或以 `-`、`[`、`{`、引号等 YAML 特殊字符开头，content 值用双引号包裹并把内部 `"` 转义为 `\"`；否则保持裸文本。
2. **插入到列表最前**（thoughts.yml 按时间倒序，新的在最上面）：用 SearchReplace 在头部注释后的**第一个 `- id:` 条目之前**插入三行：

   ```yaml
   - id: t<当前时间紧凑格式>
     content: <内容>
     date: <当前时间>
   ```

   缩进严格对齐现有条目（`- id:` 顶格，`content:`、`date:` 前两个空格）。**禁止用 echo/Set-Content 等 shell 命令改写此文件**（会破坏 UTF-8 中文编码）。
3. **验证**：Read 回读文件头部，确认新条目格式与旧条目一致、无缩进错位。
4. **提交推送**：按「统一发布流程」执行，commit message 为 `thought: 新增随想`，只 `git add source/_data/thoughts.yml`。

## 统一发布流程（两个子命令共用）

前置检查：`git status -sb` 确认当前在 develop；若有**与本次发布无关**的未提交改动，只 add 本次目标文件，不要 `git add -A`。

```
git -C D:\Project\vibe\ceyu-blog add <目标文件>
git -C D:\Project\vibe\ceyu-blog commit -m "<message>"
git -C D:\Project\vibe\ceyu-blog push origin develop
git -C D:\Project\vibe\ceyu-blog push github develop
git -C D:\Project\vibe\ceyu-blog checkout master
git -C D:\Project\vibe\ceyu-blog merge develop
git -C D:\Project\vibe\ceyu-blog push github master
git -C D:\Project\vibe\ceyu-blog push origin master
git -C D:\Project\vibe\ceyu-blog checkout develop
```

注意事项：
- `push github master` 是触发 Vercel 生产部署的关键一步，失败必须重试成功，不能跳过；
- 推 GitHub 偶发 `Connection reset`，属网络抖动，重试 1~2 次即可；不要因此改凭据配置；
- 任一步骤失败导致流程中断时，必须先 `checkout develop` 回到工作分支再向用户报告；
- PowerShell 中多条命令用 `;` 分隔，不能用 `&&`。

## 完成报告

向用户汇报：发布类型与内容摘要、commit hash、四个远程分支（origin/github × develop/master）是否全部推送成功、Vercel 部署已由 `github/master` 推送自动触发。
