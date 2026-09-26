import { connectDatabase, closeDatabase } from './database/connection.js';
import { ensureIndexes } from './database/indexes.js';
import { loadConfig } from './common/config.js';
import { createApp } from './app.js';
import { startExamClock } from './common/exam-runtime.js';

try {
  const config = loadConfig();
  const db = await connectDatabase();
  await ensureIndexes(db);
  const stopExamClock = startExamClock(db);
  const port = Number(process.env.PORT || 8080);
  const server = createApp(db, config).listen(port, () =>
    console.log(`QuizSpace API http://localhost:${port} • MongoDB connected`),
  );
  server.on('error', async () => {
    console.error('Không thể mở cổng HTTP.');
    await closeDatabase();
    process.exit(1);
  });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      stopExamClock();
      const timeout = setTimeout(() => process.exit(1), 10000).unref();
      server.close(async () => {
        await closeDatabase();
        clearTimeout(timeout);
        process.exit(0);
      });
    });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Không thể khởi động backend.');
  await closeDatabase();
  process.exitCode = 1;
}
