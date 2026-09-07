import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createAdminFixture, pngFixture } from './helpers/admin-fixture.mjs';

test('public guestbook starts empty', async () => {
  const fixture = await createAdminFixture();
  await request(fixture.app).get('/api/guestbook').expect(200, { entries: [] });
});

test('visitors can publish text and an image to the guestbook', async () => {
  const fixture = await createAdminFixture();
  const response = await request(fixture.app)
    .post('/api/guestbook')
    .field('nickname', '路过的朋友')
    .field('message', '留下一束信号')
    .attach('images', pngFixture, { filename: 'signal.png', contentType: 'image/png' })
    .expect(201);

  const entry = response.body.entry;
  assert.equal(entry.nickname, '路过的朋友');
  assert.equal(entry.message, '留下一束信号');
  assert.equal(entry.images.length, 1);
  assert.match(entry.images[0].url, /^\/api\/guestbook\/media\/[0-9a-f-]+\.png$/);
  await request(fixture.app).get(entry.images[0].url).expect(200)
    .expect('Content-Type', /image\/png/);
  await request(fixture.app).get('/api/guestbook').expect(200, { entries: [entry] });
});

test('guestbook rejects unsupported image bytes', async () => {
  const fixture = await createAdminFixture();
  await request(fixture.app)
    .post('/api/guestbook')
    .field('message', '不是图片')
    .attach('images', Buffer.from('not-an-image'), { filename: 'bad.png', contentType: 'image/png' })
    .expect(415, { error: 'IMAGE_TYPE_INVALID' });
});

test('only the authenticated admin can delete guestbook entries', async () => {
  const fixture = await createAdminFixture();
  const created = await request(fixture.app)
    .post('/api/guestbook')
    .field('message', '待删除留言')
    .expect(201);
  const id = created.body.entry.id;

  await request(fixture.app).delete(`/api/admin/guestbook/${id}`)
    .expect(401, { error: 'AUTH_REQUIRED' });
  const { agent, csrfToken } = await fixture.login();
  await agent.delete(`/api/admin/guestbook/${id}`)
    .set('x-csrf-token', csrfToken)
    .expect(200, { deleted: true, id });
  await request(fixture.app).get('/api/guestbook').expect(200, { entries: [] });
});

test('guestbook requires text or an image', async () => {
  const fixture = await createAdminFixture();
  await request(fixture.app).post('/api/guestbook').expect(400, { error: 'GUESTBOOK_CONTENT_REQUIRED' });
});
