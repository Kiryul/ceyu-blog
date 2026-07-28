/* 前端本地搜索：fetch /search.json，匹配标题/分类/标签（不含正文） */
(function () {
  'use strict';

  var CFG = window.ANIME_THEME || {};
  var modal = document.getElementById('search-modal');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var openBtn = document.getElementById('search-btn');
  if (!modal || !input || !results || !openBtn) return;

  var index = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    var root = (CFG.root || '/').replace(/\/$/, '');
    return fetch(root + '/search.json')
      .then(function (res) { return res.json(); })
      .then(function (data) { index = data; return index; })
      .catch(function () { index = []; return index; });
  }

  function open() {
    modal.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(function () { input.focus(); }, 50);
    loadIndex();
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    input.value = '';
    results.innerHTML = '<li class="search-hint">输入关键词开始搜索（本地索引，无需联网服务）</li>';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render(list, keyword) {
    if (!keyword) {
      results.innerHTML = '<li class="search-hint">输入关键词开始搜索（本地索引，无需联网服务）</li>';
      return;
    }
    if (!list.length) {
      results.innerHTML = '<li class="search-hint">没有找到与「' + escapeHtml(keyword) + '」相关的文章</li>';
      return;
    }
    results.innerHTML = list.map(function (item) {
      return '<li class="search-item"><a href="' + item.url + '">' +
        '<span class="search-item-title">' + escapeHtml(item.title) + '</span>' +
        '<span class="search-item-meta">' + item.date +
        (item.categories.length ? ' · 🗂 ' + escapeHtml(item.categories.join('/')) : '') +
        (item.tags.length ? ' · ' + item.tags.map(function (t) { return '#' + escapeHtml(t); }).join(' ') : '') +
        '</span></a></li>';
    }).join('');
  }

  function doSearch() {
    var kw = input.value.trim().toLowerCase();
    loadIndex().then(function (data) {
      if (!kw) { render([], ''); return; }
      var matched = data.filter(function (item) {
        // 仅匹配标题 / 分类 / 标签
        if (item.title.toLowerCase().indexOf(kw) > -1) return true;
        if (item.categories.some(function (c) { return c.toLowerCase().indexOf(kw) > -1; })) return true;
        if (item.tags.some(function (t) { return t.toLowerCase().indexOf(kw) > -1; })) return true;
        return false;
      });
      render(matched, kw);
    });
  }

  openBtn.addEventListener('click', open);
  input.addEventListener('input', doSearch);
  modal.querySelectorAll('[data-search-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) close();
    // Ctrl/Cmd + K 快捷唤起
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      modal.hidden ? open() : close();
    }
  });
})();
