import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../src/app.js';
import { slugify, parsePrice, modules, normalizeTags } from '../src/util.js';
import { renderMarkdown } from '../src/markdown.js';

const ADMIN = { email: 'admin@test.local', password: 'correct-horse-42' };
// минимальный валидный PNG 1×1
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let server;
let base;
let ctx;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cclab-test-'));
  ctx = await createApp({
    dataDir, memoryDb: true, adminEmail: ADMIN.email, adminPassword: ADMIN.password, seedDemo: true, quiet: true,
  });
  await new Promise((resolve) => {
    server = ctx.app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await ctx.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const get = (url, opts = {}) => fetch(base + url, { redirect: 'manual', ...opts });
const form = (data) => new URLSearchParams(data);

async function login() {
  const res = await get('/admin/login', { method: 'POST', body: form(ADMIN) });
  assert.equal(res.status, 303);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const page = await (await get('/admin', { headers: { cookie } })).text();
  const csrf = page.match(/name="_csrf" value="([^"]+)"/)[1];
  return { cookie, csrf };
}

test('публичные страницы открываются и показывают демо-каталог', async () => {
  for (const url of ['/', '/catalog', '/request', '/thanks', '/robots.txt', '/sitemap.xml']) {
    const res = await get(url);
    assert.equal(res.status, 200, url);
  }
  const catalog = await (await get('/catalog')).text();
  assert.match(catalog, /Робототехника: от LEGO до Arduino/);

  const product = await get('/catalog/robototehnika-ot-lego-do-arduino');
  assert.equal(product.status, 200);
  assert.match(await product.text(), /Что входит/);

  assert.equal((await get('/catalog/net-takoy')).status, 404);
  assert.match(await (await get('/sitemap.xml')).text(), /robototehnika-ot-lego-do-arduino/);
});

test('поиск и фильтры каталога работают с кириллицей', async () => {
  const byWord = await (await get(`/catalog?q=${encodeURIComponent('РОБОТ')}`)).text();
  assert.match(byWord, /Робототехника/);
  assert.doesNotMatch(byWord, /Python для школьников/);

  const byCategory = await (await get('/catalog?category=platforms')).text();
  assert.match(byCategory, /Онлайн-тренажёр по алгоритмам/);
  assert.doesNotMatch(byCategory, /Python для школьников/);

  const byTag = await (await get('/catalog?tag=python')).text();
  assert.match(byTag, /Python для школьников/);
});

test('заявка с сайта сохраняется, ошибки и боты отсекаются', async () => {
  const ok = await get('/request', {
    method: 'POST',
    body: form({ name: 'Айгерим', organization: 'Школа №1', contact: '+7 700 000 00 00', message: 'Хотим курс', product_id: '1' }),
  });
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('location'), /^\/thanks/);

  const bad = await get('/request', { method: 'POST', body: form({ name: 'А', contact: '' }) });
  assert.equal(bad.status, 422);

  const bot = await get('/request', { method: 'POST', body: form({ name: 'Bot', contact: 'bot@spam.io', website: 'http://spam' }) });
  assert.equal(bot.status, 303);

  const leads = await ctx.store.listLeads();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].product_title, 'Робототехника: от LEGO до Arduino');
});

test('админка закрыта паролем', async () => {
  const res = await get('/admin');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^\/admin\/login/);

  const wrong = await get('/admin/login', { method: 'POST', body: form({ email: ADMIN.email, password: 'nope' }) });
  assert.equal(wrong.status, 401);
});

test('POST без CSRF-токена отклоняется', async () => {
  const { cookie } = await login();
  const res = await get('/admin/categories', { method: 'POST', headers: { cookie }, body: form({ name: 'Хак' }) });
  assert.equal(res.status, 403);
  assert.ok(!(await ctx.store.listCategories()).some((c) => c.name === 'Хак'));
});

test('создание, публикация и редактирование разработки с картинками', async () => {
  const { cookie, csrf } = await login();

  const fd = new FormData();
  fd.set('title', 'Шахматы для начальной школы');
  fd.set('tagline', 'Курс для 1–4 классов');
  fd.set('features', '- 34 урока\n- Турнир в конце года');
  fd.set('modules', 'Фигуры — как ходят\nТактика: вилки и связки');
  fd.set('price', '90 000');
  fd.set('tags', 'Шахматы, логика');
  fd.set('status', 'draft');
  fd.set('cover', new Blob([PNG], { type: 'image/png' }), 'cover.png');
  fd.append('gallery', new Blob([PNG], { type: 'image/png' }), 'a.png');

  const created = await get(`/admin/products?_csrf=${encodeURIComponent(csrf)}`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(created.status, 303);
  const id = Number(created.headers.get('location').match(/products\/(\d+)\/edit/)[1]);
  const product = await ctx.store.getProduct(id);
  assert.equal(product.slug, 'shahmaty-dlya-nachalnoy-shkoly');
  assert.equal(product.price, 90000);
  assert.equal(product.tags, 'шахматы,логика');
  assert.equal(product.features, '34 урока\nТурнир в конце года');
  assert.ok(product.cover.endsWith('.png'));
  assert.equal(product.galleryList.length, 1);

  // черновик не виден посетителям, но виден админу
  assert.equal((await get(`/catalog/${product.slug}`)).status, 404);
  assert.equal((await get(`/catalog/${product.slug}`, { headers: { cookie } })).status, 200);
  assert.equal((await get(`/uploads/${product.cover}`)).status, 200);

  const published = await get(`/admin/products/${id}/status`, {
    method: 'POST', headers: { cookie }, body: form({ _csrf: csrf, status: 'published' }),
  });
  assert.equal(published.status, 303);
  const page = await (await get(`/catalog/${product.slug}`)).text();
  assert.match(page, /Шахматы для начальной школы/);
  assert.match(page, /90\s000 ₸/); // ru-RU разделяет разряды неразрывным пробелом
  assert.match(page, /Тактика/);
  assert.match(await (await get('/catalog')).text(), /Шахматы для начальной школы/);

  // убираем обложку и картинку из галереи — файлы удаляются с диска
  const edit = new FormData();
  for (const [k, v] of Object.entries({ title: product.title, status: 'published', price: '' })) edit.set(k, v);
  edit.set('remove_cover', '1');
  edit.set('remove_gallery', product.galleryList[0]);
  const updated = await get(`/admin/products/${id}?_csrf=${encodeURIComponent(csrf)}`, { method: 'POST', headers: { cookie }, body: edit });
  assert.equal(updated.status, 303);
  const after = await ctx.store.getProduct(id);
  assert.equal(after.cover, '');
  assert.equal(after.galleryList.length, 0);
  assert.equal(after.price, null);
  assert.equal(await ctx.store.getFile(product.cover), null);
  assert.equal((await get(`/uploads/${product.cover}`)).status, 404);
  assert.match(await (await get(`/catalog/${product.slug}`)).text(), /По запросу/);
});

test('загрузка не-картинки отклоняется', async () => {
  const { cookie, csrf } = await login();
  const fd = new FormData();
  fd.set('title', 'С вирусом');
  fd.set('cover', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  const res = await get(`/admin/products?_csrf=${encodeURIComponent(csrf)}`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(res.status, 422);
  assert.ok(!(await ctx.store.listAllProducts()).some((p) => p.title === 'С вирусом'));
});

test('заявки: смена статуса и выгрузка CSV', async () => {
  const { cookie, csrf } = await login();
  const [lead] = await ctx.store.listLeads();
  const res = await get(`/admin/leads/${lead.id}`, {
    method: 'POST', headers: { cookie }, body: form({ _csrf: csrf, status: 'in_progress', note: 'Созвонились' }),
  });
  assert.equal(res.status, 303);
  assert.equal((await ctx.store.listLeads())[0].status, 'in_progress');

  const csv = await (await get('/admin/leads.csv', { headers: { cookie } })).text();
  assert.match(csv, /Айгерим/);
  assert.match(csv, /В работе/);
});

test('настройки сайта меняют тексты на главной', async () => {
  const { cookie, csrf } = await login();
  const res = await get('/admin/settings', {
    method: 'POST',
    headers: { cookie },
    body: form({ _csrf: csrf, site_name: 'CC Lab', hero_title: 'Новый заголовок лаборатории', contact_telegram: '@cclab', timezone: 'Asia/Almaty', currency: '₸' }),
  });
  assert.equal(res.status, 303);
  const home = await (await get('/')).text();
  assert.match(home, /Новый заголовок лаборатории/);
  assert.match(home, /https:\/\/t\.me\/cclab/);

  const badTz = await get('/admin/settings', { method: 'POST', headers: { cookie }, body: form({ _csrf: csrf, timezone: 'Mars/Base' }) });
  assert.equal(badTz.status, 422);
});

test('демо-данные удаляются одной кнопкой', async () => {
  const { cookie, csrf } = await login();
  assert.ok((await ctx.store.countProducts()).demo > 0);
  const res = await get('/admin/demo/delete', { method: 'POST', headers: { cookie }, body: form({ _csrf: csrf }) });
  assert.equal(res.status, 303);
  assert.equal((await ctx.store.countProducts()).demo, 0);
  // созданная вручную разработка осталась
  assert.ok((await ctx.store.listAllProducts()).some((p) => p.title === 'Шахматы для начальной школы'));
});

test('выход завершает сессию', async () => {
  const { cookie, csrf } = await login();
  await get('/admin/logout', { method: 'POST', headers: { cookie }, body: form({ _csrf: csrf }) });
  assert.equal((await get('/admin', { headers: { cookie } })).status, 302);
});

test('утилиты: транслитерация, цены, программа, теги', () => {
  assert.equal(slugify('Робототехника: от LEGO до Arduino'), 'robototehnika-ot-lego-do-arduino');
  assert.equal(slugify('Қазақ тілі және әдебиет'), 'qazaq-tili-zhane-adebiet');
  assert.equal(parsePrice('150 000 ₸'), 150000);
  assert.equal(parsePrice(''), null);
  assert.deepEqual(modules('Механика — рычаги\nПроект'), [
    { title: 'Механика', text: 'рычаги' },
    { title: 'Проект', text: '' },
  ]);
  assert.equal(normalizeTags('Python, python;  Arduino '), 'python,arduino');
});

test('Markdown не пропускает HTML и javascript-ссылки', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://cclab.kz)');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /href="https:\/\/cclab\.kz"/);
});
