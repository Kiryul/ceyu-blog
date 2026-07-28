---
title: CSS 多列布局实现瀑布流的踩坑记录
date: 2026-07-12 20:00:00
categories: 技术博文
tags: [CSS, 前端]
---

用 `column-count` 实现瀑布流最简单，但也有顺序上的坑。

<!-- more -->

## 优点

无需 JS 计算高度，一行 CSS 搞定：

```css
.waterfall { column-count: 2; column-gap: 18px; }
.item { break-inside: avoid; }
```

## 坑

多列布局是"先竖后横"排列，如果业务要求严格按时间从左到右，就需要换成 JS 方案（如 Masonry）。个人随想页对顺序不敏感，所以 CSS 方案够用了。
