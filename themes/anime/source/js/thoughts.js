/* 个人随想：瀑布流前端分页（每页 N 条，由主题配置 thoughts_per_page 决定） */
(function () {
  'use strict';

  var CFG = window.ANIME_THEME || {};
  var PER_PAGE = CFG.thoughtsPerPage || 10;
  var wall = document.getElementById('thoughts-waterfall');
  var pager = document.getElementById('thoughts-pager');
  if (!wall || !pager) return;

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
})();
