const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { MAX_IMAGES_PER_ENTRY, MAX_IMAGE_BYTES, createGuestbookStore, validateEntryId } = require('./guestbook-store.js');

function statusFor(error) {
  return {
    AUTH_REQUIRED: 401,
    CSRF_TOKEN_INVALID: 403,
    GUESTBOOK_RATE_LIMITED: 429,
    GUESTBOOK_NOT_FOUND: 404,
    IMAGE_NOT_FOUND: 404,
    IMAGE_TYPE_INVALID: 415,
    IMAGE_SIZE_INVALID: 413,
    GUESTBOOK_FULL: 409,
    GUESTBOOK_WRITE_FAILED: 500,
    GUESTBOOK_INVALID: 500,
    MEDIA_PATH_INVALID: 409,
    IMAGE_NAME_INVALID: 400,
    GUESTBOOK_ID_INVALID: 400,
    GUESTBOOK_CONTENT_REQUIRED: 400,
    IMAGE_COUNT_INVALID: 400,
    NICKNAME_INVALID: 400,
    MESSAGE_INVALID: 400,
  }[error.code] || 500;
}

function handleError(error, _request, response, _next) {
  if (error instanceof multer.MulterError) {
    const code = error.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_SIZE_INVALID' : 'UPLOAD_INVALID';
    return response.status(statusFor({ code })).json({ error: code });
  }
  return response.status(statusFor(error)).json({ error: error.code || 'INTERNAL_ERROR' });
}

function createUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: MAX_IMAGES_PER_ENTRY,
      fields: 2,
      parts: MAX_IMAGES_PER_ENTRY + 2,
    },
  });
}

function createPublicGuestbookRouter({ guestbookStore = createGuestbookStore() } = {}) {
  const router = express.Router();
  const upload = createUpload();
  const submitLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'GUESTBOOK_RATE_LIMITED' },
  });

  router.get('/', async (_request, response, next) => {
    try { response.json({ entries: await guestbookStore.list() }); }
    catch (error) { next(error); }
  });

  router.get('/media/:name', async (request, response, next) => {
    try {
      const image = await guestbookStore.readImage(request.params.name);
      response.set('Cache-Control', 'public, max-age=3600');
      response.type(image.mime).send(image.buffer);
    } catch (error) { next(error); }
  });

  router.post('/', submitLimiter, upload.array('images', MAX_IMAGES_PER_ENTRY), async (request, response, next) => {
    try {
      const entry = await guestbookStore.create({
        nickname: request.body?.nickname,
        message: request.body?.message,
        files: request.files || [],
      });
      response.status(201).json({ entry });
    } catch (error) { next(error); }
  });

  router.use(handleError);
  return router;
}

function createAdminGuestbookRouter({ guestbookStore, auth }) {
  const router = express.Router();
  router.get('/', async (_request, response, next) => {
    try { response.json({ entries: await guestbookStore.list() }); }
    catch (error) { next(error); }
  });
  router.delete('/:id', auth.requireCsrf, async (request, response, next) => {
    try { response.json(await guestbookStore.remove(validateEntryId(request.params.id))); }
    catch (error) { next(error); }
  });
  router.use(handleError);
  return router;
}

module.exports = {
  createAdminGuestbookRouter,
  createPublicGuestbookRouter,
  handleError,
  statusFor,
};
