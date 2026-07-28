---
title: CSS 变量实现亮暗主题切换的最佳实践
date: 2026-05-18 10:00:00
categories: 技术博文
tags: [CSS, 前端]
---

`data-theme` + CSS 变量 + localStorage，三件套搞定主题切换。

<!-- more -->

## 关键点

- 变量集中定义在 `:root` 与 `html[data-theme='dark']` 两处
- 首屏内联脚本同步读取 localStorage，避免"闪白"
- `prefers-color-scheme` 作为无偏好时的默认值

```js
var t = localStorage.getItem('theme') ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', t);
```
