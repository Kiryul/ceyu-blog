---
title: 用 Hexo 搭建个人博客网站：从零到上线的完整实录
date: 2026-07-29 16:00:00
categories: 技术博文
tags: [Hexo, 博客, Vercel, 前端]
---

本站「策屿」就是用 Hexo 从零搭起来的。这篇文章不谈概念，只讲**具体步骤与具体操作**：每一步执行什么命令、改哪个文件、写什么内容，照着敲一遍，你就能拥有一个和本站同款架构的博客。

<!-- more -->

## 第 1 步：环境准备

只需要 Node.js（建议 18+）和 Git。验证环境：

```bash
node -v    # v18.x 以上
git --version
```

全局安装 Hexo 脚手架：

```bash
npm install -g hexo-cli
```

## 第 2 步：初始化项目

```bash
hexo init ceyu-blog
cd ceyu-blog
npm install
hexo server
```

浏览器打开 `http://localhost:4000`，看到默认的 landscape 主题页面即成功。此后开发期间让 `hexo server` 一直挂着——**文章和主题文件保存即热更新，但 `_config.yml` 改动必须 Ctrl+C 重启才生效**。

## 第 3 步：改站点配置

打开根目录 `_config.yml`，逐项修改：

```yaml
# 站点信息
title: 策屿
author: kiryul
language: zh-CN
timezone: Asia/Shanghai

# 永久链接：默认是 :year/:month/:day/:title/，改成扁平结构更干净
permalink: posts/:title/

# 每页文章数
per_page: 10
```

改完重启 `hexo server` 验证标题已变。

## 第 4 步：创建自己的主题

不想套别人的主题，就自己写一个。操作如下：

**4.1 建目录骨架**

```bash
mkdir -p themes/anime/layout/_partial
mkdir -p themes/anime/source/css themes/anime/source/js themes/anime/source/img
```

**4.2 写全局骨架** `themes/anime/layout/layout.ejs`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><%= page.title ? page.title + ' | ' : '' %><%= config.title %></title>
  <link rel="stylesheet" href="<%- url_for('/css/style.css') %>">
</head>
<body>
  <%- partial('_partial/header') %>
  <main class="site-main"><%- body %></main>
  <%- partial('_partial/footer') %>
  <script src="<%- url_for('/js/main.js') %>"></script>
</body>
</html>
```

`<%- body %>` 是关键：Hexo 会把各页面模板的渲染结果注入这里。

**4.3 写页面模板**（每种页面一个文件，都会自动套进 layout.ejs）：

- `index.ejs` — 首页，遍历 `page.posts` 输出文章卡片
- `post.ejs` — 文章页，输出 `page.title`、`page.date`、`<%- page.content %>`
- `archive.ejs` — 归档页，按年份分组遍历 `site.posts`

以 `index.ejs` 为例：

```html
<% page.posts.each(function (post) { %>
  <article class="post-card">
    <h2><a href="<%- url_for(post.path) %>"><%= post.title %></a></h2>
    <p><%- post.excerpt %></p>
  </article>
<% }) %>
<%- partial('_partial/paginator') %>
```

**4.4 启用主题**：站点 `_config.yml` 里改一行，然后重启：

```yaml
theme: anime
```

两个实际踩过的坑：

- EJS 里写内联 JS 对象时**末尾多一个逗号**会直接语法错误，报错位置还不准，排查很久
- IDE 会把 EJS 当纯 CSS/JS 解析报一堆假错误，忽略即可，以浏览器实际渲染为准

## 第 5 步：写第一篇文章

```bash
hexo new "我的第一篇文章"
```

生成 `source/_posts/我的第一篇文章.md`，front-matter 按本站规范补全：

```markdown
---
title: 我的第一篇文章
date: 2026-07-29 16:00:00
categories: 技术博文
tags: [Hexo, 博客]
---

这里是首页显示的摘要。

<!-- more -->

这里是正文，只在文章页显示。
```

`<!-- more -->` 之前的内容会作为首页卡片摘要，务必写。保存后无需重启，刷新首页即可看到。

## 第 6 步：加本地搜索

```bash
npm install hexo-generator-search --save
```

站点 `_config.yml` 追加：

```yaml
search:
  path: search.xml
  field: post
```

重启后访问 `/search.xml` 能看到全文索引。前端 `fetch('/search.xml')` 拿到 XML，在内存里对标题和正文做关键词匹配、渲染结果列表，全程零后端。

## 第 7 步：接入 Waline 评论 + 浏览量

具体操作分三段：

**7.1 数据库**：注册 [LeanCloud 国际版](https://console.leancloud.app/) → 创建应用 → 设置 → 应用凭证，记下 `APP_ID / APP_KEY / MASTER_KEY`。

**7.2 服务端**：用 Waline 官方模板一键部署到 Vercel，部署时把上面三个值填进环境变量。需要「评论先审后显」就再加一个 `COMMENT_AUDIT=true`。部署完成后**给这个服务绑一个自定义域名**——Vercel 分配的 `*.vercel.app` 随机域名在国内网络大概率打不开，这是实测结论。

**7.3 前端**：文章模板里放一个挂载点并初始化：

```html
<div id="waline"></div>
<script type="module">
  import { init } from 'https://unpkg.com/@waline/client@v3/dist/waline.js';
  init({
    el: '#waline',
    serverURL: 'https://你绑定的评论服务域名',
    requiredMeta: ['nick', 'mail'],
    pageview: true,   // 顺带开启浏览量统计
  });
</script>
```

浏览量展示只需在模板里放 `<span class="waline-pageview-count" data-path="<%- url_for(page.path) %>"></span>`，Waline 会自动填充。

## 第 8 步：随想页 —— 拿 `_data` 当轻量数据库

想发一两句话的碎碎念，不值得为此建文章。具体做法：

**8.1** 新建 `source/_data/thoughts.yml`：

```yaml
- content: 深夜调试代码，窗外下起了雨。
  date: 2026-07-20 23:40:00
- content: 今天把博客的需求文档定稿了！
  date: 2026-07-15 21:10:00
```

**8.2** 新建独立页面 `source/thoughts/index.md`，front-matter 里指定 `layout: thoughts`。

**8.3** 主题里写 `layout/thoughts.ejs`，通过 `site.data.thoughts` 直接拿到上面的数组，遍历渲染成瀑布流卡片，前端 JS 做分页（每页 10 条）。

之后发一条随想 = 往 yml 顶部加两行，保存即上线（本地热更新）。

## 第 9 步：部署到 Vercel

**9.1 建仓库并推送**：

```bash
git init
git add .
git commit -m "init: hexo blog"
git remote add github https://github.com/<你的用户名>/ceyu-blog.git
git push -u github master
```

推送前检查 `.gitignore` 必须包含（Hexo 默认已生成）：

```
node_modules/
public/
db.json
```

**9.2 显式声明构建配置**：仓库根目录新建 `vercel.json`：

```json
{
  "framework": "hexo",
  "buildCommand": "hexo generate",
  "outputDirectory": "public",
  "installCommand": "npm install"
}
```

**9.3 导入 Vercel**：控制台 → Add New → Project → 选中 GitHub 仓库 → 构建配置会自动读取 `vercel.json`，直接 Deploy。

**9.4 绑定自定义域名**：项目 Settings → Domains 添加自己的域名，按提示在 DNS 服务商加一条 CNAME 记录。理由同 Waline：`*.vercel.app` 在国内基本打不开，自定义域名不是可选项而是必选项。

## 第 10 步：建立日常发布流程

我的分支策略：日常改动全在 `develop`，`master` 是 Vercel 盯着的生产分支。发布一篇文章的完整操作：

```bash
# 1. 写文章
hexo new "文章标题"
# ...编辑 source/_posts/文章标题.md...

# 2. 提交到开发分支
git add source/_posts/文章标题.md
git commit -m "post: 发布文章《文章标题》"
git push github develop

# 3. 合并进生产分支，触发 Vercel 自动部署
git checkout master
git merge develop
git push github master
git checkout develop
```

`push github master` 后一两分钟，Vercel 构建完成，文章自动上线。发随想同理，只是改动的文件换成 `source/_data/thoughts.yml`。

## 小结

回看整个流程：`hexo init` 起项目 → 改 `_config.yml` → 自建主题模板 → 插件加搜索 → Waline 加评论 → `_data` 加随想 → `vercel.json` + GitHub 完成自动化部署。每一步都是可复制的具体操作，全程零服务器成本，唯一要花钱的是一个域名。

如果你也想搭一个，现在就打开终端，从第 1 步开始。
