/* anime 主题挂件：Live2D 看板娘 + 音乐播放器
   挂载点在 pjax 替换区（.site-main）之外，只初始化一次、全站换页存活；
   均 CDN 懒加载（等首屏空闲后再加载），失败静默降级，不影响站点主功能 */
(function () {
  'use strict';

  var CFG = window.ANIME_THEME || {};
  var IS_MOBILE = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadCss(href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  /* ---------- Live2D 看板娘（oh-my-live2d，停靠右下角） ---------- */
  function initLive2d() {
    var opt = CFG.live2d || {};
    if (!opt.enable || !opt.model) return;
    if (IS_MOBILE && !opt.mobile) return; // 小屏默认不展示，避免遮挡内容
    loadScript('https://unpkg.com/oh-my-live2d@latest/dist/index.min.js').then(function () {
      if (!window.OML2D) return;
      window.OML2D.loadOml2d({
        dockedPosition: 'right',
        sayHello: false,
        transitionTime: 800,
        primaryColor: '#ff8fb3',
        // oml2d 自带窄视口检测（默认直接休眠不加载模型），由主题配置统一控制
        mobileDisplay: !!opt.mobile,
        // 展示区域尺寸：必须用带单位的字符串（传纯数字无效）；canvas 缓冲自动 2x DPR，等比放大不变形
        stageStyle: { width: opt.stageWidth || '210px', height: opt.stageHeight || '220px' },
        // 移除「切换模型」菜单项（保留 休息/切换衣服/关于）
        menus: { items: function (items) { return items.filter(function (i) { return i.id !== 'SwitchModel'; }); } },
        models: [{
          path: opt.model,
          scale: opt.scale || 0.115,
          // position [x, y]：y 为正向下偏移，模型顶部（如双马尾）被画布上沿裁切时调大
          position: opt.position || [0, 45]
        }],
        statusBar: {
          disable: false,
          loadSuccessMessage: '嗨~',
          restMessage: '休息中'
        },
        tips: {
          idleTips: {
            interval: 20000,
            message: [
              '欢迎来到策屿~',
              '要不要看看最新的文章？',
              '点击右上角 🌙 可以切换夜间模式哦',
              '喝口水，休息一下吧'
            ]
          }
        }
      });
    }).catch(function () { /* CDN 加载失败静默降级 */ });
  }

  /* ---------- 音乐播放器（APlayer 悬浮吸底模式，左下角） ---------- */
  function initPlayer() {
    var opt = CFG.music || {};
    if (!opt.enable) return;
    var mount = document.getElementById('player-mount');
    if (!mount) return;
    loadCss('https://unpkg.com/aplayer/dist/APlayer.min.css');
    loadScript('https://unpkg.com/aplayer/dist/APlayer.min.js').then(function () {
      if (!window.APlayer) return;
      if (opt.songs && opt.songs.length) {
        // 自维护歌曲列表：直接实例化 APlayer
        new window.APlayer({
          container: mount,
          fixed: true,
          mini: true,
          audio: opt.songs,
          theme: '#ff8fb3',
          preload: 'none',
          volume: 0.6,
          order: 'list',
          listMaxHeight: '240px'
        });
      } else if (opt.meting && opt.meting.id) {
        // Meting 在线歌单：由 <meting-js> 组件拉取歌单并驱动 APlayer
        return loadScript('https://unpkg.com/meting@2/dist/Meting.min.js').then(function () {
          var el = document.createElement('meting-js');
          el.setAttribute('server', opt.meting.server || 'netease');
          el.setAttribute('type', opt.meting.type || 'playlist');
          el.setAttribute('id', opt.meting.id);
          el.setAttribute('fixed', 'true');
          el.setAttribute('mini', 'true');
          el.setAttribute('theme', '#ff8fb3');
          el.setAttribute('preload', 'none');
          el.setAttribute('volume', '0.6');
          el.setAttribute('lrc-type', '0'); // 关闭歌词：fixed 模式歌词悬浮在页面底部中央，会与正文重叠
          el.setAttribute('list-max-height', '240px');
          mount.appendChild(el);
        });
      }
    }).catch(function () { /* CDN 加载失败静默降级 */ });
  }

  /* ---------- 启动：等整页加载完成 + 浏览器空闲，不与首屏渲染抢资源 ---------- */
  function boot() {
    var run = function () {
      initLive2d();
      initPlayer();
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 3000 });
    } else {
      setTimeout(run, 1200);
    }
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
