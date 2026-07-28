/**
 * 构建时生成前端本地搜索索引 /search.json
 * 仅包含标题、分类、标签（不含正文），与需求 8.4 一致
 */
'use strict';

hexo.extend.generator.register('search-json', function (locals) {
  const data = locals.posts
    .sort('-date')
    .map(function (post) {
      return {
        title: post.title,
        url: hexo.config.root.replace(/\/$/, '') + '/' + post.path,
        date: post.date.format('YYYY-MM-DD'),
        categories: post.categories.map(function (c) { return c.name; }),
        tags: post.tags.map(function (t) { return t.name; })
      };
    });

  return {
    path: 'search.json',
    data: JSON.stringify(data)
  };
});
