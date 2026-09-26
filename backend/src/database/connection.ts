import { MongoClient, ServerApiVersion, type Db } from 'mongodb';

let client: MongoClient | undefined;
let database: Db | undefined;
export async function connectDatabase() {
  if (database) return database;
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri || uri.includes('<db_password>'))
    throw new Error('Thiếu MONGODB_URI hoặc mật khẩu trong backend/.env.');
  client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  try {
    await client.connect();
    const connected = client.db(process.env.MONGODB_DB_NAME || 'ai_exam_quiz');
    await connected.command({ ping: 1 });
    database = connected;
    return database;
  } catch {
    await closeDatabase();
    throw new Error(
      'Không thể kết nối MongoDB. Kiểm tra credentials, mạng và Atlas IP Access List.',
    );
  }
}
export async function closeDatabase() {
  const current = client;
  client = undefined;
  database = undefined;
  await current?.close();
}
