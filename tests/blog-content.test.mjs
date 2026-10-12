
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const exists = (name) => access(new URL(name, root)).then(() => true, () => false);

test('blog index points to existing Markdown and optional cover files', async () => {
  const posts = JSON.parse(await read('posts/index.json'));
  assert.ok(Array.isArray(posts));
  for (const post of posts) {
    assert.match(post.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(post.content, /^posts\/[a-z0-9-]+\.md$/);
    assert.equal(await exists(post.content), true, `${post.content} is missing`);
    assert.ok(['projects', 'insights', 'learning'].includes(post.module), `${post.slug} has an invalid module`);
    assert.match(post.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    assert.match(post.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    assert.equal('date' in post, false, `${post.slug} still uses legacy date`);
    assert.equal('category' in post, false, `${post.slug} still uses legacy category`);
    if (post.cover) assert.equal(await exists(post.cover), true, `${post.cover} is missing`);
  }
  const smallProjects = posts.find(post => post.slug === 'small-projects');
  if (smallProjects) {
    assert.equal(await exists('assets/blog/small-projects/diagram.svg'), true, 'diagram.svg is missing');
  }
});

test('small projects article keeps its diagram reference when published', async () => {
  const posts = JSON.parse(await read('posts/index.json'));
  const smallProjects = posts.find(post => post.slug === 'small-projects');
  if (!smallProjects) return;
  const markdown = await read(smallProjects.content);
  assert.match(markdown, /!\[[^\]]+\]\(assets\/blog\/small-projects\/diagram\.svg(?:\s+"[^"]+")?\)/);
});

test('published articles contain readable Markdown content', async () => {
  const posts = JSON.parse(await read('posts/index.json'));
  for (const post of posts) {
    const markdown = await read(post.content);
    assert.match(markdown, /^# /m, `${post.content} needs a title`);
    assert.ok(markdown.trim().length > 20, `${post.content} needs article content`);
  }
});

test('blog titles do not contain Chinese full stops', async () => {
  const posts = JSON.parse(await read('posts/index.json'));

  for (const post of posts) {
    assert.doesNotMatch(post.title, /。/, `${post.slug} metadata title contains a full stop`);

    const markdown = await read(post.content);
    const heading = markdown.match(/^#\s+(.+)$/m)?.[1];
    if (heading) assert.doesNotMatch(heading, /。/, `${post.slug} Markdown title contains a full stop`);
  }
});
