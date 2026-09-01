import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { Client } = pg;

async function applySsoMigration() {
  console.log('Aplicando migration 002_prexyon_sso_codes.sql no Supabase real...');

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
    const sql = readFileSync(resolve('supabase/migrations/002_prexyon_sso_codes.sql'), 'utf8');
    await client.query(sql);
    console.log('-> Migration 002_prexyon_sso_codes.sql aplicada com sucesso!');

    // Check table and functions
    const tableRes = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'prexyon_sso_codes';
    `);
    console.log('Tabela prexyon_sso_codes criada:', tableRes.rows.length > 0);

    const funcsRes = await client.query(`
      SELECT proname FROM pg_proc 
      JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace 
      WHERE pg_namespace.nspname = 'public' AND proname LIKE 'prexyon_%sso%';
    `);
    console.log('Funções SSO criadas:', funcsRes.rows.map((r) => r.proname));
  } catch (err: any) {
    console.error('Erro ao aplicar migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applySsoMigration();
