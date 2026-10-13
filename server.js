import { createApp } from './src/app.js';

const { app, config, db } = await createApp();

const server = app.listen(config.port, () => {
  console.log(`CC Lab запущен: http://localhost:${config.port}  (админка: /admin)`);
});

function shutdown() {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
