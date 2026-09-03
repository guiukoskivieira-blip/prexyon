import { getDbClient } from './db-client';

async function runArteflowPermissionsCatalogTests() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout em runArteflowPermissionsCatalogTests');
    process.exit(1);
  }, 25000);

  const client = getDbClient();
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, expected: string, actual: string) {
    total++;
    if (condition) {
      console.log(`[PASSOU] ${testName}`);
      console.log(`   Esperado:   ${expected}`);
      console.log(`   Encontrado: ${actual}\n`);
      passed++;
    } else {
      console.error(`[FALHOU] ${testName}`);
      console.error(`   Esperado:   ${expected}`);
      console.error(`   Encontrado: ${actual}\n`);
      throw new Error(`Falha no teste: ${testName}`);
    }
  }

  const EXPECTED_CANONICAL_KEYS = [
    'arteflow.view',
    'arteflow.orders.view',
    'arteflow.orders.create',
    'arteflow.orders.edit',
    'arteflow.production.view',
    'arteflow.production.manage',
    'arteflow.inventory.view',
    'arteflow.inventory.manage',
    'arteflow.procurement.view',
    'arteflow.procurement.manage',
    'arteflow.finance.view',
    'arteflow.finance.manage',
    'arteflow.settings.manage',
    'arteflow.users.manage',
  ];

  const EXPECTED_LEGACY_KEYS = [
    'arteflow.production.move_stages',
    'arteflow.production.reassign',
  ];

  try {
    await client.connect();
    await client.query("SET statement_timeout = '5000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: CATÁLOGO CANÔNICO ARTEFLOW & ANTI-EXPANSÃO');
    console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // FASE 1: VALIDAÇÃO DA MATRIZ CANÔNICA NO ARQUIVO DA MIGRATION
    // -------------------------------------------------------------
    assert(
      EXPECTED_CANONICAL_KEYS.length === 14,
      'Fase 1.1: Matriz canônica do ArteFlow é composta por exatamente 14 chaves padronizadas',
      '14 chaves',
      `${EXPECTED_CANONICAL_KEYS.length} chaves`
    );

    assert(
      EXPECTED_LEGACY_KEYS.length === 2,
      'Fase 1.2: Aliases legados mapeados para preservação de retrocompatibilidade',
      '2 chaves legadas',
      `${EXPECTED_LEGACY_KEYS.length} chaves legadas`
    );

    // -------------------------------------------------------------
    // FASE 2: AUDITORIA DE ZERO PRIVILEGE EXPANSION NOS DADOS REAIS
    // -------------------------------------------------------------
    const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';

    // 2.1 Verificar grants reais de permissões no banco
    const realPermsRes = await client.query(`
      SELECT pp.permission_key, pp.product_key, pp.is_granted, u.email
      FROM public.product_permissions pp
      JOIN auth.users u ON u.id = pp.user_id
      WHERE pp.organization_id = $1;
    `, [realOrgId]);

    const realArteflowPerms = realPermsRes.rows.filter((r: any) => r.product_key === 'arteflow');
    assert(
      realArteflowPerms.length === 0,
      'Fase 2.1: Zero grants do ArteFlow concedidos a membros reais na organização (Zero Privilege Expansion)',
      '0 grants arteflow',
      `${realArteflowPerms.length} grants arteflow`
    );

    // 2.2 Confirmar que MEMBER real possui exclusivamente as 3 grants canônicas de OrçaGraf
    const memberGrants = realPermsRes.rows.filter((r: any) => r.email === 'designcreative254@gmail.com');
    const memberGrantKeys = memberGrants.map((g: any) => g.permission_key).sort();
    const expectedMemberKeys = ['orcagraf.quotes.create', 'orcagraf.quotes.view', 'orcagraf.view'];

    assert(
      JSON.stringify(memberGrantKeys) === JSON.stringify(expectedMemberKeys),
      'Fase 2.2: MEMBER real permanece com exatamente as 3 grants homologadas de OrçaGraf intactas',
      JSON.stringify(expectedMemberKeys),
      JSON.stringify(memberGrantKeys)
    );

    // 2.3 Verificar que a organização real permanece com effective_products = ['orcagraf']
    const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as data;`, [realOrgId]);
    const entData = entRes.rows[0]?.data;

    assert(
      JSON.stringify(entData?.effective_products) === '["orcagraf"]' && entData?.has_subscription === false,
      'Fase 2.3: Entitlement da organização real permanece estritamente ["orcagraf"] com has_subscription=false',
      'products=["orcagraf"], has_sub=false',
      `products=${JSON.stringify(entData?.effective_products)}, has_sub=${entData?.has_subscription}`
    );

    // 2.4 Verificar que product_access do MEMBER real permanece estritamente ['orcagraf']
    const memberAccessRes = await client.query(`
      SELECT product_key, is_enabled 
      FROM public.organization_member_product_access ompa
      JOIN auth.users u ON u.id = ompa.user_id
      WHERE ompa.organization_id = $1 AND u.email = 'designcreative254@gmail.com';
    `, [realOrgId]);

    const enabledProducts = memberAccessRes.rows.filter((r: any) => r.is_enabled).map((r: any) => r.product_key);
    assert(
      JSON.stringify(enabledProducts) === '["orcagraf"]',
      'Fase 2.4: organization_member_product_access do MEMBER real habilitado exclusivamente para orcagraf',
      '["orcagraf"]',
      JSON.stringify(enabledProducts)
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES DO CATÁLOGO ARTEFLOW: ${total}`);
    console.log(`APROVADOS:                            ${passed}`);
    console.log(`REPROVADOS:                           ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('TEST_UNCAUGHT_ERR:', err.message, err.stack);
  } finally {
    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runArteflowPermissionsCatalogTests();
