/* anime 主题主脚本：主题切换 / 首页语录 / 壁纸 / 鼠标特效 / 下滑箭头 / Waline */
(function () {
  'use strict';

  var CFG = window.ANIME_THEME || {};

  /* ---------- 亮暗主题切换（localStorage 持久化） ---------- */
  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  /* ---------- 首页 hero：语录 + 壁纸 + 下滑 ---------- */
  var hero = document.getElementById('hero');
  if (hero) {
    var dataEl = document.getElementById('hero-data');
    var heroData = { quotes: [], wallpapers: [] };
    try { heroData = JSON.parse(dataEl.textContent); } catch (e) { /* 数据缺失时静默降级 */ }

    // 随机语录 + 定时淡入淡出切换
    var quoteEl = document.getElementById('hero-quote');
    var quotes = heroData.quotes || [];
    if (quoteEl && quotes.length) {
      var qi = Math.floor(Math.random() * quotes.length);
      var showQuote = function () {
        quoteEl.classList.add('fade-out');
        setTimeout(function () {
          quoteEl.textContent = '「 ' + quotes[qi] + ' 」';
          quoteEl.classList.remove('fade-out');
          qi = (qi + 1 + Math.floor(Math.random() * (quotes.length - 1))) % quotes.length;
        }, 400);
      };
      quoteEl.textContent = '「 ' + quotes[qi] + ' 」';
      qi = (qi + 1) % quotes.length;
      setInterval(showQuote, CFG.quoteInterval || 8000);
    }

    // 按时间段选取壁纸（morning/day/dusk/night），支持图片与视频
    var bgEl = document.getElementById('hero-bg');
    if (bgEl) {
      var hour = new Date().getHours();
      var period = hour >= 5 && hour < 10 ? 'morning'
        : hour >= 10 && hour < 17 ? 'day'
        : hour >= 17 && hour < 20 ? 'dusk' : 'night';
      var pool = (heroData.wallpapers || []).filter(function (w) { return w.period === period; });
      if (!pool.length) pool = heroData.wallpapers || [];
      if (pool.length) {
        var wp = pool[Math.floor(Math.random() * pool.length)];
        if (wp.src && wp.type === 'video') {
          var video = document.createElement('video');
          video.src = wp.src;
          video.autoplay = true; video.loop = true; video.muted = true; video.playsInline = true;
          video.className = 'hero-video';
          bgEl.appendChild(video);
        } else if (wp.src) {
          bgEl.style.backgroundImage = 'url(' + wp.src + ')';
        } else if (wp.fallback) {
          bgEl.style.backgroundImage = wp.fallback;
        }
      }
    }

    // 下滑箭头：点击平滑滚动至近期文章；hero 内滚轮下滑同样触发
    var recent = document.getElementById('recent');
    var goRecent = function () {
      if (recent) recent.scrollIntoView({ behavior: 'smooth' });
    };
    var arrow = document.getElementById('scroll-down');
    if (arrow) arrow.addEventListener('click', goRecent);
    var wheelLock = false;
    hero.addEventListener('wheel', function (e) {
      if (e.deltaY > 0 && window.scrollY < hero.offsetHeight / 3 && !wheelLock) {
        wheelLock = true;
        goRecent();
        setTimeout(function () { wheelLock = false; }, 1200);
      }
    }, { passive: true });

    // hover 视差光晕
    hero.addEventListener('mousemove', function (e) {
      var x = e.clientX / window.innerWidth - 0.5;
      var y = e.clientY / window.innerHeight - 0.5;
      var content = hero.querySelector('.hero-content');
      if (content) content.style.transform = 'translate(' + x * 14 + 'px,' + y * 10 + 'px)';
    });
  }

  /* ---------- 全局鼠标点击星星粒子特效 ---------- */
  var COLORS = ['#ff8fb3', '#8fd3ff', '#c9a7ff', '#ffd98f', '#a7ffd4'];
  document.addEventListener('click', function (e) {
    for (var i = 0; i < 8; i++) {
      var s = document.createElement('span');
      s.className = 'click-star';
      s.textContent = '✦';
      s.style.left = e.pageX + 'px';
      s.style.top = e.pageY + 'px';
      s.style.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      s.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      s.style.setProperty('--dy', (Math.random() * -100 - 20) + 'px');
      document.body.appendChild(s);
      s.addEventListener('animationend', function () { this.remove(); });
    }
  });

  /* ---------- 顶栏滚动状态 ---------- */
  var header = document.getElementById('site-header');
  var onScroll = function () {
    if (header) header.classList.toggle('scrolled', window.scrollY > 30);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Waline 评论 + 浏览量（serverURL 配置后启用） ---------- */
  var walineEl = document.getElementById('waline');
  if (CFG.walineServer) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/@waline/client@v3/dist/waline.css';
    document.head.appendChild(link);

    var script = document.createElement('script');
    script.type = 'module';
    script.textContent =
      "import { init, pageviewCount } from 'https://unpkg.com/@waline/client@v3/dist/waline.js';\n" +
      (walineEl
        ? "init({ el: '#waline', serverURL: '" + CFG.walineServer + "', requiredMeta: ['nick','mail'], pageview: true, lang: 'zh-CN' });\n"
        : "pageviewCount({ serverURL: '" + CFG.walineServer + "' });\n");
    document.body.appendChild(script);

    var views = document.getElementById('post-views');
    if (views) views.hidden = false;
  }
})();
