import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Carrega .env nativamente se disponível
if (typeof process.loadEnvFile === 'function') {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // ignore
    }
  }
}

export function getDbClient() {
  return new pg.Client({
    host: process.env.SUPABASE_DB_HOST || 'aws-0-sa-east-1.pooler.supabase.com',
    port: parseInt(process.env.SUPABASE_DB_PORT || '6543', 10),
    user: process.env.SUPABASE_DB_USER || 'postgres.ybsdwcaagcazfedrwhjm',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
}
