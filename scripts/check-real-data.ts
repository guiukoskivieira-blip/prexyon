import pg from 'pg';

const { Client } = pg;

async function checkAnonKey() {
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
    // Check if there are auth users or settings
    const usersCount = await client.query('SELECT count(*) FROM auth.users;');
    console.log('Total auth.users no Supabase real:', usersCount.rows[0].count);

    // List any existing organizations in public.organizations
    const orgsRes = await client.query('SELECT id, trade_name, corporate_name, document, is_active FROM public.organizations LIMIT 5;');
    console.log('Organizações existentes no OrçaGraf:', orgsRes.rows);

    // List any existing members
    const membersRes = await client.query('SELECT id, organization_id, user_id, role, is_active FROM public.organization_members LIMIT 5;');
    console.log('Membros existentes:', membersRes.rows);
  } catch (err: any) {
    console.error('Erro:', err.message);
  } finally {
    await client.end();
  }
}

checkAnonKey();
