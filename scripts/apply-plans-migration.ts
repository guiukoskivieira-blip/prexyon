import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { Client } = pg;

async function applyPlansMigration() {
  console.log('Aplicando migration 003_prexyon_plans_and_entitlements.sql no Supabase real...');

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
    const sql = readFileSync(resolve('supabase/migrations/003_prexyon_plans_and_entitlements.sql'), 'utf8');
    await client.query(sql);
    console.log('-> Migration 003_prexyon_plans_and_entitlements.sql aplicada com sucesso!');

    // Check plans
    const plansRes = await client.query(`
      SELECT code, name, monthly_price_cents, annual_price_cents, included_users, is_featured 
      FROM public.prexyon_plans 
      ORDER BY display_order;
    `);
    console.table(plansRes.rows);

    // Check plan products
    const prodsRes = await client.query(`
      SELECT p.code as plan_code, pp.product_code 
      FROM public.prexyon_plan_products pp
      JOIN public.prexyon_plans p ON p.id = pp.plan_id
      ORDER BY p.display_order, pp.product_code;
    `);
    console.table(prodsRes.rows);
  } catch (err: any) {
    console.error('Erro ao aplicar migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyPlansMigration();
