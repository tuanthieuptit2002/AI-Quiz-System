import { connectDatabase, closeDatabase } from '../src/database/connection.js';
try {
  await connectDatabase();
  console.log('MongoDB connected. Ping OK.');
} catch {
  console.error('Không thể kết nối MongoDB. Kiểm tra .env và Atlas Network Access.');
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
