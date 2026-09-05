(function attachBlog(globalScope, factory) {
  const api = factory();

  if (globalScope) {
    globalScope.WandererBlog = api;
    if (globalScope.document) {
      const start = () => {
        api.initBlogPreview(globalScope.document, globalScope);
        api.initBlogArchive(globalScope.document, globalScope);
        api.initBlogArticle(globalScope.document, globalScope);
      };
      if (globalScope.document.readyState === 'loading') {
        globalScope.document.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        start();
      }
    }
  }
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createBlogApi() {
  const BLOG_INDEX_PATH = 'posts/index.json';
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const contentPathPattern = /^posts\/[a-zA-Z0-9._/-]+$/;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const safeContentUrl = (value) => {
    const url = String(value ?? '').trim();
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url;
    if (/^assets\/[a-zA-Z0-9._/-]+$/.test(url) && !url.includes('..')) return url;
    return '';
  };

  const sortPosts = (posts) => [...posts].sort((left, right) => (
    right.date.localeCompare(left.date) || left.slug.localeCompare(right.slug)
  ));

  const latestPosts = (posts, limit = 3) => sortPosts(posts).slice(0, Math.max(0, limit));

  const findPost = (posts, slug) => {
    if (typeof slug !== 'string' || !slugPattern.test(slug)) return null;
    return sortPosts(posts).find((post) => post.slug === slug) ?? null;
  };

  const getAdjacentPosts = (posts, slug) => {
    const ordered = sortPosts(posts);
    const index = ordered.findIndex((post) => post.slug === slug);
    if (index < 0) return { previous: null, next: null };
    return {
      previous: ordered[index + 1]?.slug ?? null,
      next: ordered[index - 1]?.slug ?? null,
    };
  };

  const normalizePost = (record) => {
    if (!record || typeof record !== 'object') return null;

    const slug = typeof record.slug === 'string' ? record.slug.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const date = typeof record.date === 'string' ? record.date.trim() : '';
    const category = typeof record.category === 'string' ? record.category.trim() : '';
    const excerpt = typeof record.excerpt === 'string' ? record.excerpt.trim() : '';
    const readingTime = typeof record.readingTime === 'string' ? record.readingTime.trim() : '';
    const content = typeof record.content === 'string' ? record.content.trim() : '';
    const cover = typeof record.cover === 'string' ? record.cover.trim() : '';

    if (!slugPattern.test(slug) || !datePattern.test(date)) return null;
    if (!title || !content || !category || !excerpt || !readingTime) return null;
    if (!contentPathPattern.test(content) || content.includes('..')) return null;
    if (cover && !safeContentUrl(cover)) return null;
    if (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== 'string')) return null;

    return {
      slug,
      title,
      date,
      category,
      excerpt,
      cover,
      tags: record.tags.map((tag) => tag.trim()).filter(Boolean),
      readingTime,
      content,
    };
  };

  const normalizePosts = (records) => (
    Array.isArray(records) ? records.map(normalizePost).filter(Boolean) : []
  );

  const loadPosts = async (fetchImpl) => {
    try {
      const response = await fetchImpl(BLOG_INDEX_PATH);
      if (!response?.ok) throw new Error('request failed');
      const records = await response.json();
      if (!Array.isArray(records)) throw new Error('invalid index');
      return sortPosts(normalizePosts(records));
    } catch (error) {
      throw new Error('博客索引加载失败', { cause: error });
    }
  };

  const loadPostContent = async (fetchImpl, post) => {
    try {
      if (!post || typeof post.content !== 'string' || !contentPathPattern.test(post.content) || post.content.includes('..')) {
        throw new Error('invalid content path');
      }
      const response = await fetchImpl(post.content);
      if (!response?.ok) throw new Error('request failed');
      return await response.text();
    } catch (error) {
      throw new Error('文章内容加载失败', { cause: error });
    }
  };

  const formatBlogDate = (date) => String(date ?? '').replace(/-/g, '.');

  const getBlogSlug = (search) => new URLSearchParams(String(search ?? '')).get('slug');

  const getBlogListElements = (doc) => ({
    list: doc?.querySelector('[data-blog-list]') ?? null,
    empty: doc?.querySelector('[data-blog-list-empty]') ?? null,
    error: doc?.querySelector('[data-blog-list-error]') ?? null,
  });

  const getBlogArticleElements = (doc) => ({
    article: doc?.querySelector('[data-blog-article]') ?? null,
    category: doc?.querySelector('[data-blog-article-category]') ?? null,
    title: doc?.querySelector('[data-blog-article-title]') ?? null,
    excerpt: doc?.querySelector('[data-blog-article-excerpt]') ?? null,
    date: doc?.querySelector('[data-blog-article-date]') ?? null,
    readingTime: doc?.querySelector('[data-blog-article-reading-time]') ?? null,
    cover: doc?.querySelector('[data-blog-article-cover]') ?? null,
    content: doc?.querySelector('[data-blog-article-content]') ?? null,
    error: doc?.querySelector('[data-blog-article-error]') ?? null,
    previous: doc?.querySelector('[data-blog-article-previous]') ?? null,
    next: doc?.querySelector('[data-blog-article-next]') ?? null,
  });

  const createBlogImageFallback = (doc, label = 'IMAGE / SIGNAL LOST') => {
    const fallback = createTextElement(doc, 'span', 'blog-image-fallback', label);
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', '图片暂时无法读取');
    return fallback;
  };

  const createBlogCover = (doc, post, className = 'blog-row__media') => {
    const cover = doc.createElement('span');
    cover.className = className;
    cover.dataset.blogCover = '';

    const fallback = createTextElement(doc, 'span', 'blog-cover-fallback', 'COVER / SIGNAL LOST');
    fallback.setAttribute('aria-hidden', 'true');
    cover.append(fallback);

    const showFallback = () => {
      cover.classList.add('is-cover-fallback');
      fallback.hidden = false;
      cover.replaceChildren(fallback);
    };

    if (!post.cover) {
      showFallback();
      return cover;
    }

    fallback.hidden = true;
    const image = doc.createElement('img');
    image.src = post.cover;
    image.alt = `文章封面：${post.title}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', showFallback, { once: true });
    cover.append(image);
    return cover;
  };

  const createBlogArchiveRow = (doc, post, index) => {
    const row = doc.createElement('a');
    row.className = `blog-row liquid-glass reveal delay-${index + 1}`;
    row.href = `post.html?slug=${encodeURIComponent(post.slug)}`;
    row.setAttribute('aria-label', `阅读文章：${post.title}`);
    row.dataset.blogRow = '';
    row.dataset.liquidGlass = '';

    const date = createTextElement(doc, 'span', 'blog-row__date', '');
    date.dataset.blogDate = '';
    date.append(
      createTextElement(doc, 'span', 'blog-row__date-value', formatBlogDate(post.date)),
      doc.createElement('br'),
      createTextElement(doc, 'span', 'blog-row__category', post.category),
    );

    const content = doc.createElement('span');
    content.className = 'blog-row__content';
    content.append(
      createTextElement(doc, 'strong', '', post.title),
      createTextElement(doc, 'span', '', post.excerpt),
    );
    const tags = createTextElement(doc, 'span', 'tag-list', '');
    tags.dataset.blogTags = '';
    for (const tag of post.tags) tags.append(createTextElement(doc, 'span', 'tag', tag));
    tags.append(createTextElement(doc, 'span', 'tag', post.readingTime));
    content.append(tags);

    const arrow = createTextElement(doc, 'span', 'blog-row__arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    row.append(createBlogCover(doc, post), date, content, arrow);
    return row;
  };

  const renderBlogArchive = (doc, posts, liquidGlass) => {
    const { list, empty, error } = getBlogListElements(doc);
    if (!list) return [];

    list.replaceChildren();
    setVisibility(empty, false);
    setVisibility(error, false);
    const rows = sortPosts(posts).map((post, index) => createBlogArchiveRow(doc, post, index));
    if (!rows.length) {
      setVisibility(empty, true);
      return rows;
    }

    list.append(...rows);
    liquidGlass?.initLiquidGlass?.(doc, typeof globalThis !== 'undefined' ? globalThis : undefined);
    return rows;
  };

  const createBlogArchiveController = (doc, options = {}) => {
    const scope = options.scope ?? (typeof globalThis !== 'undefined' ? globalThis : {});
    const fetchImpl = options.fetchImpl ?? (typeof scope.fetch === 'function' ? scope.fetch.bind(scope) : null);
    const liquidGlass = options.liquidGlass ?? scope.WandererLiquidGlass;
    const { list, empty, error } = getBlogListElements(doc);

    const load = async () => {
      if (!list) return [];
      setVisibility(empty, false);
      setVisibility(error, false);
      try {
        return renderBlogArchive(doc, await loadPosts(fetchImpl), liquidGlass);
      } catch (loadError) {
        list.replaceChildren();
        setVisibility(empty, false);
        setVisibility(error, true);
        return [];
      }
    };

    return { load };
  };

  const initBlogArchive = (doc, scope = typeof globalThis !== 'undefined' ? globalThis : {}) => {
    if (!doc?.querySelector('[data-blog-list]')) return null;
    const controller = createBlogArchiveController(doc, { scope });
    controller.load();
    return controller;
  };

  const renderBlogCover = (doc, cover, post) => {
    if (!cover) return;
    cover.replaceChildren();
    cover.classList.remove('is-cover-fallback');
    const fallback = createTextElement(doc, 'span', 'blog-cover-fallback', 'COVER / SIGNAL LOST');
    fallback.setAttribute('aria-hidden', 'true');

    const showFallback = () => {
      cover.classList.add('is-cover-fallback');
      cover.replaceChildren(fallback);
    };

    if (!post.cover) {
      showFallback();
      return;
    }

    const image = doc.createElement('img');
    image.src = post.cover;
    image.alt = `文章封面：${post.title}`;
    image.loading = 'eager';
    image.decoding = 'async';
    image.addEventListener('error', showFallback, { once: true });
    cover.append(image);
  };

  const bindBlogContentImages = (doc, content) => {
    content?.querySelectorAll?.('[data-blog-content-image]').forEach((image) => {
      if (image.dataset.blogImageReady === 'true') return;
      image.dataset.blogImageReady = 'true';
      image.addEventListener('error', () => {
        image.replaceWith(createBlogImageFallback(doc));
      }, { once: true });
    });
  };

  const setArticleNavigation = (elements, posts, slug) => {
    const adjacent = getAdjacentPosts(posts, slug);
    for (const [key, element] of [['previous', elements.previous], ['next', elements.next]]) {
      const adjacentPost = adjacent[key] ? findPost(posts, adjacent[key]) : null;
      if (!element || !adjacentPost) {
        setVisibility(element, false);
        continue;
      }
      element.href = `post.html?slug=${encodeURIComponent(adjacentPost.slug)}`;
      element.textContent = key === 'previous'
        ? `← ${adjacentPost.title}`
        : `${adjacentPost.title} →`;
      setVisibility(element, true);
    }
  };

  const createBlogArticleController = (doc, options = {}) => {
    const scope = options.scope ?? (typeof globalThis !== 'undefined' ? globalThis : {});
    const fetchImpl = options.fetchImpl ?? (typeof scope.fetch === 'function' ? scope.fetch.bind(scope) : null);
    const liquidGlass = options.liquidGlass ?? scope.WandererLiquidGlass;
    const elements = getBlogArticleElements(doc);

    const load = async () => {
      if (!elements.article) return null;
      const slug = getBlogSlug(scope.location?.search ?? '');
      setVisibility(elements.error, false);
      setVisibility(elements.content, false);
      elements.content?.replaceChildren();
      setVisibility(elements.previous, false);
      setVisibility(elements.next, false);

      try {
        const posts = await loadPosts(fetchImpl);
        const post = findPost(posts, slug);
        if (!post) throw new Error('文章不存在');

        if (doc) doc.title = `${post.title} · Blog · Wanderer.OS`;
        if (elements.category) elements.category.textContent = post.category;
        if (elements.title) elements.title.textContent = post.title;
        if (elements.excerpt) elements.excerpt.textContent = post.excerpt;
        if (elements.date) {
          elements.date.textContent = formatBlogDate(post.date);
          elements.date.dateTime = post.date;
        }
        if (elements.readingTime) elements.readingTime.textContent = post.readingTime;
        renderBlogCover(doc, elements.cover, post);

        const markdown = await loadPostContent(fetchImpl, post);
        if (elements.content) {
          elements.content.innerHTML = renderMarkdown(markdown);
          bindBlogContentImages(doc, elements.content);
          setVisibility(elements.content, true);
        }
        setArticleNavigation(elements, posts, post.slug);
        liquidGlass?.initLiquidGlass?.(doc, scope);
        return post;
      } catch (loadError) {
        if (elements.content) {
          elements.content.replaceChildren();
          setVisibility(elements.content, false);
        }
        if (elements.error) {
          elements.error.textContent = loadError?.message === '文章不存在'
            ? '找不到这篇博客，请返回博客列表继续浏览。'
            : '文章暂时无法读取，请稍后再试。';
          setVisibility(elements.error, true);
        }
        return null;
      }
    };

    return { load };
  };

  const initBlogArticle = (doc, scope = typeof globalThis !== 'undefined' ? globalThis : {}) => {
    if (!doc?.querySelector('[data-blog-article]')) return null;
    const controller = createBlogArticleController(doc, { scope });
    controller.load();
    return controller;
  };

  const getBlogPreviewElements = (doc) => ({
    preview: doc?.querySelector('[data-blog-preview]') ?? null,
    empty: doc?.querySelector('[data-blog-preview-empty]') ?? null,
    error: doc?.querySelector('[data-blog-preview-error]') ?? null,
  });

  const setVisibility = (element, visible) => {
    if (element) element.hidden = !visible;
  };

  const createTextElement = (doc, tagName, className, text) => {
    const element = doc.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  };

  const createBlogCard = (doc, post, index) => {
    const featured = index === 0;
    const card = doc.createElement('a');
    card.className = `${featured ? 'project-card project-card--wide' : 'note-card'} blog-card blog-card--${featured ? 'featured' : 'compact'} liquid-glass reveal delay-${index + 1}`;
    card.href = `post.html?slug=${encodeURIComponent(post.slug)}`;
    card.setAttribute('aria-label', `阅读文章：${post.title}`);
    card.dataset.liquidGlass = '';
    card.dataset.blogSlug = post.slug;

    const topLine = doc.createElement('div');
    topLine.className = 'card-topline';
    topLine.append(
      createTextElement(doc, 'span', 'card-index', `BLOG / ${String(index + 1).padStart(2, '0')}`),
      createTextElement(doc, 'span', 'status', post.category),
    );
    card.append(topLine);

    const cover = doc.createElement('div');
    cover.className = 'blog-card__cover';
    cover.setAttribute('aria-hidden', 'true');
    cover.style.cssText = 'position:absolute;inset:0 0 auto;height:132px;overflow:hidden;opacity:.42;pointer-events:none;';

    const fallback = createTextElement(doc, 'span', 'blog-card__cover-fallback', 'COVER / SIGNAL LOST');
    fallback.style.cssText = 'display:grid;height:100%;place-items:center;color:rgba(183,244,255,.72);font:10px/1 var(--mono);letter-spacing:.16em;';
    fallback.hidden = Boolean(post.cover);
    cover.append(fallback);

    if (post.cover) {
      const image = doc.createElement('img');
      image.className = 'blog-card__cover-image';
      image.src = post.cover;
      image.alt = `文章封面：${post.title}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;';
      image.addEventListener('error', () => {
        card.classList.add('is-cover-fallback');
        image.hidden = true;
        fallback.hidden = false;
      });
      cover.append(image);
    } else {
      card.classList.add('is-cover-fallback');
    }
    card.append(cover);

    card.append(
      createTextElement(doc, 'h3', '', post.title),
      createTextElement(doc, 'p', '', post.excerpt),
    );

    const bottom = doc.createElement('div');
    bottom.className = 'card-bottom';
    const tags = doc.createElement('div');
    tags.className = 'tag-list';
    for (const tag of post.tags) tags.append(createTextElement(doc, 'span', 'tag', tag));
    tags.append(createTextElement(doc, 'span', 'tag', post.readingTime));

    const arrow = createTextElement(doc, 'span', 'card-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    bottom.append(tags, arrow);
    card.append(bottom);

    return card;
  };

  const renderBlogPreview = (doc, posts, liquidGlass) => {
    const { preview, empty, error } = getBlogPreviewElements(doc);
    if (!preview) return [];

    preview.replaceChildren();
    setVisibility(empty, false);
    setVisibility(error, false);

    const cards = latestPosts(posts, 3).map((post, index) => createBlogCard(doc, post, index));
    if (!cards.length) {
      setVisibility(empty, true);
      return cards;
    }

    preview.append(...cards);
    liquidGlass?.initLiquidGlass?.(doc, typeof globalThis !== 'undefined' ? globalThis : undefined);
    return cards;
  };

  const createBlogPreviewController = (doc, options = {}) => {
    const scope = options.scope ?? (typeof globalThis !== 'undefined' ? globalThis : {});
    const fetchImpl = options.fetchImpl ?? (typeof scope.fetch === 'function' ? scope.fetch.bind(scope) : null);
    const liquidGlass = options.liquidGlass ?? scope.WandererLiquidGlass;
    const { preview, empty, error } = getBlogPreviewElements(doc);

    const load = async () => {
      if (!preview) return [];

      setVisibility(empty, false);
      setVisibility(error, false);
      try {
        return renderBlogPreview(doc, await loadPosts(fetchImpl), liquidGlass);
      } catch (loadError) {
        preview.replaceChildren();
        setVisibility(empty, false);
        setVisibility(error, true);
        return [];
      }
    };

    return { load };
  };

  const initBlogPreview = (doc, scope = typeof globalThis !== 'undefined' ? globalThis : {}) => {
    if (!doc?.querySelector('[data-blog-preview]')) return null;
    const controller = createBlogPreviewController(doc, { scope });
    controller.load();
    return controller;
  };

  const renderInline = (text) => {
    const tokenPattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let html = '';
    let cursor = 0;
    let match;

    while ((match = tokenPattern.exec(text))) {
      html += escapeHtml(text.slice(cursor, match.index));
      if (match[1] !== undefined) {
        const src = safeContentUrl(match[2]);
        if (src) {
          html += `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(match[1])}" data-blog-content-image>`;
          if (match[3]) html += `<figcaption>${escapeHtml(match[3])}</figcaption>`;
          html += '</figure>';
        } else {
          html += escapeHtml(match[0]);
        }
      } else {
        const href = safeContentUrl(match[5]);
        html += href
          ? `<a href="${escapeHtml(href)}">${escapeHtml(match[4])}</a>`
          : escapeHtml(match[4]);
      }
      cursor = match.index + match[0].length;
    }

    return html + escapeHtml(text.slice(cursor));
  };

  const renderMarkdown = (markdown) => {
    const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = line.match(/^```([\w-]*)\s*$/);
      if (fence) {
        const language = fence[1];
        const codeLines = [];
        index += 1;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const className = language ? ` class="language-${escapeHtml(language)}"` : '';
        blocks.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,2})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length === 1 ? 2 : 3;
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^-\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^-\s+/.test(lines[index])) {
          items.push(`<li>${renderInline(lines[index].replace(/^-\s+/, ''))}</li>`);
          index += 1;
        }
        blocks.push(`<ul>${items.join('')}</ul>`);
        continue;
      }

      const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
      if (image) {
        blocks.push(renderInline(line));
        index += 1;
        continue;
      }

      const paragraph = [line];
      index += 1;
      while (
        index < lines.length
        && lines[index].trim()
        && !/^```[\w-]*\s*$/.test(lines[index])
        && !/^(#{1,2})\s+/.test(lines[index])
        && !/^-\s+/.test(lines[index])
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    }

    return blocks.join('');
  };

  return {
    BLOG_INDEX_PATH,
    normalizePost,
    normalizePosts,
    sortPosts,
    latestPosts,
    findPost,
    getAdjacentPosts,
    loadPosts,
    loadPostContent,
    formatBlogDate,
    getBlogSlug,
    getBlogListElements,
    getBlogArticleElements,
    createBlogArchiveRow,
    renderBlogArchive,
    createBlogArchiveController,
    initBlogArchive,
    createBlogArticleController,
    initBlogArticle,
    getBlogPreviewElements,
    createBlogCard,
    renderBlogPreview,
    createBlogPreviewController,
    initBlogPreview,
    renderMarkdown,
    safeContentUrl,
  };
}));
