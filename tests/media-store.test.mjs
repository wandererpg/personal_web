import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const jpeg = Buffer.from('ffd8ffe000104a464946', 'hex');
const webp = Buffer.from('524946460c0000005745425056503820', 'hex');

async function fixture() {
  const { createMediaStore } = require('../server/media-store.js');
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-media-data-'));
  const repoDir = await mkdtemp(join(tmpdir(), 'wanderer-media-repo-'));
  await mkdir(join(repoDir, 'assets', 'blog'), { recursive: true });
  return { dataDir, repoDir, store: createMediaStore({ dataDir, repoDir }) };
}

test('detectImage trusts signatures rather than extension or declared MIME', () => {
  const { detectImage } = require('../server/media-store.js');

  assert.deepEqual(detectImage(png), { extension: 'png', mime: 'image/png' });
  assert.deepEqual(detectImage(jpeg), { extension: 'jpg', mime: 'image/jpeg' });
  assert.deepEqual(detectImage(webp), { extension: 'webp', mime: 'image/webp' });
  assert.throws(() => detectImage(Buffer.from('<svg><script>alert(1)</script></svg>')),
    error => error.code === 'IMAGE_TYPE_INVALID');
});

test('stage writes a generated safe filename and preserves image bytes', async () => {
  const { store } = await fixture();
  const asset = await store.stage(DRAFT_ID, png);

  assert.match(asset.name, /^[0-9a-f-]{36}\.png$/);
  assert.equal(asset.mime, 'image/png');
  assert.equal(asset.url, `/api/admin/media/${DRAFT_ID}/${asset.name}`);
  const saved = await store.readPrivate(DRAFT_ID, asset.name);
  assert.deepEqual(saved.buffer, png);
  assert.equal(saved.mime, 'image/png');
});

test('stage rejects empty and oversized image buffers', async () => {
  const { MAX_IMAGE_BYTES } = require('../server/media-store.js');
  const { store } = await fixture();

  await assert.rejects(() => store.stage(DRAFT_ID, Buffer.alloc(0)),
    error => error.code === 'IMAGE_SIZE_INVALID');
  await assert.rejects(() => store.stage(DRAFT_ID, Buffer.alloc(MAX_IMAGE_BYTES + 1)),
    error => error.code === 'IMAGE_SIZE_INVALID');
});

test('draft media URLs are rewritten only for the publishing draft', () => {
  const { extractDraftMediaNames, rewriteDraftMediaUrls } = require('../server/media-store.js');
  const name = '22222222-2222-4222-8222-222222222222.png';
  const other = '33333333-3333-4333-8333-333333333333';
  const body = `![结构图](/api/admin/media/${DRAFT_ID}/${name})\n![其他](/api/admin/media/${other}/${name})`;
  const rewritten = rewriteDraftMediaUrls(body, DRAFT_ID, 'site-log');

  assert.match(rewritten, /assets\/blog\/site-log\/22222222-2222-4222-8222-222222222222\.png/);
  assert.match(rewritten, new RegExp(`/api/admin/media/${other}/`));
  assert.deepEqual(extractDraftMediaNames(body, DRAFT_ID), [name]);
});

test('publish copies staged files into the article asset directory', async () => {
  const { repoDir, store } = await fixture();
  const asset = await store.stage(DRAFT_ID, png);
  const result = await store.publish(DRAFT_ID, 'site-log', [asset.name]);

  assert.deepEqual(result.paths, [`assets/blog/site-log/${asset.name}`]);
  assert.deepEqual(await readFile(join(repoDir, result.paths[0])), png);
  await assert.rejects(() => store.publish(DRAFT_ID, 'site-log', ['../secret.png']),
    error => error.code === 'IMAGE_NAME_INVALID');
});

test('publish refuses an article asset directory linked outside the repository', async t => {
  const { repoDir, store } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'wanderer-media-outside-'));
  try {
    await symlink(outside, join(repoDir, 'assets', 'blog', 'site-log'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) return t.skip('junction creation unavailable');
    throw error;
  }
  const asset = await store.stage(DRAFT_ID, png);
  await assert.rejects(() => store.publish(DRAFT_ID, 'site-log', [asset.name]),
    error => error.code === 'MEDIA_PATH_INVALID');
});
