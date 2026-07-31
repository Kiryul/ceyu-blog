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
        walineInst = m.init({ el: '#waline', serverURL: CFG.walineServer, requiredMeta: ['nick', 'mail'], pageview: true, lang: 'zh-CN', dark: 'html[data-theme="dark"]' });
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
  var heroWheel = null;   // window 级滚轮接管，pjax 换页时先解绑再重挂
  var heroSettle = null;  // 非滚轮滚动（拖滚动条/触屏）停在过渡带时的就近吸附
  function initHero() {
    if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
    if (heroWheel) { window.removeEventListener('wheel', heroWheel); heroWheel = null; }
    if (heroSettle) { window.removeEventListener('scroll', heroSettle); heroSettle = null; }
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

    // hero ⇆ 近期文章 整屏吸附：过渡带内滚轮下滑直达文章区、上滑直回 hero，
    // 吸附动画期间吞掉滚轮事件，避免被打断停在半截。
    // 自定义缓动（easeInOutCubic）替代原生 smooth：起止柔和不生硬，
    // 并联动 hero 内容渐隐/渐显与文章区标题入场（见 style.css .snap-in）
    var recent = document.getElementById('recent');
    var snapLock = false;
    var snapTo = function (top) {
      if (snapLock) return;
      snapLock = true;
      var content = hero.querySelector('.hero-content');
      var startY = window.scrollY;
      var dist = top - startY;
      var down = dist > 0;
      if (REDUCED || !dist) {
        window.scrollTo({ top: top, behavior: 'instant' });
        snapLock = false;
        return;
      }
      if (down && recent) {
        recent.classList.add('snap-in');
        setTimeout(function () { recent.classList.remove('snap-in'); }, 1400);
      }
      var dur = 750, t0 = performance.now();
      var step = function (now) {
        var p = Math.min((now - t0) / dur, 1);
        var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        window.scrollTo({ top: startY + dist * e, behavior: 'instant' });
        if (content) content.style.opacity = String(down ? 1 - e : e);
        if (p < 1) { requestAnimationFrame(step); return; }
        if (content) content.style.opacity = '';
        snapLock = false;
      };
      requestAnimationFrame(step);
    };
    var edgeTop = function () { return recent ? recent.offsetTop : hero.offsetHeight; };
    var goRecent = function () { snapTo(edgeTop()); };
    var arrow = document.getElementById('scroll-down');
    if (arrow) arrow.addEventListener('click', goRecent);
    heroWheel = function (e) {
      if (document.body.classList.contains('modal-open')) return; // 弹窗内滚动不接管
      if (snapLock) { e.preventDefault(); return; }
      var edge = edgeTop();
      var y = window.scrollY;
      if (e.deltaY > 0 && y < edge - 4) { e.preventDefault(); goRecent(); }
      else if (e.deltaY < 0 && y > 0 && y <= edge + 4) { e.preventDefault(); snapTo(0); }
    };
    window.addEventListener('wheel', heroWheel, { passive: false });
    // 拖滚动条 / 触屏等停在 hero 与文章区之间时，滚动停止后就近吸附收尾
    var settleTimer = null;
    heroSettle = function () {
      if (snapLock) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () {
        var edge = edgeTop();
        var y = window.scrollY;
        if (y > 4 && y < edge - 4) snapTo(y < edge / 2 ? 0 : edge);
      }, 160);
    };
    window.addEventListener('scroll', heroSettle, { passive: true });

    // hover 视差光晕
    hero.addEventListener('mousemove', function (e) {
      var x = e.clientX / window.innerWidth - 0.5;
      var y = e.clientY / window.innerHeight - 0.5;
      var content = hero.querySelector('.hero-content');
      if (content) content.style.transform = 'translate(' + x * 14 + 'px,' + y * 10 + 'px)';
    });
  }

  /* ---------- 轻提示（随想提交反馈等） ---------- */
  var toastTimer = null;
  function showToast(msg) {
    var el = document.getElementById('site-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'site-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- 个人随想：单列时间流 + 前端分页 + Waline REST 互动 ----------
     博主随想来自构建期静态 DOM（回复线程绑定 path /thoughts/<id>/）；
     访客随想是 /thoughts/ 路径下的 Waline 根评论，运行时渲染成同款卡片按时间混入；
     comment 字段是 Waline 服务端渲染并消毒过的 HTML，昵称等纯文本字段本地转义 */
  function initThoughts() {
    var wall = document.getElementById('thoughts-timeline');
    var pager = document.getElementById('thoughts-pager');
    if (!wall || !pager) return;

    var PER_PAGE = CFG.thoughtsPerPage || 10;
    var SERVER = (CFG.walineServer || '').replace(/\/+$/, '');
    var API = SERVER + '/api/comment';
    var totalEl = document.getElementById('thoughts-total');
    var items = [];
    var current = 1;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function fmt(ms) { return new Date(+ms).toLocaleString('zh-CN', { hour12: false }); }

    /* --- Waline 账号登录（发随想需登录）：token 存官方同款 WALINE_USER key，
       与文章页官方评论组件登录态互通；弹窗登录页通过 postMessage 回传 profile --- */
    function getAuthUser() {
      try {
        var u = JSON.parse(localStorage.getItem('WALINE_USER'));
        return u && u.token ? u : null;
      } catch (e) { return null; }
    }
    function clearAuthUser() { try { localStorage.removeItem('WALINE_USER'); } catch (e) {} }
    // 认证状态广播：登录/退出后通知所有登录入口（发随想区 + 各已展开回复框）统一重渲染，
    // 避免"在一处登录，另一处仍显示登录/注册"的状态残留。
    var authSubs = [];
    function onAuthChange(fn) { authSubs.push(fn); }
    function fireAuthChange() { authSubs.slice().forEach(function (f) { try { f(); } catch (e) {} }); }
    // 登录弹窗：严格对齐 Waline 官方客户端契约——打开 /ui/login，向弹窗发送
    // {type:'TOKEN'} 握手，监听登录页回传的 {type:'userInfo', data:{token,...}}。
    // 轮询检测弹窗被关闭以清理监听，避免未完成登录时残留。
    function walineLogin() {
      return new Promise(function (resolve, reject) {
        var w = 1024;
        var h = 600;
        var left = Math.max(0, (window.innerWidth - w) / 2 + (window.screenX || 0));
        var top = Math.max(0, (window.innerHeight - h) / 2 + (window.screenY || 0));
        var popup = window.open(
          SERVER + '/ui/login?lng=zh-CN',
          '_blank',
          'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
          ',scrollbars=no,resizable=no,status=no,location=no,toolbar=no,menubar=no'
        );
        if (!popup) { showToast('登录窗口被拦截，请允许弹窗后重试'); reject(new Error('popup blocked')); return; }
        // 握手：告知登录页通过 postMessage 回传（已登录时会立即回传）
        try { popup.postMessage({ type: 'TOKEN', data: null }, '*'); } catch (e) {}
        var timer = null;
        var done = false;
        var cleanup = function () {
          window.removeEventListener('message', recv);
          if (timer) { clearInterval(timer); timer = null; }
        };
        var recv = function (e) {
          var d = e.data;
          if (!d || typeof d !== 'object' || d.type !== 'userInfo' || !d.data || !d.data.token) return;
          done = true;
          cleanup();
          try { popup.close(); } catch (e2) {}
          try { localStorage.setItem('WALINE_USER', JSON.stringify(d.data)); } catch (err) {}
          fireAuthChange();
          resolve(d.data);
        };
        window.addEventListener('message', recv);
        // 检测弹窗关闭：登录页在关闭前会先 postMessage 回传用户信息，二者存在派发顺序竞争，
        // 若立即判定取消会误删监听、吞掉登录回调。故关闭后留出宽限期，等消息派发完再判取消。
        timer = setInterval(function () {
          if (!popup.closed) return;
          clearInterval(timer); timer = null;
          setTimeout(function () {
            if (done) return;
            cleanup();
            reject(new Error('login cancelled'));
          }, 400);
        }, 500);
      });
    }
    // 服务端对无效 token 不报错而是静默降级为匿名发布（实测），提交前必须显式校验
    function verifyToken(token) {
      return fetch(SERVER + '/api/token?lang=zh-CN', { headers: { Authorization: 'Bearer ' + token } })
        .then(function (r) { return r.json(); })
        .then(function (res) { return !!(res.data && Object.keys(res.data).length); });
    }

    /* --- 时间流排序 + 分页（静态与访客卡片统一按 data-time 倒序） --- */
    function collect() {
      items = Array.prototype.slice.call(wall.querySelectorAll('.thought-item'));
      items.sort(function (a, b) { return (+b.dataset.time) - (+a.dataset.time); });
      items.forEach(function (el) { wall.appendChild(el); });
      if (totalEl) totalEl.textContent = items.length;
    }

    function show(pageNum, scroll) {
      var total = Math.max(1, Math.ceil(items.length / PER_PAGE));
      current = Math.min(Math.max(1, pageNum), total);
      var start = (current - 1) * PER_PAGE;
      var end = start + PER_PAGE;
      items.forEach(function (el, i) {
        el.style.display = i >= start && i < end ? '' : 'none';
      });
      renderPager(total);
      if (scroll) wall.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderPager(total) {
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
      show(parseInt(btn.dataset.page, 10), true);
    });

    collect();
    show(1, false);

    if (!CFG.walineServer) return; // 未配置评论服务：保持纯静态展示

    /* --- 回复条目/表单模板 --- */
    function replyHtml(c) {
      var at = c.reply_user ? '<span class="reply-at">回复 @' + esc(c.reply_user.nick) + '</span> ' : '';
      return '<div class="reply-item">' +
        '<img class="reply-avatar" src="' + esc(c.avatar) + '" alt="" loading="lazy">' +
        '<div class="reply-body">' +
          '<div class="reply-meta"><span class="reply-nick">' + esc(c.nick) + '</span>' +
            (c.type === 'administrator' ? '<span class="thought-badge is-admin">博主</span>' : '') +
            '<time>' + fmt(c.time) + '</time></div>' +
          '<div class="reply-text">' + at + c.comment + '</div>' +
        '</div></div>';
    }
    function renderThread(roots) {
      return roots.map(function (c) {
        var kids = (c.children || []).map(replyHtml).join('');
        return replyHtml(c) + (kids ? '<div class="reply-children">' + kids + '</div>' : '');
      }).join('');
    }
    /* --- 回复表单：需登录后才能回复，未登录展示登录入口 --- */
    function replyFormHtml() {
      var user = getAuthUser();
      if (user) {
        return '<form class="reply-form">' +
          '<textarea name="comment" placeholder="友善回复～" maxlength="500" rows="2"></textarea>' +
          '<div class="compose-foot"><span class="compose-hint">以 <b>' + esc(user.display_name || '') + '</b> 回复</span>' +
          '<button type="submit" class="pager-btn compose-submit">回复</button></div>' +
        '</form>';
      }
      return '<div class="reply-login"><span class="compose-hint">登录后即可回复～</span>' +
        '<button type="button" class="pager-btn reply-login-btn">登录 / 注册</button></div>';
    }
    // 挂载回复表单：按登录态渲染表单/登录入口；订阅认证广播，登录或退出后自动重渲染
    function mountReply(box, buildPayload, onApproved) {
      var holder = document.createElement('div');
      holder.className = 'reply-compose';
      box.appendChild(holder);
      var render = function () {
        holder.innerHTML = replyFormHtml();
        if (getAuthUser()) {
          bindForm(holder.querySelector('.reply-form'), buildPayload, onApproved);
        } else {
          holder.querySelector('.reply-login-btn').addEventListener('click', function () {
            walineLogin().catch(function () {});
          });
        }
      };
      onAuthChange(render);
      render();
    }

    /* --- 表情 + 图片工具条（发随想/回复共用） ---
       表情：与文章评论区 Waline 同一套预设（微博表情，CDN 图片）。面板按 info.json
       渲染图片按钮，点击插入 :weibo_xxx: 短码，提交前替换为 <img class="wl-emoji">
       ——与官方客户端提交逻辑一致（服务端 markdown-it 不认识图片表情短码，只透传 HTML）；
       图片：沿用 Waline 官方默认策略——转 base64 内联（单张上限 128KB），
       提交时以 markdown ![](dataURL) 拼进正文，服务端渲染为 <img>。 */
    var EMOJI_PRESET = 'https://unpkg.com/@waline/emojis@1.1.0/weibo'; // Waline 默认表情包，与评论区一致
    var emojiData = null;
    var emojiPromise = null;
    function loadEmoji() {
      if (!emojiPromise) {
        emojiPromise = fetch(EMOJI_PRESET + '/info.json').then(function (r) { return r.json(); }).then(function (info) {
          var map = {};
          var items = (info.items || []).map(function (it) {
            var name = (info.prefix || '') + it;
            map[name] = EMOJI_PRESET + '/' + name + (info.type ? '.' + info.type : '');
            return name;
          });
          emojiData = { map: map, items: items };
          return emojiData;
        });
      }
      return emojiPromise;
    }
    function renderEmojiShortcodes(text) {
      if (!emojiData) return text;
      return text.replace(/:(.+?):/g, function (m, name) {
        return emojiData.map[name] ? '<img class="wl-emoji" src="' + emojiData.map[name] + '" alt="' + name + '">' : m;
      });
    }
    function insertAtCursor(ta, str) {
      var s = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
      var e = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
      ta.value = ta.value.slice(0, s) + str + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + str.length;
      ta.focus();
    }
    function buildContent(text, imgs) {
      var md = imgs.map(function (u) { return '![](' + u + ')'; }).join('\n');
      var body = renderEmojiShortcodes(text); // 提交前把表情短码转 <img>，与官方客户端一致
      if (body && md) return body + '\n\n' + md;
      return body || md;
    }
    // 注入工具条（表情按钮 + 图片按钮 + 表情面板 + 缩略图预览），并把图片列表挂到 form._images
    function mountToolbar(form) {
      var ta = form.querySelector('textarea');
      if (!ta || form._toolsMounted) return;
      form._toolsMounted = true;
      form._images = [];
      var tools = document.createElement('div');
      tools.className = 'compose-tools';
      tools.innerHTML =
        '<button type="button" class="compose-tool js-emoji" title="表情">😀</button>' +
        '<button type="button" class="compose-tool js-image" title="图片">🖼️</button>' +
        '<div class="emoji-panel" hidden></div>';
      var file = document.createElement('input');
      file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
      var strip = document.createElement('div');
      strip.className = 'compose-images';
      ta.insertAdjacentElement('afterend', strip);
      ta.insertAdjacentElement('afterend', tools);
      tools.appendChild(file);
      var panel = tools.querySelector('.emoji-panel');
      var renderStrip = function () {
        strip.innerHTML = form._images.map(function (u, i) {
          return '<span class="compose-image"><img src="' + u + '" alt="">' +
            '<button type="button" class="compose-image-del" data-i="' + i + '">×</button></span>';
        }).join('');
      };
      form._resetTools = function () { form._images = []; renderStrip(); panel.hidden = true; };
      // 表情面板首开时才拉取表情包清单（与评论区共用同一 CDN 预设）
      var fillPanel = function (data) {
        if (panel.dataset.ready) return;
        panel.dataset.ready = '1';
        panel.innerHTML = data.items.map(function (name) {
          return '<button type="button" class="emoji-item" data-name="' + name + '" title="' + name + '">' +
            '<img src="' + data.map[name] + '" alt="' + name + '" loading="lazy"></button>';
        }).join('');
      };
      tools.querySelector('.js-emoji').addEventListener('click', function () {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          loadEmoji().then(fillPanel).catch(function () {
            panel.hidden = true;
            showToast('表情加载失败，请稍后再试');
          });
        }
      });
      panel.addEventListener('click', function (e) {
        var b = e.target.closest('.emoji-item');
        if (!b) return;
        insertAtCursor(ta, ':' + b.dataset.name + ':');
        // 不收起面板，支持连续选择多个表情；再点表情按钮或点发布才关闭
      });
      form.addEventListener('submit', function () { panel.hidden = true; });
      tools.querySelector('.js-image').addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        Array.prototype.forEach.call(file.files, function (f) {
          if (!/^image\//.test(f.type)) return;
          if (f.size > 128 * 1024) { showToast('图片过大，单张上限 128KB'); return; }
          var reader = new FileReader();
          reader.onload = function () { form._images.push(reader.result); renderStrip(); };
          reader.onerror = function () { showToast('图片读取失败'); };
          reader.readAsDataURL(f);
        });
        file.value = '';
      });
      strip.addEventListener('click', function (e) {
        var del = e.target.closest('.compose-image-del');
        if (!del) return;
        form._images.splice(+del.dataset.i, 1);
        renderStrip();
      });
    }

    /* --- 提交（发随想/回复共用）：一律以登录账号身份提交（Bearer token）；
       提交前显式校验 token 有效性，失效则清登录态并广播（各入口回退到登录） --- */
    function bindForm(form, buildPayload, onApproved) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = form.comment.value.trim();
        var imgs = form._images || [];
        if (!text && !imgs.length) return;
        var btn = form.querySelector('.compose-submit');
        var label = btn.textContent;
        btn.disabled = true;
        btn.textContent = '提交中…';
        var fail = function (msg) {
          btn.disabled = false;
          btn.textContent = label;
          if (msg) showToast(msg);
        };
        var doPost = function (token) {
          fetch(API + '?lang=zh-CN', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(buildPayload(buildContent(text, imgs)))
          }).then(function (r) { return r.json(); }).then(function (res) {
            if (res.errno !== 0 || !res.data) {
              fail(res.errmsg === 'Comment too fast!' ? '发得太快了，歇一会儿再试～' : (res.errmsg || '提交失败，请稍后再试'));
              return;
            }
            btn.disabled = false;
            btn.textContent = label;
            form.comment.value = '';
            if (form._resetTools) form._resetTools();
            if (res.data.status === 'approved') {
              onApproved(res.data);
              showToast('发布成功！');
            } else {
              showToast('已提交，审核通过后展示～');
            }
          }).catch(function () { fail('网络异常，提交失败'); });
        };
        var user = getAuthUser();
        if (!user) { fail('请先登录'); fireAuthChange(); return; }
        verifyToken(user.token).then(function (ok) {
          if (!ok) {
            clearAuthUser();
            fireAuthChange();
            fail('登录已过期，请重新登录');
            return;
          }
          doPost(user.token);
        }).catch(function () { fail('网络异常，提交失败'); });
      });
      mountToolbar(form);
    }

    /* --- 回复数徽标 --- */
    function setCount(item, n) {
      var el = item.querySelector('.thought-count');
      if (el) el.textContent = n > 0 ? n : '';
      item.dataset.count = n;
    }
    function bumpCount(item) {
      setCount(item, (+item.dataset.count || 0) + 1);
    }

    /* --- 访客随想卡片（结构对齐静态卡片，initReveal/分页/五色轮换均复用） --- */
    function createVisitorItem(c) {
      var item = document.createElement('article');
      item.className = 'thought-item is-visitor';
      item.dataset.time = c.time;
      item.dataset.oid = c.objectId;
      item.dataset.nick = c.nick || '';
      item._children = c.children || [];
      item.innerHTML =
        '<time class="thought-time">🕐 ' + fmt(c.time) + '</time>' +
        '<div class="thought-card">' +
          '<div class="thought-author"><img class="reply-avatar" src="' + esc(c.avatar) + '" alt="" loading="lazy">' +
            '<span class="reply-nick">' + esc(c.nick) + '</span>' +
            (c.type === 'administrator' ? '<span class="thought-badge is-admin">博主</span>' : '<span class="thought-badge">访客</span>') + '</div>' +
          '<div class="thought-content">' + c.comment + '</div>' +
          '<div class="thought-foot"><button class="thought-reply-btn" type="button">💬 回复 <span class="thought-count"></span></button></div>' +
          '<div class="thought-replies" hidden></div>' +
        '</div>';
      setCount(item, (c.children || []).length);
      return item;
    }

    /* --- 回复区：点击展开，同时只开一条；内容首开时构建 --- */
    var openBox = null;
    wall.addEventListener('click', function (e) {
      var btn = e.target.closest('.thought-reply-btn');
      if (!btn) return;
      var item = btn.closest('.thought-item');
      var box = item.querySelector('.thought-replies');
      if (!box.hidden) { box.hidden = true; openBox = null; return; }
      if (openBox) openBox.hidden = true;
      openBox = box;
      box.hidden = false;
      if (box.dataset.ready) return;
      box.dataset.ready = '1';

      var listEl = document.createElement('div');
      listEl.className = 'reply-list';
      box.appendChild(listEl);

      if (item.classList.contains('is-visitor')) {
        // 访客随想：回复是其根评论的子评论，children 已随列表返回
        listEl.innerHTML = (item._children || []).map(replyHtml).join('');
        var rootId = +item.dataset.oid;
        var rootNick = item.dataset.nick;
        mountReply(box, function (text) {
          return { comment: text, url: '/thoughts/', pid: rootId, rid: rootId, at: rootNick, ua: navigator.userAgent };
        }, function (data) {
          // POST 返回不含 reply_user，本地补上（刷新后由 GET 返回）
          if (!data.reply_user) data.reply_user = { nick: rootNick };
          listEl.insertAdjacentHTML('beforeend', replyHtml(data));
          bumpCount(item);
        });
      } else {
        // 博主随想：独立 path 懒加载回复线程（根评论 + 一层楼中楼）
        var path = '/thoughts/' + item.dataset.id + '/';
        listEl.innerHTML = '<div class="reply-loading">回复加载中…</div>';
        fetch(API + '?path=' + encodeURIComponent(path) + '&page=1&pageSize=50&sortBy=insertedAt_asc&lang=zh-CN')
          .then(function (r) { return r.json(); })
          .then(function (res) {
            listEl.innerHTML = renderThread((res.data && res.data.data) || []);
          })
          .catch(function () { listEl.innerHTML = ''; });
        mountReply(box, function (text) {
          return { comment: text, url: path, ua: navigator.userAgent };
        }, function (data) {
          listEl.insertAdjacentHTML('beforeend', replyHtml(data));
          bumpCount(item);
        });
      }
    });

    /* --- 拉取访客随想混入时间流 + 批量回填博主随想回复数 --- */
    var staticItems = items.slice();
    fetch(API + '?path=' + encodeURIComponent('/thoughts/') + '&page=1&pageSize=50&sortBy=insertedAt_desc&lang=zh-CN')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        var roots = (res.data && res.data.data) || [];
        if (!roots.length) return;
        roots.forEach(function (c) { wall.appendChild(createVisitorItem(c)); });
        collect();
        show(current, false);
        initReveal();
      })
      .catch(function () { /* 网络失败：保持纯静态展示 */ });
    if (staticItems.length) {
      var urls = staticItems.map(function (el) { return '/thoughts/' + el.dataset.id + '/'; });
      fetch(API + '?type=count&url=' + encodeURIComponent(urls.join(',')) + '&lang=zh-CN')
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var counts = res.data || [];
          staticItems.forEach(function (el, i) { setCount(el, +counts[i] || 0); });
        })
        .catch(function () {});
    }

    /* --- 页首「发随想」面板：需登录 Waline 账号后才能发布 --- */
    var composeToggle = document.getElementById('compose-toggle');
    var composeLogin = document.getElementById('compose-login');
    var composePanel = document.getElementById('compose-panel');
    var composeUser = document.getElementById('compose-user');
    if (composeToggle && composeLogin && composePanel && composeUser) {
      var setUserChip = function () {
        var user = getAuthUser();
        if (user) {
          composeUser.innerHTML = '以 <b>' + esc(user.display_name || '') + '</b> 的身份发布　' +
            '<button type="button" class="compose-logout">退出登录</button>';
        }
        return user;
      };
      var openPanel = function () {
        composeLogin.hidden = true;
        setUserChip();
        composePanel.hidden = false;
        composePanel.comment.focus();
      };
      // 认证广播回调：登录时若登录入口正展示则进入面板/否则仅刷新身份条；退出时面板回退到登录入口
      var syncCompose = function () {
        if (getAuthUser()) {
          if (!composeLogin.hidden) openPanel();
          else if (!composePanel.hidden) setUserChip();
        } else if (!composePanel.hidden) {
          composePanel.hidden = true;
          composeLogin.hidden = false;
        }
      };
      onAuthChange(syncCompose);
      composeToggle.addEventListener('click', function () {
        if (getAuthUser()) {
          composeLogin.hidden = true;
          if (composePanel.hidden) openPanel();
          else composePanel.hidden = true;
        } else {
          composePanel.hidden = true;
          composeLogin.hidden = !composeLogin.hidden;
        }
      });
      document.getElementById('compose-login-btn').addEventListener('click', function () {
        walineLogin().catch(function () {});
      });
      composeUser.addEventListener('click', function (e) {
        if (!e.target.closest('.compose-logout')) return;
        clearAuthUser();
        fireAuthChange();
      });
      bindForm(composePanel, function (text) {
        return { comment: text, url: '/thoughts/', ua: navigator.userAgent };
      }, function (data) {
        wall.appendChild(createVisitorItem(data));
        collect();
        show(1, false);
        composePanel.hidden = true;
      });
    }
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
  // 后退恢复滚动位置由 pjax 自行接管，关掉浏览器原生恢复避免两套机制打架
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // 换页后同步顶栏导航的当前项高亮（直接取服务端渲染好的 active 类）
  function syncNav(doc) {
    var cur = document.querySelectorAll('.site-nav .nav-link');
    var next = doc.querySelectorAll('.site-nav .nav-link');
    cur.forEach(function (a, i) { if (next[i]) a.className = next[i].className; });
  }

  // 恢复历史滚动位置：图片等异步资源撑开页面前 scrollTo 会被钳制截短，
  // 短暂重试直至到位；用户主动滚动则立即放弃接管
  function restoreScroll(top) {
    window.scrollTo({ top: top, behavior: 'instant' });
    var tries = 0, userScrolled = false;
    var mark = function () { userScrolled = true; };
    window.addEventListener('wheel', mark, { once: true, passive: true });
    window.addEventListener('touchstart', mark, { once: true, passive: true });
    var retry = setInterval(function () {
      if (userScrolled || ++tries > 10 || Math.abs(window.scrollY - top) < 4) { clearInterval(retry); return; }
      window.scrollTo({ top: top, behavior: 'instant' });
    }, 120);
  }

  function swapTo(doc, url, restoreY) {
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
    // 后退/前进恢复当时滚动位置 > 锚点 > 回顶；新页定位必须瞬时到位：
    // 全局 CSS smooth 会把回顶变成动画，被用户残余滚轮输入中途取消后停在半路
    var anchor = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (typeof restoreY === 'number') restoreScroll(restoreY);
    else if (anchor) anchor.scrollIntoView({ behavior: 'instant' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    initPage();
  }

  function pjaxTo(href, push, restoreY) {
    if (navigating) return;
    navigating = true;
    var url = new URL(href, location.href);
    // 请求期间顶部亮起进度条：慢网络下点击立刻有反馈，不再被感知为"没反应"
    document.documentElement.classList.add('pjax-loading');
    // 移动网络下 fetch 可能长时间挂起（不成功也不失败），此时 navigating 会一直为
    // true，后续所有点击都被静默吞掉——超时中止请求并走 catch 退回整页跳转
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    var done = function () {
      if (timer) clearTimeout(timer);
      document.documentElement.classList.remove('pjax-loading');
      navigating = false;
    };
    fetch(url.href, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var type = res.headers.get('content-type') || '';
      if (type.indexOf('text/html') < 0) throw new Error('non-html');
      return res.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc.querySelector('.site-main')) throw new Error('layout mismatch');
      if (push) {
        // 把当前滚动位置存进即将离开的历史条目，供后退时恢复
        history.replaceState({ pjax: true, scrollY: window.scrollY }, '', location.href);
        history.pushState({ pjax: true }, '', url.href);
      }
      lastPath = url.pathname + url.search;
      done();
      var swap = function () { swapTo(doc, url, restoreY); };
      if (document.startViewTransition && !REDUCED) {
        document.startViewTransition(swap);
      } else {
        swap();
      }
    }).catch(function () {
      // 任何异常（网络失败 / 超时中止 / 非站内布局页面）退回整页跳转
      done();
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
      e.preventDefault(); // 点击当前页链接：收起移动端菜单并平滑回顶
      var toggle = document.getElementById('nav-toggle');
      if (toggle) toggle.checked = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    e.preventDefault();
    pjaxTo(a.href, true);
  });

  // 浏览器前进 / 后退同样走无刷新渲染，并恢复该历史条目记录的滚动位置
  window.addEventListener('popstate', function (e) {
    var p = location.pathname + location.search;
    if (p === lastPath) return; // 纯 hash 变化不处理
    pjaxTo(location.href, false, e.state && typeof e.state.scrollY === 'number' ? e.state.scrollY : undefined);
  });

  /* ---------- 文章页回退按钮：回到点进文章时的列表位置 ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#post-back');
    if (!btn) return;
    // 站内路径进来的走历史后退（pjax 会恢复来源页滚动位置），直达/外链进来的退回首页
    var fromSite = (history.state && history.state.pjax) ||
      (document.referrer && document.referrer.indexOf(location.origin) === 0);
    if (fromSite && history.length > 1) history.back();
    else pjaxTo(CFG.root || '/', true);
  });

  /* ---------- 文章页右下角快捷滚动：回顶 / 到底 ---------- */
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('#scroll-top-btn')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.target.closest('#scroll-bottom-btn')) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
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
