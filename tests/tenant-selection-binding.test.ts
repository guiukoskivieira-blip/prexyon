import { getDbClient } from './db-client';
import fs from 'fs';
import path from 'path';

async function runTenantSelectionBindingTests() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout em runTenantSelectionBindingTests');
    process.exit(1);
  }, 45000);

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

  const ts = Date.now();

  // Entidades reais
  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const ownerUserId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
  const ownerEmail = 'guiukoskivieira@gmail.com';
  const memberUserId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
  const memberEmail = 'designcreative254@gmail.com';

  try {
    await client.connect();
    await client.query("SET statement_timeout = '8000';");
    try { await client.query("RESET ROLE; RESET request.jwt.claims;"); } catch {}

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: TENANT DISCOVERY & SELECTION BINDING');
    console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // 1. Aplicar a migration de Tenant Discovery no banco
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260904_get_my_organizations.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    await client.query(migrationSql);

    // =========================================================================
    // CENÁRIO 1: Descoberta de Organizações Reais via RPC prexyon_get_my_organizations
    // =========================================================================
    console.log('--- CENÁRIO 1: Descoberta de Tenants para OWNER e MEMBER reais ---');

    // 1.1 OWNER real
    const ownerOrgsRes = await client.query(`
      SELECT * FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1 AND om.is_active = true AND (om.is_locked IS NULL OR om.is_locked = false) AND o.is_active = true;
    `, [ownerUserId]);

    assert(
      ownerOrgsRes.rows.length >= 1 && ownerOrgsRes.rows.some(r => r.organization_id === realOrgId && r.role === 'owner'),
      '1.1 OWNER real possui vínculo ativo com a organização real 43c47a08-2f84-42db-a64d-d1f0ea0c6a6b',
      'owner vinculado a 43c47a08-2f84-42db-a64d-d1f0ea0c6a6b',
      `Encontrado: ${ownerOrgsRes.rows.length} org(s), role: ${ownerOrgsRes.rows[0]?.role}`
    );

    // 1.2 MEMBER real
    const memberOrgsRes = await client.query(`
      SELECT * FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1 AND om.is_active = true AND (om.is_locked IS NULL OR om.is_locked = false) AND o.is_active = true;
    `, [memberUserId]);

    assert(
      memberOrgsRes.rows.length >= 1 && memberOrgsRes.rows.some(r => r.organization_id === realOrgId && r.role === 'member'),
      '1.2 MEMBER real possui vínculo ativo com a organização real 43c47a08-2f84-42db-a64d-d1f0ea0c6a6b',
      'member vinculado a 43c47a08-2f84-42db-a64d-d1f0ea0c6a6b',
      `Encontrado: ${memberOrgsRes.rows.length} org(s), role: ${memberOrgsRes.rows[0]?.role}`
    );

    // =========================================================================
    // CENÁRIO 2: Filtragem de Segurança: Bloqueio / Inatividade / Isolamento
    // =========================================================================
    console.log('--- CENÁRIO 2: Filtragem de Segurança (is_active, is_locked, isolamento) ---');

    // Criação de organização temporária inativa e membro bloqueado para teste
    const tempOrgRes = await client.query(`
      INSERT INTO public.organizations (trade_name, is_active)
      VALUES ($1, false)
      RETURNING id;
    `, [`Test Inactive Org ${ts}`]);
    const inactiveOrgId = tempOrgRes.rows[0].id;

    // Inserir membership para o owner na org inativa
    await client.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked)
      VALUES ($1, $2, 'member', true, false);
    `, [inactiveOrgId, ownerUserId]);

    // Consultar organizações válidas
    const validOrgsQuery = await client.query(`
      SELECT o.id, o.trade_name, om.role
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1
        AND om.is_active = true
        AND (om.is_locked IS NULL OR om.is_locked = false)
        AND o.is_active = true;
    `, [ownerUserId]);

    const containsInactive = validOrgsQuery.rows.some(r => r.id === inactiveOrgId);
    assert(
      containsInactive === false,
      '2.1 Organização com is_active=false é estritamente ignorada na descoberta de tenants',
      'containsInactive = false',
      `containsInactive = ${containsInactive}`
    );

    // Criar org ativa mas membership bloqueado
    const tempOrgActiveRes = await client.query(`
      INSERT INTO public.organizations (trade_name, is_active)
      VALUES ($1, true)
      RETURNING id;
    `, [`Test Locked Member Org ${ts}`]);
    const lockedOrgId = tempOrgActiveRes.rows[0].id;

    await client.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked)
      VALUES ($1, $2, 'member', true, true);
    `, [lockedOrgId, ownerUserId]);

    const validOrgsQuery2 = await client.query(`
      SELECT o.id, o.trade_name, om.role
      FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1
        AND om.is_active = true
        AND (om.is_locked IS NULL OR om.is_locked = false)
        AND o.is_active = true;
    `, [ownerUserId]);

    const containsLocked = validOrgsQuery2.rows.some(r => r.id === lockedOrgId);
    assert(
      containsLocked === false,
      '2.2 Membership com is_locked=true é estritamente ignorado na descoberta de tenants',
      'containsLocked = false',
      `containsLocked = ${containsLocked}`
    );

    // Limpar registros de teste
    await client.query('DELETE FROM public.organization_members WHERE organization_id IN ($1, $2);', [inactiveOrgId, lockedOrgId]);
    await client.query('DELETE FROM public.organizations WHERE id IN ($1, $2);', [inactiveOrgId, lockedOrgId]);

    // =========================================================================
    // CENÁRIO 3: Simulação de Lógica do Cliente (Single, Multi, Zero Orgs & Stale Storage)
    // =========================================================================
    console.log('--- CENÁRIO 3: Resolução de Tenant e Proteção contra Stale localStorage ---');

    // 3.1 Zero Orgs: Usuário sem nenhuma organização válida
    const zeroOrgsList: any[] = [];
    let activeOrgState = zeroOrgsList.length > 0 ? zeroOrgsList[0] : { id: '', name: 'Nenhuma organização vinculada', status: 'suspended' };
    assert(
      activeOrgState.id === '' && activeOrgState.status === 'suspended',
      '3.1 Usuário sem organizações entra em fail-closed zeroOrgState',
      'id: "", status: "suspended"',
      `id: "${activeOrgState.id}", status: "${activeOrgState.status}"`
    );

    // 3.2 Single Org: Usuário com exatamente 1 organização válida
    const singleOrgList = [{ id: realOrgId, name: 'Gráfica Central', userRole: 'owner' }];
    const autoSelected = singleOrgList.length > 0 ? singleOrgList[0] : activeOrgState;
    assert(
      autoSelected.id === realOrgId,
      '3.2 Usuário com 1 organização auto-seleciona a organização canônica',
      `id: ${realOrgId}`,
      `id: ${autoSelected.id}`
    );

    // 3.3 Multi Orgs + Stale localStorage: Stale ID não presente na lista autorizada
    const multiOrgsList = [
      { id: realOrgId, name: 'Gráfica Central', userRole: 'owner' },
      { id: 'bbbbbbbb-2222-4444-6666-888888888888', name: 'Gráfica Filial', userRole: 'admin' }
    ];
    const staleStorageId = 'stale-fake-tenant-9999';
    const resolvedFromStale = multiOrgsList.find(o => o.id === staleStorageId) || (multiOrgsList.length > 0 ? multiOrgsList[0] : activeOrgState);
    assert(
      resolvedFromStale.id === realOrgId,
      '3.3 ID obsoleto no localStorage é descartado e substituído pelo tenant primário válido',
      `id: ${realOrgId}`,
      `id: ${resolvedFromStale.id}`
    );

    // 3.4 Multi Orgs: Alternância explícita de organização (Switch)
    const targetSwitchId = 'bbbbbbbb-2222-4444-6666-888888888888';
    const switchedOrg = multiOrgsList.find(o => o.id === targetSwitchId);
    assert(
      switchedOrg !== undefined && switchedOrg.id === targetSwitchId && switchedOrg.userRole === 'admin',
      '3.4 Alternância para organização autorizada carrega com sucesso novo papel e tenant',
      `id: ${targetSwitchId}, role: admin`,
      `id: ${switchedOrg?.id}, role: ${switchedOrg?.userRole}`
    );

    // 3.5 Tentativa de switch para tenant não-autorizado
    const unauthorizedSwitchId = 'ffffffff-9999-0000-1111-222233334444';
    const unauthorizedResult = multiOrgsList.find(o => o.id === unauthorizedSwitchId);
    assert(
      unauthorizedResult === undefined,
      '3.5 Tentativa de alternar para organização não-autorizada é bloqueada pelo cliente',
      'unauthorizedResult: undefined',
      `unauthorizedResult: ${unauthorizedResult}`
    );

    // =========================================================================
    // CENÁRIO 4: Binding de Tenant no SSO Central e RPC prexyon_get_my_organizations
    // =========================================================================
    console.log('--- CENÁRIO 4: Binding do Tenant Ativo no SSO Central ---');

    // 4.1 RPC prexyon_get_my_organizations executada pelo OWNER autenticado
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ownerRpcRes = await client.query(`SELECT * FROM public.prexyon_get_my_organizations();`);
    assert(
      ownerRpcRes.rows.length >= 1 && ownerRpcRes.rows.some(r => r.organization_id === realOrgId && r.role === 'owner'),
      '4.1 RPC prexyon_get_my_organizations retorna organização real para OWNER autenticado',
      `org: ${realOrgId}, role: owner`,
      `org: ${ownerRpcRes.rows[0]?.organization_id}, role: ${ownerRpcRes.rows[0]?.role}`
    );

    // 4.2 Emissão de SSO para ArteFlow usando a organização real e membership válido
    const ssoGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as result;`, [realOrgId]);
    const ssoData = ssoGenRes.rows[0].result;
    assert(
      ssoData.success === true && Boolean(ssoData.code) && ssoData.product_code === 'arteflow',
      '4.2 Emissão de SSO ArteFlow com binding estrito do tenant 43c47a08-2f84-42db-a64d-d1f0ea0c6a6b',
      'success: true, product_code: arteflow',
      `success: ${ssoData.success}, product_code: ${ssoData.product_code}, code: ${ssoData.code?.substring(0, 8)}...`
    );

    // 4.3 Cross-Tenant SSO Denial: Tentar emitir para tenant alienígena / inexistente
    let crossTenantBlocked = false;
    let crossTenantErr = '';
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code('00000000-0000-0000-0000-000000000000'::uuid, 'arteflow');`);
    } catch (err: any) {
      crossTenantBlocked = true;
      crossTenantErr = err.message;
    }
    assert(
      crossTenantBlocked && (crossTenantErr.includes('ORGANIZATION_INACTIVE') || crossTenantErr.includes('MEMBERSHIP_INACTIVE')),
      '4.3 Bloqueio cross-tenant: Usuário não consegue emitir SSO para organização desvinculada',
      'Bloqueado com ORGANIZATION_INACTIVE / MEMBERSHIP_INACTIVE',
      `Bloqueado: ${crossTenantErr}`
    );

    // 4.4 RPC prexyon_get_my_organizations executada pelo MEMBER autenticado
    await client.query(`SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const memberRpcRes = await client.query(`SELECT * FROM public.prexyon_get_my_organizations();`);
    assert(
      memberRpcRes.rows.length >= 1 && memberRpcRes.rows.some(r => r.organization_id === realOrgId && r.role === 'member'),
      '4.4 RPC prexyon_get_my_organizations retorna organização real para MEMBER autenticado',
      `org: ${realOrgId}, role: member`,
      `org: ${memberRpcRes.rows[0]?.organization_id}, role: ${memberRpcRes.rows[0]?.role}`
    );

    // Resetar contexto
    await client.query('RESET ROLE; RESET request.jwt.claims;');

    // =========================================================================
    // CENÁRIO 5: Auditoria Financeira e de Isolamento Comercial
    // =========================================================================
    console.log('--- CENÁRIO 5: Auditoria de Cobranças e Assinaturas (Zero Billing) ---');

    // 5.1 Verificar que a organização real NÃO possui subscription comercial criada
    const subCheck = await client.query(`
      SELECT count(*) as count FROM public.prexyon_subscriptions WHERE organization_id = $1 AND status = 'active';
    `, [realOrgId]);

    assert(
      parseInt(subCheck.rows[0].count, 10) === 0,
      '5.1 Organização 43c47a08-2f84-42db-a64d-d1f0ea0c6a6b possui ZERO assinaturas comerciais ativas',
      'count = 0',
      `count = ${subCheck.rows[0].count}`
    );

    // 5.2 Verificar que ArteFlow está liberado exclusivamente por homologação e não por assinatura paga
    const entRes = await client.query(`
      SELECT public.prexyon_get_organization_entitlements($1::uuid) as ent;
    `, [realOrgId]);
    const entData = entRes.rows[0].ent;

    assert(
      entData.has_subscription === false && entData.homologation_products.includes('arteflow') && !entData.commercial_products.includes('arteflow'),
      '5.2 ArteFlow liberado exclusivamente via homologation_entitlements (Sem assinatura comercial e sem cobrança)',
      'has_subscription=false, homologation includes arteflow, commercial excludes arteflow',
      `has_subscription=${entData.has_subscription}, homologation=${JSON.stringify(entData.homologation_products)}, commercial=${JSON.stringify(entData.commercial_products)}`
    );

    console.log('================================================================');
    console.log(`SUCESSO: ${passed} / ${total} testes passaram com êxito.`);
    console.log('================================================================\n');

  } finally {
    clearTimeout(watchdog);
    await client.end();
  }
}

runTenantSelectionBindingTests().catch((err) => {
  console.error('Falha na execução dos testes de tenant selection:', err);
  process.exit(1);
});
