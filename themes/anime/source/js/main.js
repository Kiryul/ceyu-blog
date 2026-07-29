/* anime 主题主脚本：主题切换 / 壁纸 / 无刷新导航(pjax) / 首页语录 / 鼠标特效 / 页面动效 / Waline */
(function () {
  'use strict';

  var CFG = window.ANIME_THEME || {};
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 全站背景壁纸：图片加载完成后再淡入，避免解码突变闪烁 ---------- */
  var siteBg = document.getElementById('site-bg');
  if (siteBg) {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var bgSrc = isDark ? CFG.bgDark : CFG.bgLight;
    if (bgSrc) {
      var bgImg = new Image();
      var bgReady = function () {
        siteBg.classList.add('bg-ready');
        // 标记本会话壁纸已缓存：后续整页加载首帧直接显示壁纸（见 layout.ejs 首屏脚本）
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

  /* ---------- Waline 评论 + 浏览量：模块只加载一次，每次换页后重新挂载 ---------- */
  var walinePromise = null;
  var walineInst = null;
  function loadWaline() {
    if (!walinePromise) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/@waline/client@v3/dist/waline.css';
      document.head.appendChild(link);
      walinePromise = import('https://unpkg.com/@waline/client@v3/dist/waline.js');
    }
    return walinePromise;
  }
  function applyWaline() {
    if (!CFG.walineServer) return;
    loadWaline().then(function (m) {
      if (walineInst && walineInst.destroy) { walineInst.destroy(); walineInst = null; }
      if (document.getElementById('waline')) {
        walineInst = m.init({ el: '#waline', serverURL: CFG.walineServer, requiredMeta: ['nick', 'mail'], pageview: true, lang: 'zh-CN' });
        var views = document.getElementById('post-views');
        if (views) views.hidden = false;
      } else {
        m.pageviewCount({ serverURL: CFG.walineServer });
      }
    }).catch(function () { /* CDN 加载失败静默降级 */ });
  }

  /* ---------- 列表滚动渐显（IntersectionObserver，同屏卡片错峰入场） ---------- */
  var revealIO = null;
  function initReveal() {
    if (revealIO) { revealIO.disconnect(); revealIO = null; }
    if (REDUCED || !('IntersectionObserver' in window)) return;
    var items = document.querySelectorAll('.post-card, .thought-card, .archive-item, .side-card');
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('revealed');
        if (revealIO) revealIO.unobserve(el);
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
      revealIO.observe(el);
    });
  }

  /* ---------- 首页 hero：语录 + 壁纸 + 下滑 ---------- */
  var heroTimer = null;
  function initHero() {
    if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
    var hero = document.getElementById('hero');
    if (!hero) return;
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
      heroTimer = setInterval(showQuote, CFG.quoteInterval || 8000);
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

  /* ---------- 个人随想：瀑布流前端分页（每页 N 条，换页后重建） ---------- */
  function initThoughts() {
    var wall = document.getElementById('thoughts-waterfall');
    var pager = document.getElementById('thoughts-pager');
    if (!wall || !pager) return;

    var PER_PAGE = CFG.thoughtsPerPage || 10;
    var cards = Array.prototype.slice.call(wall.querySelectorAll('.thought-card'));
    var total = Math.max(1, Math.ceil(cards.length / PER_PAGE));
    var current = 1;

    function show(pageNum) {
      current = Math.min(Math.max(1, pageNum), total);
      var start = (current - 1) * PER_PAGE;
      var end = start + PER_PAGE;
      cards.forEach(function (card, i) {
        card.style.display = i >= start && i < end ? '' : 'none';
      });
      renderPager();
      wall.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderPager() {
      if (total <= 1) { pager.innerHTML = ''; return; }
      var html = '';
      html += '<button class="pager-btn" data-page="' + (current - 1) + '"' + (current === 1 ? ' disabled' : '') + '>‹ 上一页</button>';
      for (var i = 1; i <= total; i++) {
        html += '<button class="pager-btn num' + (i === current ? ' current' : '') + '" data-page="' + i + '">' + i + '</button>';
      }
      html += '<button class="pager-btn" data-page="' + (current + 1) + '"' + (current === total ? ' disabled' : '') + '>下一页 ›</button>';
      pager.innerHTML = html;
    }

    pager.addEventListener('click', function (e) {
      var btn = e.target.closest('.pager-btn');
      if (!btn || btn.disabled) return;
      show(parseInt(btn.dataset.page, 10));
    });

    // 初始化：显示第一页（不滚动）
    cards.forEach(function (card, i) {
      card.style.display = i < PER_PAGE ? '' : 'none';
    });
    renderPager();
  }

  /* ---------- 顶栏滚动状态 ---------- */
  var header = document.getElementById('site-header');
  var onScroll = function () {
    if (header) header.classList.toggle('scrolled', window.scrollY > 30);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- 每页初始化：首次加载与每次 pjax 换页后执行 ---------- */
  function initPage() {
    initReveal();
    initHero();
    initThoughts();
    applyWaline();
    onScroll();
  }

  /* ---------- 无刷新导航（pjax + 同文档 View Transition）----------
     跨文档跳转在「旧文档卸载 → 新文档首帧」之间存在浏览器白帧，CSS 无法覆盖。
     改为 fetch 新页面并在同一文档内替换 <main>，文档不销毁，白帧从机制上消失；
     支持 startViewTransition 时由 VT 完成旧页垫底、新页渐显（规则见 style.css） */
  var navigating = false;
  var lastPath = location.pathname + location.search;

  // 换页后同步顶栏导航的当前项高亮（直接取服务端渲染好的 active 类）
  function syncNav(doc) {
    var cur = document.querySelectorAll('.site-nav .nav-link');
    var next = doc.querySelectorAll('.site-nav .nav-link');
    cur.forEach(function (a, i) { if (next[i]) a.className = next[i].className; });
  }

  function swapTo(doc, url) {
    document.title = doc.title;
    document.body.className = doc.body.className; // 同步 is-home 等页面级类
    var oldMain = document.querySelector('.site-main');
    var newMain = doc.querySelector('.site-main');
    oldMain.replaceWith(newMain);
    syncNav(doc);
    // 收起移动端菜单与搜索弹窗
    var toggle = document.getElementById('nav-toggle');
    if (toggle) toggle.checked = false;
    var modal = document.getElementById('search-modal');
    if (modal) modal.hidden = true;
    // 有锚点滚到锚点，否则回到顶部
    var anchor = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (anchor) anchor.scrollIntoView();
    else window.scrollTo(0, 0);
    initPage();
  }

  function pjaxTo(href, push) {
    if (navigating) return;
    navigating = true;
    var url = new URL(href, location.href);
    fetch(url.href).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var type = res.headers.get('content-type') || '';
      if (type.indexOf('text/html') < 0) throw new Error('non-html');
      return res.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc.querySelector('.site-main')) throw new Error('layout mismatch');
      if (push) history.pushState({ pjax: true }, '', url.href);
      lastPath = url.pathname + url.search;
      navigating = false;
      var swap = function () { swapTo(doc, url); };
      if (document.startViewTransition && !REDUCED) {
        document.startViewTransition(swap);
      } else {
        swap();
      }
    }).catch(function () {
      // 任何异常（网络失败 / 非站内布局页面）退回整页跳转
      navigating = false;
      location.href = url.href;
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    // 跳过：新窗口 / 下载 / 外链 / 修饰键 / 默认行为已阻止
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    if (a.origin !== location.origin) return;
    // 跳过：静态资源直链（图片 / json / xml 等，.html 除外）
    if (/\.(?!html?$)[a-z0-9]+$/i.test(a.pathname)) return;
    if (a.pathname === location.pathname && a.search === location.search) {
      if (a.hash) return; // 同页锚点交给浏览器
      e.preventDefault(); // 点击当前页链接：平滑回顶即可
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    e.preventDefault();
    pjaxTo(a.href, true);
  });

  // 浏览器前进 / 后退同样走无刷新渲染
  window.addEventListener('popstate', function () {
    var p = location.pathname + location.search;
    if (p === lastPath) return; // 纯 hash 变化不处理
    pjaxTo(location.href, false);
  });

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

  /* ---------- 首次进入初始化 ---------- */
  initPage();
})();
