import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const exists = async (name) => access(new URL(name, root)).then(() => true, () => false);
const musicFiles = [
  'music/松本文紀 - 花弁となり 世界は大いに歌う.mp3',
  'music/松本文紀 - 夢の歩みを見上げて (仰望梦想的脚步).mp3',
  'music/松本文紀 - 夜の向日葵.flac',
  'music/松本文紀 - 月の眼球譚.mp3',
];

test('required site files exist', async () => {
  for (const file of ['index.html', 'projects.html', 'notes.html', 'styles.css', 'script.js']) {
    assert.equal(await exists(file), true, `${file} is missing`);
  }
});

test('pages expose shared navigation and semantic landmarks', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /<header[\s>]/);
    assert.match(html, /<main[\s>]/);
    assert.match(html, /<footer[\s>]/);
    assert.match(html, /href="projects\.html"/);
    assert.match(html, /href="notes\.html"/);
    assert.match(html, /href="https:\/\//);
  }
});

test('styles include responsive and reduced-motion rules', async () => {
  const css = await read('styles.css');
  assert.match(css, /@media/);
  assert.match(css, /prefers-reduced-motion/);
});

test('page hero clips decorative overflow', async () => {
  const css = await read('styles.css');
  assert.match(css, /\.page-hero\s*\{[^}]*overflow:\s*hidden;/s);
});

test('pages provide a local favicon', async () => {
  assert.equal(await exists('favicon.svg'), true, 'favicon.svg is missing');
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /rel="icon" href="favicon\.svg"/);
  }
});

test('pages do not ship unfinished placeholder copy', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.doesNotMatch(html, /lorem ipsum|TODO|TBD|coming soon/i);
  }
});

test('pages expose the owner platform links', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /https:\/\/github\.com\/wandererpg/);
    assert.match(html, /https:\/\/space\.bilibili\.com\/1065241718/);
  }
});

test('pages include cross-page transition and music player hooks', async () => {
  const css = await read('styles.css');
  const js = await read('script.js');

  assert.match(css, /is-entering/);
  assert.match(css, /is-leaving/);
  assert.match(js, /location\.assign/);
  assert.match(js, /data-music-audio/);
  assert.match(js, /data-music-select/);
  assert.match(js, /\.play\(\)/);

  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /data-music-player/);
    assert.match(html, /data-music-toggle/);
    assert.match(html, /data-music-select/);
    assert.match(html, /data-music-audio/);
    assert.match(html, /<option value="0"(?: selected)?>/);
    assert.match(html, /<option value="3">/);
    assert.match(html, /aria-pressed="false"/);
  }
});

test('music playlist assets exist and are wired into the player', async () => {
  const js = await read('script.js');
  for (const file of musicFiles) {
    assert.equal(await exists(file), true, `${file} is missing`);
    const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(js, new RegExp(escapedFile));
  }
});

test('music player stays fixed to the viewport during page transitions', async () => {
  const css = await read('styles.css');
  assert.match(css, /\.music-player\s*\{[^}]*position:\s*fixed;/s);
  assert.doesNotMatch(css, /html(?:\.[\w-]+)? body\s*\{[^}]*transform:/s);
});

test('music player defaults to 夜の向日葵 without legacy labels', async () => {
  const js = await read('script.js');
  assert.match(js, /defaultTrackIndex\s*=\s*2/);
  assert.doesNotMatch(js, /ORBITAL AMBIENCE|本地音乐/);

  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /<strong data-music-title>夜の向日葵<\/strong>/);
    assert.match(html, /<option value="2" selected>夜の向日葵<\/option>/);
    assert.doesNotMatch(html, /ORBITAL AMBIENCE|本地音乐/);
  }
});
