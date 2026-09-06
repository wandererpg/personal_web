import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const exists = (name) => access(new URL(name, root)).then(() => true, () => false);

test('blog index points to existing Markdown and optional cover files', async () => {
  const posts = JSON.parse(await read('posts/index.json'));
  assert.equal(posts.length, 3);
  for (const post of posts) {
    assert.match(post.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(post.content, /^posts\/[a-z0-9-]+\.md$/);
    assert.equal(await exists(post.content), true, `${post.content} is missing`);
    assert.ok(['projects', 'insights', 'learning'].includes(post.module), `${post.slug} has an invalid module`);
    assert.match(post.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    assert.match(post.updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    assert.equal('date' in post, false, `${post.slug} still uses legacy date`);
    assert.equal('category' in post, false, `${post.slug} still uses legacy category`);
    if (post.cover) assert.equal(await exists(post.cover), true, `${post.cover} is missing`);
  }
  assert.equal(await exists('assets/blog/small-projects/diagram.svg'), true, 'diagram.svg is missing');
});

test('small projects article contains the required diagram reference', async () => {
  const markdown = await read('posts/small-projects.md');
  assert.match(markdown, /!\[[^\]]+\]\(assets\/blog\/small-projects\/diagram\.svg(?:\s+"[^"]+")?\)/);
});

test('sample articles contain readable Markdown content', async () => {
  for (const file of ['posts/small-projects.md', 'posts/visible-steps.md', 'posts/first-orbit.md']) {
    const markdown = await read(file);
    assert.match(markdown, /^# /m, `${file} needs a title`);
    assert.ok(markdown.trim().length > 120, `${file} needs article content`);
    assert.match(markdown, /^- /m, `${file} needs a list`);
  }
});
