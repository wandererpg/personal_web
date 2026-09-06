const express = require('express');
const multer = require('multer');
const { readFile, realpath, stat } = require('node:fs/promises');
const path = require('node:path');
const { MAX_IMAGE_BYTES } = require('./media-store.js');
const { contentError, validateDraftId, validateSlug } = require('./content-model.js');

async function readPublicIndex(repoDir) {
  try {
    const value = JSON.parse(await readFile(path.join(repoDir, 'posts', 'index.json'), 'utf8'));
    if (!Array.isArray(value)) throw new Error('not an array');
    return value;
  } catch (error) {
    throw Object.assign(contentError('PUBLIC_INDEX_INVALID'), { cause: error });
  }
}

function isWithin(baseDir, targetPath) {
  const relation = path.relative(baseDir, targetPath);
  return relation === '' || (relation !== '..'
    && !relation.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relation));
}

async function readPublishedBody(repoDir, content) {
  if (typeof content !== 'string' || !/^posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(content)) {
    throw contentError('PUBLISHED_CONTENT_INVALID');
  }
  try {
    const postsDir = await realpath(path.join(repoDir, 'posts'));
    const candidate = await realpath(path.join(repoDir, ...content.split('/')));
    if (!isWithin(postsDir, candidate) || !(await stat(candidate)).isFile()) {
      throw contentError('PUBLISHED_CONTENT_INVALID');
    }
    return await readFile(candidate, 'utf8');
  } catch (error) {
    if (error.code === 'PUBLISHED_CONTENT_INVALID') throw error;
    throw Object.assign(contentError('PUBLISHED_CONTENT_INVALID'), { cause: error });
  }
}

function cleanAlt(value) {
  const alt = String(value || '').replace(/[\r\n\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!alt || alt.length > 160) throw contentError('IMAGE_ALT_INVALID');
  return alt;
}

function statusFor(error) {
  return {
    AUTH_REQUIRED: 401,
    CSRF_TOKEN_INVALID: 403,
    DRAFT_NOT_FOUND: 404,
    IMAGE_NOT_FOUND: 404,
    PUBLISHED_POST_NOT_FOUND: 404,
    VERSION_CONFLICT: 409,
    SLUG_CONFLICT: 409,
    SLUG_CHANGE_UNSUPPORTED: 409,
    IMAGE_TYPE_INVALID: 415,
    IMAGE_SIZE_INVALID: 413,
    GIT_PUSH_PENDING: 502,
    GIT_REMOTE_DIVERGED: 409,
    SYNC_NOT_PENDING: 409,
    DRAFT_DELETE_INVALID: 409,
    MEDIA_PATH_INVALID: 409,
    PUBLIC_INDEX_INVALID: 500,
    PUBLISHED_CONTENT_INVALID: 500
  }[error.code] || (String(error.code || '').endsWith('_INVALID') ? 400 : 500);
}

function createAdminRouter({ repoDir, draftStore, mediaStore, publishService, deleteService, auth }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2, parts: 3 }
  });
  const mutate = [auth.requireCsrf];

  router.get('/posts', async (_req, res, next) => {
    try {
      const [published, drafts] = await Promise.all([readPublicIndex(repoDir), draftStore.list()]);
      const publishedDrafts = new Map(drafts
        .filter(post => post.status === 'published')
        .map(post => [post.slug, post]));
      const publicRows = published.map(post => {
        const draft = publishedDrafts.get(post.slug);
        return {
          ...post,
          id: draft?.id || null,
          status: 'published',
          syncStatus: draft?.syncStatus || 'synced',
          lastCommit: draft?.lastCommit || null
        };
      });
      const posts = [...drafts.filter(post => post.status === 'draft'), ...publicRows].sort((left, right) => (
        Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt)
      ));
      res.json({ posts });
    } catch (error) { next(error); }
  });

  router.post('/posts', ...mutate, async (req, res, next) => {
    try { res.status(201).json({ post: await draftStore.create({ module: req.body.module }) }); }
    catch (error) { next(error); }
  });

  router.post('/posts/:slug/revise', ...mutate, async (req, res, next) => {
    try {
      const slug = validateSlug(req.params.slug);
      const published = (await readPublicIndex(repoDir)).find(post => post.slug === slug);
      if (!published) throw contentError('PUBLISHED_POST_NOT_FOUND');
      const body = await readPublishedBody(repoDir, published.content);
      const post = await draftStore.create({
        title: published.title, slug, module: published.module, excerpt: published.excerpt,
        tags: published.tags, cover: published.cover, body, sourceSlug: slug,
        createdAt: published.createdAt, publishedAt: published.publishedAt
      });
      res.status(201).json({ post });
    } catch (error) { next(error); }
  });

  router.get('/posts/:id', async (req, res, next) => {
    try { res.json({ post: await draftStore.get(validateDraftId(req.params.id)) }); }
    catch (error) { next(error); }
  });

  router.put('/posts/:id', ...mutate, async (req, res, next) => {
    try { res.json({ post: await draftStore.update(validateDraftId(req.params.id), req.body) }); }
    catch (error) { next(error); }
  });

  router.get('/media/:id/:name', async (req, res, next) => {
    try {
      const image = await mediaStore.readPrivate(req.params.id, req.params.name);
      res.set('Cache-Control', 'private, no-store');
      res.type(image.mime).send(image.buffer);
    } catch (error) { next(error); }
  });

  router.post('/posts/:id/media', ...mutate, upload.single('image'), async (req, res, next) => {
    try {
      const id = validateDraftId(req.params.id);
      await draftStore.get(id);
      if (!req.file?.buffer) throw contentError('IMAGE_REQUIRED');
      const alt = cleanAlt(req.body.alt);
      const asset = await mediaStore.stage(id, req.file.buffer);
      res.status(201).json({ asset, markdown: `![${alt}](${asset.url})` });
    } catch (error) { next(error); }
  });

  router.post('/posts/:id/publish', ...mutate, async (req, res, next) => {
    try { res.json(await publishService.publish(validateDraftId(req.params.id))); }
    catch (error) { next(error); }
  });

  router.delete('/posts/drafts/:id', ...mutate, async (req, res, next) => {
    try { res.json(await deleteService.deleteDraft(validateDraftId(req.params.id))); }
    catch (error) { next(error); }
  });

  router.delete('/posts/published/:slug', ...mutate, async (req, res, next) => {
    try { res.json(await deleteService.deletePublished(validateSlug(req.params.slug))); }
    catch (error) { next(error); }
  });

  router.post('/sync', ...mutate, async (req, res, next) => {
    try { res.json(await publishService.retrySync(validateDraftId(req.body.draftId))); }
    catch (error) { next(error); }
  });

  router.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_SIZE_INVALID' : 'UPLOAD_INVALID';
      return res.status(code === 'IMAGE_SIZE_INVALID' ? 413 : 400).json({ error: code });
    }
    return res.status(statusFor(error)).json({ error: error.code || 'INTERNAL_ERROR' });
  });
  return router;
}

module.exports = { cleanAlt, createAdminRouter, readPublicIndex, statusFor };
