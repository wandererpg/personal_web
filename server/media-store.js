const { randomUUID } = require('node:crypto');
const { copyFile, mkdir, readFile, realpath, rename, stat, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { contentError, validateDraftId, validateSlug } = require('./content-model.js');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MEDIA_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i;

function isWithin(baseDir, targetPath) {
  const relation = path.relative(baseDir, targetPath);
  return relation === '' || (relation !== '..'
    && !relation.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relation));
}

function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer)) throw contentError('IMAGE_TYPE_INVALID');
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: 'webp', mime: 'image/webp' };
  }
  throw contentError('IMAGE_TYPE_INVALID');
}

function validateMediaName(name) {
  if (typeof name !== 'string' || !MEDIA_NAME_PATTERN.test(name)) {
    throw contentError('IMAGE_NAME_INVALID');
  }
  return name;
}

function rewriteDraftMediaUrls(body, draftId, slug) {
  validateDraftId(draftId);
  validateSlug(slug);
  const prefix = `/api/admin/media/${draftId}/`;
  return String(body).split(prefix).join(`assets/blog/${slug}/`);
}

function extractDraftMediaNames(content, draftId) {
  validateDraftId(draftId);
  const pattern = new RegExp(`/api/admin/media/${draftId}/([0-9a-f-]{36}\\.(?:png|jpg|webp))`, 'gi');
  const names = [];
  let match;
  while ((match = pattern.exec(String(content)))) names.push(validateMediaName(match[1]));
  return [...new Set(names)];
}

async function containedDirectory(basePath, childPath) {
  const baseReal = await realpath(basePath);
  const childReal = await realpath(childPath);
  if (childReal === baseReal || !isWithin(baseReal, childReal) || !(await stat(childReal)).isDirectory()) {
    throw contentError('MEDIA_PATH_INVALID');
  }
  return { baseReal, childReal };
}

function createMediaStore({ dataDir, repoDir }) {
  const mediaRoot = path.join(dataDir, 'media');
  const publicRoot = path.join(repoDir, 'assets', 'blog');

  async function privateDirectory(draftId) {
    validateDraftId(draftId);
    await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
    const directory = path.join(mediaRoot, draftId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return (await containedDirectory(mediaRoot, directory)).childReal;
  }

  async function stage(draftId, buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw contentError('IMAGE_SIZE_INVALID');
    }
    const type = detectImage(buffer);
    const name = `${randomUUID()}.${type.extension}`;
    const directory = await privateDirectory(draftId);
    await writeFile(path.join(directory, name), buffer, { flag: 'wx', mode: 0o600 });
    return { name, mime: type.mime, url: `/api/admin/media/${draftId}/${name}` };
  }

  async function readPrivate(draftId, name) {
    const directory = await privateDirectory(draftId);
    const candidate = await realpath(path.join(directory, validateMediaName(name))).catch(error => {
      if (error.code === 'ENOENT') throw contentError('IMAGE_NOT_FOUND');
      throw error;
    });
    if (!isWithin(directory, candidate)) throw contentError('MEDIA_PATH_INVALID');
    const buffer = await readFile(candidate);
    return { buffer, mime: detectImage(buffer).mime };
  }

  async function publish(draftId, slug, names) {
    validateDraftId(draftId);
    validateSlug(slug);
    if (!Array.isArray(names) || names.length > 40) throw contentError('IMAGE_LIST_INVALID');
    await mkdir(publicRoot, { recursive: true });
    const destination = path.join(publicRoot, slug);
    await mkdir(destination, { recursive: true });
    const destinationReal = (await containedDirectory(publicRoot, destination)).childReal;
    const sourceDirectory = await privateDirectory(draftId);
    const paths = [];
    for (const name of [...new Set(names.map(validateMediaName))]) {
      const source = await realpath(path.join(sourceDirectory, name)).catch(error => {
        if (error.code === 'ENOENT') throw contentError('IMAGE_NOT_FOUND');
        throw error;
      });
      if (!isWithin(sourceDirectory, source)) throw contentError('MEDIA_PATH_INVALID');
      const temporaryName = `.${name}.${randomUUID()}.tmp`;
      const temporary = path.join(destinationReal, temporaryName);
      await copyFile(source, temporary);
      await rename(temporary, path.join(destinationReal, name));
      paths.push(`assets/blog/${slug}/${name}`);
    }
    return { paths };
  }

  return { publish, readPrivate, stage };
}

module.exports = {
  MAX_IMAGE_BYTES,
  createMediaStore,
  detectImage,
  extractDraftMediaNames,
  rewriteDraftMediaUrls,
  validateMediaName
};
