---
title: Vercel 部署 Hexo 博客避坑指南
date: 2025-12-08 16:00:00
categories: 技术博文
tags: [Vercel, 部署, Hexo]
---

Git push 即发布，Vercel 是静态博客部署的省心之选。

<!-- more -->

## 要点

- 构建命令 `hexo generate`，输出目录 `public`
- Node 版本在项目设置里锁定，避免构建环境漂移
- 中文文件名/分类路径注意 URL 编码问题，Hexo 默认处理得不错
- 自定义域名记得同时配 www 与裸域的重定向
