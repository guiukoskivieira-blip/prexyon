import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { Client } = pg;

async function applyBillingMigration() {
  console.log('Aplicando migration 004_prexyon_billing.sql no Supabase real...');

  const client = new Client({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.ybsdwcaagcazfedrwhjm',
    password: 'AxDgke4deNV456gC',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const sql = readFileSync(resolve('supabase/migrations/004_prexyon_billing.sql'), 'utf8');
    await client.query(sql);
    console.log('-> Migration 004_prexyon_billing.sql aplicada com sucesso!');

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'prexyon_%'
      ORDER BY table_name;
    `);
    console.log('Tabelas Prexyon no Supabase:');
    console.table(tablesRes.rows);
  } catch (err: any) {
    console.error('Erro ao aplicar migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyBillingMigration();
