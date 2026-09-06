const { randomUUID } = require('node:crypto');
const { mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { contentError, validateModule, validateSlug, validateTags } = require('./content-model.js');
const { extractDraftMediaNames, rewriteDraftMediaUrls } = require('./media-store.js');

function requireText(value, code, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw contentError(code);
  return value.trim();
}

async function atomicText(file, content) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, file);
}

function readingTime(body) {
  const plain = body.replace(/```[\s\S]*?```/g, ' ').replace(/[#*`!()[\]_-]/g, ' ');
  return `${Math.max(1, Math.ceil(plain.trim().length / 500))} min`;
}

function publicRecord(draft, stamp, cover, body) {
  if (typeof draft.createdAt !== 'string' || Number.isNaN(Date.parse(draft.createdAt))
      || !/(?:Z|[+-]\d{2}:\d{2})$/.test(draft.createdAt)) {
    throw contentError('CREATED_AT_INVALID');
  }
  requireText(body, 'BODY_REQUIRED', 1_000_000);
  if (cover && (!cover.startsWith(`assets/blog/${draft.slug}/`) || cover.includes('..'))) {
    throw contentError('COVER_INVALID');
  }
  return {
    slug: validateSlug(draft.slug),
    title: requireText(draft.title, 'TITLE_REQUIRED', 160),
    module: validateModule(draft.module),
    createdAt: draft.createdAt,
    updatedAt: stamp,
    publishedAt: stamp,
    excerpt: requireText(draft.excerpt, 'EXCERPT_REQUIRED', 500),
    cover,
    tags: validateTags(draft.tags),
    readingTime: readingTime(body),
    content: `posts/${draft.slug}.md`
  };
}

function createPublishService({ repoDir, draftStore, mediaStore, gitPublisher, now = () => new Date().toISOString() }) {
  let queue = Promise.resolve();
  const serialize = operation => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => {});
    return next;
  };

  async function publish(draftId) {
    return serialize(async () => {
      const draft = await draftStore.get(draftId);
      validateSlug(draft.slug);
      if (draft.sourceSlug && draft.sourceSlug !== draft.slug) throw contentError('SLUG_CHANGE_UNSUPPORTED');
      if (typeof gitPublisher.preflight === 'function') await gitPublisher.preflight();

      const indexFile = path.join(repoDir, 'posts', 'index.json');
      let index;
      try {
        index = JSON.parse(await readFile(indexFile, 'utf8'));
      } catch (error) {
        throw Object.assign(contentError('PUBLIC_INDEX_INVALID'), { cause: error });
      }
      if (!Array.isArray(index)) throw contentError('PUBLIC_INDEX_INVALID');
      const existingIndex = index.findIndex(post => post.slug === draft.slug);
      if (existingIndex >= 0 && draft.sourceSlug !== draft.slug) throw contentError('SLUG_CONFLICT');

      const body = rewriteDraftMediaUrls(draft.body, draft.id, draft.slug);
      const cover = rewriteDraftMediaUrls(draft.cover || '', draft.id, draft.slug);
      if (body.includes('/api/admin/media/') || cover.includes('/api/admin/media/')) {
        throw contentError('PRIVATE_MEDIA_REFERENCE');
      }
      const stamp = now();
      const record = publicRecord(draft, stamp, cover, body);
      const mediaNames = extractDraftMediaNames(`${draft.cover}\n${draft.body}`, draft.id);
      const media = await mediaStore.publish(draft.id, draft.slug, mediaNames);
      if (existingIndex >= 0) index[existingIndex] = record;
      else index.push(record);
      index.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

      await mkdir(path.join(repoDir, 'posts'), { recursive: true });
      const articlePath = `posts/${draft.slug}.md`;
      await atomicText(path.join(repoDir, articlePath), `${body.trim()}\n`);
      await atomicText(indexFile, `${JSON.stringify(index, null, 2)}\n`);
      const paths = [articlePath, 'posts/index.json', ...media.paths];

      try {
        const result = await gitPublisher.commitAndPush({
          paths,
          message: `blog: publish ${record.title}`
        });
        await draftStore.updateSystem(draft.id, {
          status: 'published', syncStatus: 'synced', publishedAt: stamp, lastCommit: result.commit
        });
        return { post: record, paths, commit: result.commit, syncStatus: 'synced' };
      } catch (error) {
        if (error.code === 'GIT_PUSH_PENDING') {
          await draftStore.updateSystem(draft.id, {
            status: 'published', syncStatus: 'pending', publishedAt: stamp, lastCommit: error.commit
          });
        }
        throw error;
      }
    });
  }

  async function retrySync(draftId) {
    await gitPublisher.retryPush();
    await draftStore.updateSystem(draftId, { syncStatus: 'synced' });
    return { syncStatus: 'synced' };
  }

  return { publish, retrySync };
}

module.exports = { atomicText, createPublishService, publicRecord, readingTime };
