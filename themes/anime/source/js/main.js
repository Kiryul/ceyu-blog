/* anime 主题主脚本：主题切换 / 首页语录 / 壁纸 / 鼠标特效 / 下滑箭头 / 页面过渡 / Waline */
(function () {
  'use strict';

  var CFG = window.ANIME_THEME || {};
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 支持跨文档 View Transitions 时，跳转渐变由浏览器原生接管（无空白帧）
  var HAS_VT = 'PageRevealEvent' in window;

  /* ---------- 全站背景壁纸：图片加载完成后再淡入，避免解码突变闪烁 ---------- */
  var siteBg = document.getElementById('site-bg');
  if (siteBg) {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var bgSrc = isDark ? CFG.bgDark : CFG.bgLight;
    if (bgSrc) {
      var bgImg = new Image();
      var bgReady = function () {
        siteBg.classList.add('bg-ready');
        // 标记本会话壁纸已缓存：后续页面首帧直接显示壁纸，消除跨页空窗闪白（见 layout.ejs 首屏脚本）
        try { sessionStorage.setItem('anime-bg-ready', '1'); } catch (e) {}
      };
      bgImg.onload = bgReady;
      bgImg.onerror = bgReady; // 加载失败也显示层（退回遮罩底色）
      bgImg.src = bgSrc;
      if (bgImg.complete) bgReady(); // 命中缓存时立即显示
    } else {
      siteBg.classList.add('bg-ready');
    }
    // 切换主题后预加载另一张壁纸，保证下次切换无延迟
    var otherSrc = isDark ? CFG.bgLight : CFG.bgDark;
    if (otherSrc) { new Image().src = otherSrc; }
  }

  /* ---------- 亮暗主题切换（localStorage 持久化 + View Transitions 交叉淡入） ---------- */
  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      var apply = function () {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      };
      if (document.startViewTransition && !REDUCED) {
        document.startViewTransition(apply);
      } else {
        apply();
      }
    });
  }

  /* ---------- 站内跳转渐隐过渡（仅无跨文档 VT 的浏览器需要手动过渡） ---------- */
  if (!REDUCED && !HAS_VT) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      // 跳过：新窗口 / 下载 / 外链 / 修饰键 / 默认行为已阻止
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      if (a.origin !== location.origin) return;
      // 跳过：同页锚点
      if (a.pathname === location.pathname && a.hash) return;
      e.preventDefault();
      var href = a.href;
      document.body.classList.add('page-leaving');
      setTimeout(function () { location.href = href; }, 200);
    });
    // 从 bfcache 返回时恢复可见
    window.addEventListener('pageshow', function () {
      document.body.classList.remove('page-leaving');
    });
  }

  /* ---------- 列表滚动渐显（IntersectionObserver，同屏卡片错峰入场） ---------- */
  if (!REDUCED && 'IntersectionObserver' in window) {
    var items = document.querySelectorAll('.post-card, .thought-card, .archive-item, .side-card');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('revealed');
        io.unobserve(el);
        // 过渡结束后清理类，避免与 hover 的 transform 过渡互相干扰
        setTimeout(function () {
          el.classList.remove('reveal', 'revealed');
          el.style.transitionDelay = '';
        }, 700 + 400);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    var stagger = 0;
    items.forEach(function (el) {
      // 首屏内的卡片错峰延迟，其余进入视口时立即渐显
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.style.transitionDelay = Math.min(stagger++ * 70, 420) + 'ms';
      }
      el.classList.add('reveal');
      io.observe(el);
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
