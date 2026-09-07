const { randomUUID } = require('node:crypto');
const { mkdir, readFile, realpath, rename, rm, stat, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { detectImage } = require('./media-store.js');

const MAX_NICKNAME_LENGTH = 32;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_IMAGES_PER_ENTRY = 3;
const MAX_ENTRIES = 500;
const MAX_PUBLIC_ENTRIES = 100;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ENTRY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i;
const DEFAULT_GUESTBOOK = Object.freeze({ version: 1, entries: Object.freeze([]) });

function guestbookError(code, cause) {
  return Object.assign(new Error(code, cause ? { cause } : undefined), { code });
}

function validateEntryId(value) {
  if (typeof value !== 'string' || !ENTRY_ID_PATTERN.test(value)) throw guestbookError('GUESTBOOK_ID_INVALID');
  return value;
}

function validateImageName(value) {
  if (typeof value !== 'string' || !IMAGE_NAME_PATTERN.test(value)) throw guestbookError('IMAGE_NAME_INVALID');
  return value;
}

function normalizeEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw guestbookError('GUESTBOOK_INVALID');
  const id = validateEntryId(input.id);
  const nickname = String(input.nickname ?? '').trim() || '匿名访客';
  const message = String(input.message ?? '').trim();
  const createdAt = String(input.createdAt ?? '');
  if (nickname.length > MAX_NICKNAME_LENGTH || message.length > MAX_MESSAGE_LENGTH
      || !createdAt || Number.isNaN(Date.parse(createdAt))) throw guestbookError('GUESTBOOK_INVALID');
  if (!Array.isArray(input.images) || input.images.length > MAX_IMAGES_PER_ENTRY) {
    throw guestbookError('GUESTBOOK_INVALID');
  }
  const images = input.images.map(image => {
    if (!image || typeof image !== 'object') throw guestbookError('GUESTBOOK_INVALID');
    const name = validateImageName(image.name);
    const mime = String(image.mime ?? '');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw guestbookError('GUESTBOOK_INVALID');
    return { name, mime };
  });
  if (!message && images.length === 0) throw guestbookError('GUESTBOOK_CONTENT_REQUIRED');
  return { id, nickname, message, createdAt, images };
}

function normalizeDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Number(input.version ?? 1) !== 1
      || !Array.isArray(input.entries) || input.entries.length > MAX_ENTRIES) {
    throw guestbookError('GUESTBOOK_INVALID');
  }
  const ids = new Set();
  const entries = input.entries.map(entry => {
    const normalized = normalizeEntry(entry);
    if (ids.has(normalized.id)) throw guestbookError('GUESTBOOK_INVALID');
    ids.add(normalized.id);
    return normalized;
  });
  return { version: 1, entries };
}

function publicEntry(entry) {
  return {
    id: entry.id,
    nickname: entry.nickname,
    message: entry.message,
    createdAt: entry.createdAt,
    images: entry.images.map(image => ({
      mime: image.mime,
      url: `/api/guestbook/media/${image.name}`,
    })),
  };
}

function createGuestbookStore({ dataDir } = {}) {
  if (!dataDir) {
    let current = normalizeDocument(DEFAULT_GUESTBOOK);
    const images = new Map();
    return {
      async list() {
        return [...current.entries]
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
          .slice(0, MAX_PUBLIC_ENTRIES)
          .map(publicEntry);
      },
      async create(input) {
        const files = Array.isArray(input?.files) ? input.files : [];
        const entry = createEntry(input, files);
        const stored = files.map(fileInput => {
          if (!Buffer.isBuffer(fileInput.buffer) || fileInput.buffer.length === 0 || fileInput.buffer.length > MAX_IMAGE_BYTES) {
            throw guestbookError('IMAGE_SIZE_INVALID');
          }
          const image = detectImage(fileInput.buffer);
          const name = `${randomUUID()}.${image.extension}`;
          images.set(name, { buffer: fileInput.buffer, mime: image.mime });
          return { name, mime: image.mime };
        });
        const saved = normalizeEntry({ ...entry, images: stored });
        current = normalizeDocument({ version: 1, entries: [saved, ...current.entries] });
        return publicEntry(saved);
      },
      async remove(id) {
        validateEntryId(id);
        const entry = current.entries.find(item => item.id === id);
        if (!entry) throw guestbookError('GUESTBOOK_NOT_FOUND');
        current = normalizeDocument({ version: 1, entries: current.entries.filter(item => item.id !== id) });
        entry.images.forEach(image => images.delete(image.name));
        return { deleted: true, id };
      },
      async readImage(name) {
        const image = images.get(validateImageName(name));
        if (!image) throw guestbookError('IMAGE_NOT_FOUND');
        return image;
      },
    };
  }

  const file = path.join(dataDir, 'guestbook.json');
  const mediaRoot = path.join(dataDir, 'guestbook', 'media');
  let mutationQueue = Promise.resolve();

  async function readDocument() {
    try {
      return normalizeDocument(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return normalizeDocument(DEFAULT_GUESTBOOK);
      if (error.code?.startsWith('GUESTBOOK_')) throw error;
      throw guestbookError('GUESTBOOK_INVALID', error);
    }
  }

  async function writeDocument(document) {
    await mkdir(dataDir, { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw guestbookError('GUESTBOOK_WRITE_FAILED', error);
    }
  }

  function exclusive(task) {
    const next = mutationQueue.then(task, task);
    mutationQueue = next.catch(() => {});
    return next;
  }

  return {
    async list() {
      const document = await readDocument();
      return [...document.entries]
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, MAX_PUBLIC_ENTRIES)
        .map(publicEntry);
    },

    async create(input) {
      return exclusive(async () => {
        const files = Array.isArray(input?.files) ? input.files : [];
        const entry = createEntry(input, files);
        const stored = [];
        try {
          await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
          for (const fileInput of files) {
            const image = detectImage(fileInput.buffer);
            const name = `${randomUUID()}.${image.extension}`;
            if (fileInput.buffer.length === 0 || fileInput.buffer.length > MAX_IMAGE_BYTES) {
              throw guestbookError('IMAGE_SIZE_INVALID');
            }
            await writeFile(path.join(mediaRoot, name), fileInput.buffer, { flag: 'wx', mode: 0o600 });
            stored.push({ name, mime: image.mime });
          }
          const document = await readDocument();
          if (document.entries.length >= MAX_ENTRIES) throw guestbookError('GUESTBOOK_FULL');
          const saved = normalizeEntry({ ...entry, images: stored });
          await writeDocument({ version: 1, entries: [saved, ...document.entries] });
          return publicEntry(saved);
        } catch (error) {
          await Promise.all(stored.map(image => rm(path.join(mediaRoot, image.name), { force: true })));
          throw error;
        }
      });
    },

    async remove(id) {
      return exclusive(async () => {
        validateEntryId(id);
        const document = await readDocument();
        const entry = document.entries.find(item => item.id === id);
        if (!entry) throw guestbookError('GUESTBOOK_NOT_FOUND');
        await writeDocument({ version: 1, entries: document.entries.filter(item => item.id !== id) });
        await Promise.all(entry.images.map(image => rm(path.join(mediaRoot, image.name), { force: true })));
        return { deleted: true, id };
      });
    },

    async readImage(name) {
      const safeName = validateImageName(name);
      const mediaBase = await realpath(mediaRoot).catch(error => {
        if (error.code === 'ENOENT') throw guestbookError('IMAGE_NOT_FOUND');
        throw error;
      });
      const candidate = await realpath(path.join(mediaRoot, safeName)).catch(error => {
        if (error.code === 'ENOENT') throw guestbookError('IMAGE_NOT_FOUND');
        throw error;
      });
      const relation = path.relative(mediaBase, candidate);
      if (relation === '' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)
          || !(await stat(candidate)).isFile()) throw guestbookError('MEDIA_PATH_INVALID');
      const buffer = await readFile(candidate);
      const image = detectImage(buffer);
      return { buffer, mime: image.mime };
    },
  };
}

function createEntry(input, files) {
  const nickname = String(input?.nickname ?? '').trim() || '匿名访客';
  const message = String(input?.message ?? '').trim();
  if (nickname.length > MAX_NICKNAME_LENGTH) throw guestbookError('NICKNAME_INVALID');
  if (message.length > MAX_MESSAGE_LENGTH) throw guestbookError('MESSAGE_INVALID');
  if (files.length > MAX_IMAGES_PER_ENTRY) throw guestbookError('IMAGE_COUNT_INVALID');
  if (!message && files.length === 0) throw guestbookError('GUESTBOOK_CONTENT_REQUIRED');
  return { id: randomUUID(), nickname, message, createdAt: new Date().toISOString(), images: [] };
}

module.exports = {
  MAX_ENTRIES,
  MAX_IMAGES_PER_ENTRY,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_NICKNAME_LENGTH,
  createGuestbookStore,
  guestbookError,
  publicEntry,
  validateEntryId,
  validateImageName,
};
