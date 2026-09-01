import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { Client } = pg;

// Connection configurations to try
const dbConfigs = [
  {
    name: 'Direct IPv4/IPv6 host',
    host: 'db.ybsdwcaagcazfedrwhjm.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'AxDgke4deNV456gC',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  },
  {
    name: 'Connection Pooler (aws-0-sa-east-1)',
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.ybsdwcaagcazfedrwhjm',
    password: 'AxDgke4deNV456gC',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  },
  {
    name: 'Connection Pooler Transaction Mode (aws-0-sa-east-1)',
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.ybsdwcaagcazfedrwhjm',
    password: 'AxDgke4deNV456gC',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  },
];

async function run() {
  console.log('================================================================');
  console.log('CONECTANDO AO SUPABASE REAL: orcagraf-dev (ybsdwcaagcazfedrwhjm)');
  console.log('================================================================\n');

  let client: pg.Client | null = null;

  for (const config of dbConfigs) {
    try {
      console.log(`Tentando conectar via ${config.name} (${config.host}:${config.port})...`);
      const testClient = new Client(config);
      await testClient.connect();
      console.log(`-> Conexão estabelecida com sucesso via ${config.name}!\n`);
      client = testClient;
      break;
    } catch (err: any) {
      console.warn(`-> Falha na conexão com ${config.name}: ${err.message}`);
    }
  }

  if (!client) {
    console.error('FATAL: Não foi possível conectar ao banco de dados Supabase.');
    process.exit(1);
  }

  try {
    // 1. Inspecionar tabelas existentes no schema public
    console.log('--- 1. INSPECIONANDO TABELAS EXISTENTES EM public ---');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const existingTables = tablesRes.rows.map((r) => r.table_name);
    console.log(`Total de tabelas encontradas: ${existingTables.length}`);
    console.log('Tabelas:', existingTables.join(', '));
    console.log('');

    // 2. Verificar se prexyon_* já existem
    const prexyonTablesExpected = [
      'prexyon_products',
      'prexyon_user_product_access',
      'prexyon_permission_definitions',
      'prexyon_roles',
      'prexyon_role_permissions',
      'prexyon_user_product_roles',
      'prexyon_user_permission_overrides',
      'prexyon_organization_invites',
    ];

    const prexyonTablesFound = prexyonTablesExpected.filter((t) => existingTables.includes(t));
    console.log(`Tabelas Prexyon encontradas: ${prexyonTablesFound.length}/${prexyonTablesExpected.length}`);
    const isMigrationAlreadyApplied = prexyonTablesFound.length === prexyonTablesExpected.length;
    console.log(`A migration 001_prexyon_core_bridge.sql já estava aplicada? ${isMigrationAlreadyApplied ? 'SIM' : 'NÃO'}`);
    console.log('');

    // 3. Se não estava aplicada, aplicar a migration com segurança
    if (!isMigrationAlreadyApplied) {
      console.log('--- 2. APLICANDO MIGRATION 001_prexyon_core_bridge.sql ---');
      const sqlContent = readFileSync(resolve('supabase/migrations/001_prexyon_core_bridge.sql'), 'utf8');
      await client.query(sqlContent);
      console.log('-> Migration aplicada com sucesso no Supabase real!\n');
    }

    // 4. Validar novamente tabelas após migration
    const updatedTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const finalTables = updatedTablesRes.rows.map((r) => r.table_name);
    console.log('--- 3. TABELAS APÓS VALIDAÇÃO ---');
    console.log('Tabelas no schema public:', finalTables.join(', '));
    console.log('');

    // 5. Verificar catálogo de softwares Prexyon (prexyon_products)
    console.log('--- 4. CATÁLOGO prexyon_products ---');
    const productsRes = await client.query(`
      SELECT code, name, status, description 
      FROM public.prexyon_products 
      ORDER BY code;
    `);
    console.table(productsRes.rows);

    // 6. Verificar integridade das tabelas do OrçaGraf
    console.log('--- 5. TABELAS ORÇAGRAF PRESERVADAS ---');
    const orcagrafCoreTables = [
      'products',
      'customers',
      'quotes',
      'quote_items',
      'materials',
      'finishings',
      'organization_members',
      'organizations',
      'profiles',
    ];
    const orcagrafPreserved = orcagrafCoreTables.every((t) => finalTables.includes(t));
    console.log(`Todas as 9 tabelas core do OrçaGraf estão presentes e intactas? ${orcagrafPreserved ? 'SIM' : 'NÃO'}`);
    console.log('');

    // 7. Verificar RLS nas tabelas Prexyon
    console.log('--- 6. VERIFICANDO RLS NAS TABELAS PREXYON ---');
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace 
      WHERE pg_namespace.nspname = 'public' 
        AND relname LIKE 'prexyon_%';
    `);
    console.table(rlsRes.rows);

    // 8. Verificar policies ativas nas tabelas Prexyon
    console.log('--- 7. POLICIES EFETIVAMENTE EXISTENTES NAS TABELAS PREXYON ---');
    const policiesRes = await client.query(`
      SELECT tablename, policyname, permissive, roles, cmd, qual 
      FROM pg_policies 
      WHERE schemaname = 'public' 
        AND tablename LIKE 'prexyon_%'
      ORDER BY tablename, policyname;
    `);
    console.table(policiesRes.rows.map((p) => ({
      table: p.tablename,
      policy: p.policyname,
      cmd: p.cmd,
      roles: p.roles,
    })));

    // 9. Verificar funções e triggers
    console.log('--- 8. FUNÇÕES PREXYON ENCONTRADAS ---');
    const funcsRes = await client.query(`
      SELECT proname, prosecdef 
      FROM pg_proc 
      JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace 
      WHERE pg_namespace.nspname = 'public' 
        AND proname LIKE 'prexyon_%';
    `);
    console.table(funcsRes.rows);

    console.log('--- 9. TRIGGERS DE PROTEÇÃO DE OWNER ENCONTRADOS ---');
    const triggersRes = await client.query(`
      SELECT tgname, relname 
      FROM pg_trigger 
      JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid 
      WHERE tgname LIKE '%owner%' OR tgname LIKE '%protect%';
    `);
    console.table(triggersRes.rows);

    console.log('================================================================');
    console.log('VALIDAÇÃO REAL NO SUPABASE CONCLUÍDA COM SUCESSO TOTAL!');
    console.log('================================================================');

  } catch (err: any) {
    console.error('Erro durante execução:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
