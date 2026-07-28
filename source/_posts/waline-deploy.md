---
title: Waline 自托管部署速记
date: 2026-04-10 09:30:00
categories: 技术博文
tags: [Waline, 部署, 博客]
---

给静态博客加评论和浏览量，Waline 自托管是目前体验最好的方案之一。

<!-- more -->

## 部署步骤

1. LeanCloud 国际版创建应用，拿到 `APP_ID / APP_KEY / MASTER_KEY`
2. Vercel 一键部署 Waline 服务端，配置上述环境变量
3. 需要审核后展示评论时，追加环境变量 `COMMENT_AUDIT=true`
4. 前端 `init({ serverURL, requiredMeta: ['nick','mail'], pageview: true })`

十分钟搞定，还自带管理后台（`/ui`）。
