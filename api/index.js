// Точка входа для Vercel: всё, кроме статики из public/, обрабатывает Express-приложение.
import { createApp } from '../src/app.js';

let ready;

export default async function handler(req, res) {
  ready ??= createApp().catch((err) => {
    ready = undefined; // следующий запрос попробует подключиться заново
    throw err;
  });
  const { app } = await ready;
  return app(req, res);
}
