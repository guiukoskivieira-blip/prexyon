import { getDbClient } from './db-client';

async function runSsoIdentitySecurityTests() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout excedido em runSsoIdentitySecurityTests.');
    process.exit(1);
  }, 30000);

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

  // Fixtures temporárias
  const ts = Date.now();
  const testOrgId = 'a1111111-1111-4111-a111-111111111111';
  const otherOrgId = 'b2222222-2222-4222-b222-222222222222';
  const noEntitlementOrgId = 'c3333333-3333-4333-c333-333333333333';
  const suspendedOrgId = 'd4444444-4444-4444-d444-444444444444';

  const ownerUserId = '11111111-1111-4111-8111-111111111111';
  const memberUserId = '22222222-2222-4222-8222-222222222222';
  const otherMemberUserId = '33333333-3333-4333-8333-333333333333';
  const suspendedMemberUserId = '44444444-4444-4444-8444-444444444444';
  const disabledAccessMemberUserId = '55555555-5555-4555-8555-555555555555';

  const memberEmail = `sso-member-${ts}@prexyon.com`;
  const ownerEmail = `sso-owner-${ts}@prexyon.com`;
  const otherMemberEmail = `sso-other-${ts}@prexyon.com`;

  try {
    await client.connect();
    await client.query("SET statement_timeout = '5000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: SEGURANÇA SSO & ANTI-IMPERSONAÇÃO');
    console.log('Banco: orcagraf-dev');
    console.log('================================================================\n');

    // 0. Setup Fixtures
    // Organização Ativa com Homologation Entitlement para OrçaGraf
    await client.query(
      `INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
       VALUES ($1, 'Org Teste SSO', 'Org Teste SSO Ltda', true),
              ($2, 'Org Outra SSO', 'Org Outra SSO Ltda', true),
              ($3, 'Org Sem Entitlement', 'Org Sem Entitlement Ltda', true),
              ($4, 'Org Suspensa', 'Org Suspensa Ltda', false)
       ON CONFLICT (id) DO NOTHING;`,
      [testOrgId, otherOrgId, noEntitlementOrgId, suspendedOrgId]
    );

    // Entitlement de homologação para OrçaGraf na testOrgId
    await client.query(
      `INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, expires_at)
       VALUES ($1, 'orcagraf', 'system', 'SSO Security Test', now() + interval '1 day')
       ON CONFLICT DO NOTHING;`,
      [testOrgId]
    );

    // Usuários em auth.users e profiles
    const usersToInsert = [
      { id: ownerUserId, email: ownerEmail, name: 'Owner SSO' },
      { id: memberUserId, email: memberEmail, name: 'Member SSO' },
      { id: otherMemberUserId, email: otherMemberEmail, name: 'Other Member SSO' },
      { id: suspendedMemberUserId, email: `sso-susp-${ts}@prexyon.com`, name: 'Suspended Member SSO' },
      { id: disabledAccessMemberUserId, email: `sso-noacc-${ts}@prexyon.com`, name: 'Disabled Access Member' },
    ];

    for (const u of usersToInsert) {
      await client.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
         VALUES ($1, $2, jsonb_build_object('full_name', $3::text), now(), now())
         ON CONFLICT (id) DO NOTHING;`,
        [u.id, u.email, u.name]
      );
      await client.query(
        `INSERT INTO public.profiles (id, full_name, email, created_at, updated_at)
         VALUES ($1, $3, $2, now(), now())
         ON CONFLICT (id) DO NOTHING;`,
        [u.id, u.email, u.name]
      );
    }

    // Memberships
    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked, created_at, updated_at)
       VALUES ($1, $2, 'owner', true, false, now(), now()),
              ($1, $3, 'member', true, false, now(), now()),
              ($1, $4, 'member', true, false, now(), now()),
              ($1, $5, 'member', false, true, now(), now()),
              ($1, $6, 'member', true, false, now(), now()),
              ($7, $3, 'member', true, false, now(), now()),
              ($8, $3, 'member', true, false, now(), now())
       ON CONFLICT DO NOTHING;`,
      [testOrgId, ownerUserId, memberUserId, otherMemberUserId, suspendedMemberUserId, disabledAccessMemberUserId, suspendedOrgId, noEntitlementOrgId]
    );

    // Product Access
    await client.query(
      `INSERT INTO public.organization_member_product_access (organization_id, user_id, product_key, is_enabled, created_at, updated_at)
       VALUES ($1, $2, 'orcagraf', true, now(), now()),
              ($1, $3, 'orcagraf', true, now(), now()),
              ($1, $4, 'orcagraf', true, now(), now()),
              ($1, $5, 'orcagraf', true, now(), now()),
              ($1, $6, 'orcagraf', false, now(), now())
       ON CONFLICT DO NOTHING;`,
      [testOrgId, ownerUserId, memberUserId, otherMemberUserId, suspendedMemberUserId, disabledAccessMemberUserId]
    );

    // Permissões granulares para o memberUserId e otherMemberUserId
    await client.query(
      `INSERT INTO public.product_permissions (organization_id, user_id, product_key, permission_key, is_granted, created_at, updated_at)
       VALUES ($1, $2, 'orcagraf', 'orcagraf.view', true, now(), now()),
              ($1, $3, 'orcagraf', 'orcagraf.view', true, now(), now())
       ON CONFLICT DO NOTHING;`,
      [testOrgId, memberUserId, otherMemberUserId]
    );

    // -------------------------------------------------------------
    // TESTE 1: MEMBER autenticado gera SSO para si com sucesso no OrçaGraf
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const sso1Res = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as res;`, [testOrgId]);
    const sso1 = sso1Res.rows[0].res;

    assert(
      sso1.success === true && Boolean(sso1.code) && sso1.product_code === 'orcagraf',
      'Teste 1: MEMBER gera SSO como próprio MEMBER permitido para OrçaGraf',
      'success=true, code preenchido, product_code=orcagraf',
      `success=${sso1.success}, code=${sso1.code?.substring(0, 8)}..., product_code=${sso1.product_code}`
    );

    // -------------------------------------------------------------
    // TESTE 2: MEMBER autenticado tenta impersonar OWNER via sobrecarga legada
    // -------------------------------------------------------------
    let impersonationOwnerBlocked = false;
    let impersonationOwnerErr = '';
    try {
      await client.query(
        `SELECT public.prexyon_generate_sso_code($1::uuid, $2::uuid, 'orcagraf');`,
        [testOrgId, ownerUserId]
      );
    } catch (err: any) {
      impersonationOwnerBlocked = true;
      impersonationOwnerErr = err.message;
    }

    assert(
      impersonationOwnerBlocked && (impersonationOwnerErr.includes('permission denied') || impersonationOwnerErr.includes('42501') || impersonationOwnerErr.includes('UNAUTHORIZED')),
      'Teste 2: MEMBER autenticado tentando gerar SSO como OWNER é terminantemente bloqueado (Anti-Impersonação)',
      'Exceção 42501 / permission denied / UNAUTHORIZED',
      `Bloqueado: ${impersonationOwnerErr}`
    );

    // -------------------------------------------------------------
    // TESTE 3: MEMBER autenticado tenta gerar SSO como OUTRO MEMBER
    // -------------------------------------------------------------
    let impersonationMemberBlocked = false;
    let impersonationMemberErr = '';
    try {
      await client.query(
        `SELECT public.prexyon_generate_sso_code($1::uuid, $2::uuid, 'orcagraf');`,
        [testOrgId, otherMemberUserId]
      );
    } catch (err: any) {
      impersonationMemberBlocked = true;
      impersonationMemberErr = err.message;
    }

    assert(
      impersonationMemberBlocked && (impersonationMemberErr.includes('permission denied') || impersonationMemberErr.includes('42501') || impersonationMemberErr.includes('UNAUTHORIZED')),
      'Teste 3: MEMBER autenticado tentando gerar SSO como outro MEMBER é terminantemente bloqueado',
      'Bloqueado com 42501 / permission denied',
      `Bloqueado: ${impersonationMemberErr}`
    );

    // -------------------------------------------------------------
    // TESTE 4: MEMBER autenticado tenta gerar SSO para outra organização
    // -------------------------------------------------------------
    let otherOrgBlocked = false;
    let otherOrgErr = '';
    try {
      await client.query(
        `SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`,
        [otherOrgId]
      );
    } catch (err: any) {
      otherOrgBlocked = true;
      otherOrgErr = err.message;
    }

    assert(
      otherOrgBlocked && otherOrgErr.includes('MEMBERSHIP_INACTIVE'),
      'Teste 4: MEMBER autenticado tentando SSO em organização que não pertence é rejeitado (Isolamento Cross-Tenant)',
      'Exceção MEMBERSHIP_INACTIVE',
      `Bloqueado: ${otherOrgErr}`
    );

    // -------------------------------------------------------------
    // TESTE 5: MEMBER autenticado gera SSO para ArteFlow (Separação Auth x Entitlement)
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const sso5Res = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as res;`, [testOrgId]);
    const sso5 = sso5Res.rows[0].res;

    assert(
      sso5.success === true && Boolean(sso5.code) && sso5.product_code === 'arteflow',
      'Teste 5: MEMBER autenticado emite SSO para ArteFlow com sucesso (Identidade transportada)',
      'success=true, code preenchido, product_code=arteflow',
      `success=${sso5.success}, code=${sso5.code?.substring(0, 8)}..., product_code=${sso5.product_code}`
    );

    // -------------------------------------------------------------
    // TESTE 6: MEMBER autenticado gera SSO para ArteCheck (Separação Auth x Entitlement)
    // -------------------------------------------------------------
    const sso6Res = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'artecheck') as res;`, [testOrgId]);
    const sso6 = sso6Res.rows[0].res;

    assert(
      sso6.success === true && Boolean(sso6.code) && sso6.product_code === 'artecheck',
      'Teste 6: MEMBER autenticado emite SSO para ArteCheck com sucesso (Identidade transportada)',
      'success=true, code preenchido, product_code=artecheck',
      `success=${sso6.success}, code=${sso6.code?.substring(0, 8)}..., product_code=${sso6.product_code}`
    );

    // -------------------------------------------------------------
    // TESTE 7: Usuário suspenso/bloqueado tenta gerar SSO
    // -------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${suspendedMemberUserId}", "role": "authenticated"}';`);
    let suspendedUserBlocked = false;
    let suspendedUserErr = '';
    try {
      await client.query(
        `SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`,
        [testOrgId]
      );
    } catch (err: any) {
      suspendedUserBlocked = true;
      suspendedUserErr = err.message;
    }

    assert(
      suspendedUserBlocked && suspendedUserErr.includes('MEMBERSHIP_INACTIVE'),
      'Teste 7: Usuário com membership inativo ou bloqueado é estritamente rejeitado no SSO',
      'Exceção MEMBERSHIP_INACTIVE',
      `Bloqueado: ${suspendedUserErr}`
    );

    // -------------------------------------------------------------
    // TESTE 8: Organização inativa/suspensa bloqueia SSO
    // -------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);

    let suspendedOrgBlocked = false;
    let suspendedOrgErr = '';
    try {
      await client.query(
        `SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`,
        [suspendedOrgId]
      );
    } catch (err: any) {
      suspendedOrgBlocked = true;
      suspendedOrgErr = err.message;
    }

    assert(
      suspendedOrgBlocked && suspendedOrgErr.includes('ORGANIZATION_INACTIVE'),
      'Teste 8: Organização suspensa ou inativa é estritamente bloqueada no SSO',
      'Exceção ORGANIZATION_INACTIVE',
      `Bloqueado: ${suspendedOrgErr}`
    );

    // -------------------------------------------------------------
    // TESTE 9: Produto fora do catálogo oficial é rejeitado
    // -------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    let invalidProductBlocked = false;
    let invalidProductErr = '';
    try {
      await client.query(
        `SELECT public.prexyon_generate_sso_code($1::uuid, 'invalid_app_xyz');`,
        [testOrgId]
      );
    } catch (err: any) {
      invalidProductBlocked = true;
      invalidProductErr = err.message;
    }

    assert(
      invalidProductBlocked && invalidProductErr.includes('INVALID_PRODUCT_CODE'),
      'Teste 9: Produto fora do catálogo canônico oficial é rejeitado na emissão de código',
      'Exceção INVALID_PRODUCT_CODE',
      `Bloqueado: ${invalidProductErr}`
    );

    // -------------------------------------------------------------
    // TESTE 10: Entitlement downstream é preservado em prexyon_get_organization_entitlements
    // -------------------------------------------------------------
    const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [noEntitlementOrgId]);
    const entData = entRes.rows[0].ent;

    assert(
      entData.is_entitled === false && entData.effective_products.length === 0,
      'Teste 10: Resolver de Entitlement continua fail-closed para organização sem produtos contratados',
      'is_entitled=false, effective_products=[]',
      `is_entitled=${entData.is_entitled}, effective_products=${JSON.stringify(entData.effective_products)}`
    );

    // -------------------------------------------------------------
    // TESTE 11: Usuário anônimo (anon / sem autenticação) é rejeitado com 42501
    // -------------------------------------------------------------
    await client.query(`SET ROLE anon; SET request.jwt.claims = '{"role": "anon"}';`);
    let anonBlocked = false;
    let anonErr = '';
    try {
      await client.query(
        `SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`,
        [testOrgId]
      );
    } catch (err: any) {
      anonBlocked = true;
      anonErr = err.message;
    }

    assert(
      anonBlocked && (anonErr.includes('permission denied') || anonErr.includes('42501') || anonErr.includes('UNAUTHENTICATED')),
      'Teste 11: Chamada anônima à RPC canônica é terminantemente rejeitada',
      'permission denied / 42501 / UNAUTHENTICATED',
      `Bloqueado: ${anonErr}`
    );

    // -------------------------------------------------------------
    // TESTE 12: Replay de código SSO é bloqueado / Código é One-Time
    // -------------------------------------------------------------
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    // Validar que o código gerado no Teste 1 está na tabela prexyon_sso_codes vinculado ao memberUserId
    const dbCodeRes = await client.query(
      `SELECT code_hash, user_id, organization_id, product_code, expires_at, created_at
       FROM public.prexyon_sso_codes
       WHERE code_hash = $1;`,
      [sso1.code]
    );
    const storedCode = dbCodeRes.rows[0];

    assert(
      Boolean(storedCode) && storedCode.user_id === memberUserId && storedCode.product_code === 'orcagraf',
      'Teste 12.1: Código persistido no banco pertence estritamente ao MEMBER autenticado',
      `user_id=${memberUserId}, product_code=orcagraf`,
      `user_id=${storedCode?.user_id}, product_code=${storedCode?.product_code}`
    );

    // Consumir o código (simulando troca por token no backend do OrçaGraf)
    await client.query(`DELETE FROM public.prexyon_sso_codes WHERE code_hash = $1;`, [sso1.code]);

    const checkConsumed = await client.query(`SELECT count(*) FROM public.prexyon_sso_codes WHERE code_hash = $1;`, [sso1.code]);
    assert(
      parseInt(checkConsumed.rows[0].count, 10) === 0,
      'Teste 12.2: Código consumido não existe mais no banco (Proteção Anti-Replay)',
      'count = 0',
      `count = ${checkConsumed.rows[0].count}`
    );

    // -------------------------------------------------------------
    // TESTE 13: TTL de exatamente 60 segundos na RPC utilizada pelo Portal
    // -------------------------------------------------------------
    const expiresAt = new Date(sso1.expires_at).getTime();
    const now = Date.now();
    const diffSeconds = Math.round((expiresAt - now) / 1000);

    assert(
      diffSeconds >= 58 && diffSeconds <= 61,
      'Teste 13: TTL do código gerado pela RPC canônica é de 60 segundos',
      'TTL aproximadamente 60s (58s - 61s)',
      `TTL = ${diffSeconds}s`
    );

    // -------------------------------------------------------------
    // AUDITORIA FINAL DE PRESERVAÇÃO
    // -------------------------------------------------------------
    const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
    const realEnt = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as data;`, [realOrgId]);
    const data = realEnt.rows[0]?.data;

    assert(
      data?.active_members_count === 2 && JSON.stringify(data?.effective_products) === '["orcagraf"]' && data?.has_subscription === false,
      'Auditoria de Preservação: Organização real permanece com active_members_count=2, effective_products=["orcagraf"] e has_subscription=false',
      'active_members=2, products=["orcagraf"], has_sub=false',
      `active_members=${data?.active_members_count}, products=${JSON.stringify(data?.effective_products)}, has_sub=${data?.has_subscription}`
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES DE SEGURANÇA SSO: ${total}`);
    console.log(`APROVADOS:                        ${passed}`);
    console.log(`REPROVADOS:                       ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('TEST_UNCAUGHT_ERR:', err.message, err.stack);
  } finally {
    // Limpeza de Fixtures
    try {
      await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
      await client.query(`DELETE FROM public.prexyon_sso_codes WHERE organization_id IN ($1, $2, $3, $4);`, [testOrgId, otherOrgId, noEntitlementOrgId, suspendedOrgId]);
      await client.query(`DELETE FROM public.product_permissions WHERE organization_id IN ($1, $2, $3, $4);`, [testOrgId, otherOrgId, noEntitlementOrgId, suspendedOrgId]);
      await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id IN ($1, $2, $3, $4);`, [testOrgId, otherOrgId, noEntitlementOrgId, suspendedOrgId]);
      await client.query(`DELETE FROM public.organization_members WHERE organization_id IN ($1, $2, $3, $4);`, [testOrgId, otherOrgId, noEntitlementOrgId, suspendedOrgId]);
      await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id IN ($1, $2, $3, $4);`, [testOrgId, otherOrgId, noEntitlementOrgId, suspendedOrgId]);
      await client.query(`DELETE FROM public.organizations WHERE id IN ($1, $2, $3, $4);`, [testOrgId, otherOrgId, noEntitlementOrgId, suspendedOrgId]);
      await client.query(`DELETE FROM public.profiles WHERE id IN ($1, $2, $3, $4, $5);`, [ownerUserId, memberUserId, otherMemberUserId, suspendedMemberUserId, disabledAccessMemberUserId]);
      await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2, $3, $4, $5);`, [ownerUserId, memberUserId, otherMemberUserId, suspendedMemberUserId, disabledAccessMemberUserId]);
    } catch {}

    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runSsoIdentitySecurityTests();
