(function attachBlog(globalScope, factory) {
  const api = factory();

  if (globalScope) {
    globalScope.WandererBlog = api;
    if (globalScope.document) {
      const start = () => api.initBlogPreview(globalScope.document, globalScope);
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
    const card = doc.createElement('article');
    card.className = `${featured ? 'project-card project-card--wide' : 'note-card'} blog-card blog-card--${featured ? 'featured' : 'compact'} liquid-glass reveal delay-${index + 1}`;
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

    const link = createTextElement(doc, 'a', 'card-arrow', '↗');
    link.href = `post.html?slug=${encodeURIComponent(post.slug)}`;
    link.setAttribute('aria-label', `阅读${post.title}`);
    bottom.append(tags, link);
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
    getBlogPreviewElements,
    createBlogCard,
    renderBlogPreview,
    createBlogPreviewController,
    initBlogPreview,
    renderMarkdown,
    safeContentUrl,
  };
}));
