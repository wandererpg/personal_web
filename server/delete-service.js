const { readFile, readdir, realpath, rm, stat } = require('node:fs/promises');
const path = require('node:path');
const { atomicJson } = require('./draft-store.js');
const { contentError, validateDraftId, validateSlug } = require('./content-model.js');

const PUBLIC_CONTENT_PATTERN = /^posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const PUBLIC_ASSET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,159}\.(?:png|jpg|webp|svg)$/i;

function isWithin(baseDir, targetPath) {
  const relation = path.relative(baseDir, targetPath);
  return relation === '' || (relation !== '..'
    && !relation.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relation));
}

function missing(error) {
  return ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code);
}

async function readIndex(repoDir) {
  try {
    const value = JSON.parse(await readFile(path.join(repoDir, 'posts', 'index.json'), 'utf8'));
    if (!Array.isArray(value)) throw new Error('not an array');
    return value;
  } catch (error) {
    throw Object.assign(contentError('PUBLIC_INDEX_INVALID'), { cause: error });
  }
}

async function publicFile(repoDir, content) {
  if (typeof content !== 'string' || !PUBLIC_CONTENT_PATTERN.test(content)) {
    throw contentError('PUBLISHED_CONTENT_INVALID');
  }
  try {
    const postsRoot = await realpath(path.join(repoDir, 'posts'));
    const candidate = await realpath(path.join(repoDir, ...content.split('/')));
    if (!isWithin(postsRoot, candidate) || !(await stat(candidate)).isFile()) {
      throw contentError('PUBLISHED_CONTENT_INVALID');
    }
    return { path: candidate, relative: content };
  } catch (error) {
    if (error.code === 'PUBLISHED_CONTENT_INVALID') throw error;
    if (missing(error)) throw contentError('PUBLISHED_CONTENT_INVALID');
    throw error;
  }
}

async function publicAssets(repoDir, slug) {
  const rootPath = path.join(repoDir, 'assets', 'blog');
  let root;
  try {
    root = await realpath(rootPath);
  } catch (error) {
    if (missing(error)) return { directory: null, paths: [] };
    throw error;
  }
  const directoryPath = path.join(rootPath, slug);
  let directory;
  try {
    directory = await realpath(directoryPath);
  } catch (error) {
    if (missing(error)) return { directory: null, paths: [] };
    throw error;
  }
  if (directory === root || !isWithin(root, directory) || !(await stat(directory)).isDirectory()) {
    throw contentError('MEDIA_PATH_INVALID');
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (!entry.isFile() || !PUBLIC_ASSET_NAME_PATTERN.test(entry.name)) {
      throw contentError('MEDIA_PATH_INVALID');
    }
    const file = await realpath(path.join(directory, entry.name));
    if (!isWithin(directory, file) || !(await stat(file)).isFile()) throw contentError('MEDIA_PATH_INVALID');
    paths.push(`assets/blog/${slug}/${entry.name}`);
  }
  return { directory, paths };
}

function createDeleteService({ repoDir, dataDir, draftStore, mediaStore, gitPublisher }) {
  async function deleteDraft(draftId) {
    const id = validateDraftId(draftId);
    const draft = await draftStore.get(id);
    if (draft.status !== 'draft') throw contentError('DRAFT_DELETE_INVALID');
    await mediaStore.removeDraft(id);
    await draftStore.remove(id);
    return { deleted: true, type: 'draft', id };
  }

  async function deletePublished(slugValue) {
    const slug = validateSlug(slugValue);
    const index = await readIndex(repoDir);
    const indexPosition = index.findIndex(post => post.slug === slug);
    if (indexPosition < 0) throw contentError('PUBLISHED_POST_NOT_FOUND');
    const published = index[indexPosition];
    const content = await publicFile(repoDir, published.content);
    const assets = await publicAssets(repoDir, slug);
    const nextIndex = index.filter((_post, indexEntry) => indexEntry !== indexPosition);
    await atomicJson(path.join(repoDir, 'posts', 'index.json'), nextIndex);
    await rm(content.path, { force: true });
    if (assets.directory) await rm(assets.directory, { recursive: true, force: true });

    const paths = [content.relative, 'posts/index.json', ...assets.paths];
    const result = await gitPublisher.commitAndPush({
      paths,
      message: `blog: delete ${published.title}`
    });

    for (const draft of await draftStore.list()) {
      if (draft.status === 'published' && draft.slug === slug) {
        await mediaStore.removeDraft(draft.id);
        await draftStore.remove(draft.id);
      }
    }
    return { deleted: true, type: 'published', slug, commit: result.commit, syncStatus: 'synced' };
  }

  return { deleteDraft, deletePublished };
}

module.exports = { createDeleteService, isWithin, publicAssets, publicFile };
