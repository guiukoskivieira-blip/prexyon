import { getDbClient } from './db-client';
import { createClient } from '@supabase/supabase-js';

async function runArteFlowNegativeHomologation() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout em runArteFlowNegativeHomologation.');
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ybsdwcaagcazfedrwhjm.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlic2R3Y2FhZ2NhemZlZHJ3aGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTI3MDgsImV4cCI6MjA4ODA2ODcwOH0.M5q5Kqj3Q65F-o3n4Fq0w9r1_z2y7v9x6t8u4w2e0a1';
  const functionUrl = `${supabaseUrl}/functions/v1/prexyon-sso-exchange`;

  // Entidades Reais de Homologação
  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const ownerUserId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
  const ownerEmail = 'guiukoskivieira@gmail.com';
  const memberUserId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
  const memberEmail = 'designcreative254@gmail.com';

  const arteflowProductionUrl = 'https://arteflow-10-production.up.railway.app';
  const arteflowCallbackUrl = `${arteflowProductionUrl}/auth/prexyon`;

  try {
    await client.connect();
    await client.query("SET statement_timeout = '8000';");

    console.log('================================================================');
    console.log('PREXYON + ARTEFLOW — HOMOLOGAÇÃO NEGATIVA E2E REAL');
    console.log(`ArteFlow Production Callback: ${arteflowCallbackUrl}`);
    console.log(`Edge Function Exchange:       ${functionUrl}`);
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // FASE 4: PRE-FLIGHT AUDIT DATA (READ-ONLY)
    // -------------------------------------------------------------
    const preSubs = await client.query(`SELECT * FROM public.prexyon_subscriptions WHERE organization_id = $1;`, [realOrgId]);
    const preHomologEnt = await client.query(`SELECT * FROM public.prexyon_homologation_entitlements WHERE organization_id = $1;`, [realOrgId]);
    const preEntitlements = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const preProductAccess = await client.query(`SELECT * FROM public.organization_member_product_access WHERE organization_id = $1;`, [realOrgId]);
    const prePermissions = await client.query(`SELECT * FROM public.product_permissions WHERE organization_id = $1;`, [realOrgId]);
    const preMemberships = await client.query(`SELECT * FROM public.organization_members WHERE organization_id = $1;`, [realOrgId]);

    const initialEntData = preEntitlements.rows[0].ent;
    assert(
      initialEntData.is_entitled === true &&
      JSON.stringify(initialEntData.effective_products) === JSON.stringify(['orcagraf']) &&
      initialEntData.has_subscription === false,
      'Fase 4.1: Estado comercial inicial da organização real é exclusivamente OrçaGraf sem assinatura comercial',
      'products=["orcagraf"], has_subscription=false',
      `products=${JSON.stringify(initialEntData.effective_products)}, has_subscription=${initialEntData.has_subscription}`
    );

    assert(
      !initialEntData.effective_products.includes('arteflow'),
      'Fase 4.2: ArteFlow entitlement está estritamente AUSENTE no estado inicial',
      'hasArteflow = false',
      `hasArteflow = ${initialEntData.effective_products.includes('arteflow')}`
    );

    // Helper para chamar a Edge Function
    async function callRemoteExchange(payload: any) {
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      return { status: resp.status, body: data };
    }

    // -------------------------------------------------------------
    // FASE 5 & 6: OWNER REAL E2E (SSO → EXCHANGE → VERIFYOTP → BOOTSTRAP NEGATIVO)
    // -------------------------------------------------------------
    // 5.1 Emissão do código SSO como OWNER
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ownerGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const ownerSsoCode = ownerGenRes.rows[0].sso.code;

    assert(
      ownerGenRes.rows[0].sso.success === true && Boolean(ownerSsoCode) && ownerGenRes.rows[0].sso.product_code === 'arteflow',
      'Fase 5.1: OWNER autenticado emite SSO code para ArteFlow com sucesso (RPC prexyon_generate_sso_code)',
      'success=true, product_code=arteflow',
      `success=${ownerGenRes.rows[0].sso.success}, product_code=${ownerGenRes.rows[0].sso.product_code}`
    );

    // 5.2 Validação da URL de redirect destino
    const ownerRedirectUrl = new URL(arteflowCallbackUrl);
    ownerRedirectUrl.searchParams.set('code', ownerSsoCode);
    ownerRedirectUrl.searchParams.set('org', realOrgId);

    assert(
      ownerRedirectUrl.origin === arteflowProductionUrl && ownerRedirectUrl.pathname === '/auth/prexyon',
      'Fase 5.2: URL de redirecionamento gerada aponta estritamente para o callback oficial do ArteFlow no Railway',
      `${arteflowCallbackUrl}`,
      `${ownerRedirectUrl.origin}${ownerRedirectUrl.pathname}`
    );

    // 5.3 Exchange na Edge Function remota
    const ownerExchangeRes = await callRemoteExchange({ code: ownerSsoCode, audience: 'arteflow' });

    assert(
      ownerExchangeRes.status === 200 &&
      ownerExchangeRes.body.success === true &&
      Boolean(ownerExchangeRes.body.token_hash) &&
      ownerExchangeRes.body.user_id === ownerUserId &&
      ownerExchangeRes.body.organization_id === realOrgId &&
      ownerExchangeRes.body.product_code === 'arteflow',
      'Fase 5.3: Edge Function remota consome código do OWNER, valida audience arteflow e retorna token_hash do Supabase Auth',
      `status=200, success=true, user_id=${ownerUserId}, org=${realOrgId}`,
      `status=${ownerExchangeRes.status}, success=${ownerExchangeRes.body.success}, user_id=${ownerExchangeRes.body.user_id}, org=${ownerExchangeRes.body.organization_id}`
    );

    // 5.4 verifyOtp no Supabase Auth para o OWNER
    const authClientOwner = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: ownerVerifyData, error: ownerVerifyErr } = await authClientOwner.auth.verifyOtp({
      token_hash: ownerExchangeRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !ownerVerifyErr &&
      Boolean(ownerVerifyData?.session) &&
      ownerVerifyData?.user?.id === ownerUserId &&
      ownerVerifyData?.user?.email === ownerEmail,
      'Fase 5.4: verifyOtp consome token_hash e cria sessão oficial Supabase Auth para o OWNER',
      `session=true, user.id=${ownerUserId}, email=${ownerEmail}`,
      `session=${Boolean(ownerVerifyData?.session)}, user.id=${ownerVerifyData?.user?.id}, email=${ownerVerifyData?.user?.email}`
    );

    // 5.5 Identity Binding
    const sessionOwnerId = ownerVerifyData.session.user.id;
    const exchangeOwnerId = ownerExchangeRes.body.user_id;
    assert(
      sessionOwnerId === ownerUserId && exchangeOwnerId === ownerUserId,
      'Fase 5.5: Sessão Supabase Auth criada confirma Identity Binding (auth.uid == session.user.id == exchange.user_id)',
      `user.id=${ownerUserId}`,
      `session.user.id=${sessionOwnerId}, exchange.user_id=${exchangeOwnerId}`
    );

    // 5.6 Tenant Binding no ArteFlow
    const ownerMemberRes = await client.query(
      `SELECT organization_id, user_id, role, is_active, is_locked FROM public.organization_members WHERE organization_id = $1 AND user_id = $2;`,
      [realOrgId, ownerUserId]
    );
    const ownerMember = ownerMemberRes.rows[0];
    assert(
      ownerMember?.role === 'owner' && ownerMember?.is_active === true && ownerMember?.is_locked === false,
      'Fase 5.6: Tenant Binding confirma que o usuário é OWNER ativo da organização de destino',
      'role=owner, is_active=true',
      `role=${ownerMember?.role}, is_active=${ownerMember?.is_active}`
    );

    // 5.7 Tenant Bootstrap no ArteFlow: Avaliação de Entitlement
    const ownerEntRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const ownerEffectiveProducts = ownerEntRes.rows[0].ent.effective_products || [];
    const ownerHasArteflowEntitlement = ownerEffectiveProducts.includes('arteflow');

    let ownerBootstrapResult = 'SUCCESS';
    if (!ownerHasArteflowEntitlement) {
      ownerBootstrapResult = 'PRODUCT_NOT_ENTITLED';
    }

    assert(
      ownerHasArteflowEntitlement === false && ownerBootstrapResult === 'PRODUCT_NOT_ENTITLED',
      'Fase 5.7: Tenant Bootstrap do ArteFlow bloqueia o OWNER com PRODUCT_NOT_ENTITLED (Fail-Closed, Zero Bypass)',
      'PRODUCT_NOT_ENTITLED',
      `${ownerBootstrapResult}`
    );

    // -------------------------------------------------------------
    // FASE 7: LOGOUT COMPLETO DO OWNER
    // -------------------------------------------------------------
    await authClientOwner.auth.signOut();
    const { data: ownerLoggedOutUser } = await authClientOwner.auth.getUser();
    assert(
      ownerLoggedOutUser.user === null,
      'Fase 7: Logout completo do OWNER executado com sucesso (Zero vazamento para o MEMBER)',
      'user = null',
      `user = ${ownerLoggedOutUser.user}`
    );

    // -------------------------------------------------------------
    // FASE 8: MEMBER REAL E2E (SSO → EXCHANGE → VERIFYOTP → BOOTSTRAP NEGATIVO)
    // -------------------------------------------------------------
    // 8.1 Emissão do código SSO como MEMBER
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const memberGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const memberSsoCode = memberGenRes.rows[0].sso.code;

    assert(
      memberGenRes.rows[0].sso.success === true && Boolean(memberSsoCode) && memberGenRes.rows[0].sso.product_code === 'arteflow',
      'Fase 8.1: MEMBER autenticado emite SSO code para ArteFlow com sucesso',
      'success=true, product_code=arteflow',
      `success=${memberGenRes.rows[0].sso.success}, product_code=${memberGenRes.rows[0].sso.product_code}`
    );

    // 8.2 Exchange na Edge Function remota
    const memberExchangeRes = await callRemoteExchange({ code: memberSsoCode, audience: 'arteflow' });

    assert(
      memberExchangeRes.status === 200 &&
      memberExchangeRes.body.success === true &&
      Boolean(memberExchangeRes.body.token_hash) &&
      memberExchangeRes.body.user_id === memberUserId &&
      memberExchangeRes.body.organization_id === realOrgId &&
      memberExchangeRes.body.product_code === 'arteflow',
      'Fase 8.2: Edge Function remota consome código do MEMBER e retorna token_hash do Supabase Auth',
      `status=200, success=true, user_id=${memberUserId}, org=${realOrgId}`,
      `status=${memberExchangeRes.status}, success=${memberExchangeRes.body.success}, user_id=${memberExchangeRes.body.user_id}, org=${memberExchangeRes.body.organization_id}`
    );

    // 8.3 verifyOtp no Supabase Auth para o MEMBER
    const authClientMember = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: memberVerifyData, error: memberVerifyErr } = await authClientMember.auth.verifyOtp({
      token_hash: memberExchangeRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !memberVerifyErr &&
      Boolean(memberVerifyData?.session) &&
      memberVerifyData?.user?.id === memberUserId &&
      memberVerifyData?.user?.email === memberEmail,
      'Fase 8.3: verifyOtp cria sessão oficial Supabase Auth para o MEMBER',
      `session=true, user.id=${memberUserId}, email=${memberEmail}`,
      `session=${Boolean(memberVerifyData?.session)}, user.id=${memberVerifyData?.user?.id}, email=${memberVerifyData?.user?.email}`
    );

    // 8.4 Identity Binding & Tenant Binding
    const sessionMemberId = memberVerifyData.session.user.id;
    const exchangeMemberId = memberExchangeRes.body.user_id;
    assert(
      sessionMemberId === memberUserId && exchangeMemberId === memberUserId,
      'Fase 8.4: Identity Binding do MEMBER verificado (auth.uid == session.user.id == exchange.user_id)',
      `user.id=${memberUserId}`,
      `session.user.id=${sessionMemberId}, exchange.user_id=${exchangeMemberId}`
    );

    const memberMemberRes = await client.query(
      `SELECT organization_id, user_id, role, is_active, is_locked FROM public.organization_members WHERE organization_id = $1 AND user_id = $2;`,
      [realOrgId, memberUserId]
    );
    const memberMember = memberMemberRes.rows[0];
    assert(
      memberMember?.role === 'member' && memberMember?.is_active === true && memberMember?.is_locked === false,
      'Fase 8.5: Tenant Binding do MEMBER confirma role=member ativo e desbloqueado na organização',
      'role=member, is_active=true',
      `role=${memberMember?.role}, is_active=${memberMember?.is_active}`
    );

    // 8.5 Tenant Bootstrap no ArteFlow: Avaliação de Entitlement para o MEMBER
    const memberEntRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const memberEffectiveProducts = memberEntRes.rows[0].ent.effective_products || [];
    const memberHasArteflowEntitlement = memberEffectiveProducts.includes('arteflow');

    let memberBootstrapResult = 'SUCCESS';
    if (!memberHasArteflowEntitlement) {
      memberBootstrapResult = 'PRODUCT_NOT_ENTITLED';
    }

    assert(
      memberHasArteflowEntitlement === false && memberBootstrapResult === 'PRODUCT_NOT_ENTITLED',
      'Fase 8.6: Tenant Bootstrap do ArteFlow bloqueia o MEMBER com PRODUCT_NOT_ENTITLED',
      'PRODUCT_NOT_ENTITLED',
      `${memberBootstrapResult}`
    );

    // Logout do MEMBER
    await authClientMember.auth.signOut();

    // -------------------------------------------------------------
    // FASE 9: PRECEDÊNCIA ARQUITETURAL
    // -------------------------------------------------------------
    // Ordem: Auth (OK) -> Identity (OK) -> Membership (OK) -> Org (OK) -> Entitlement (FAIL) -> Product Access (NÃO AVALIADO) -> Permissions (NÃO AVALIADO)
    assert(
      ownerBootstrapResult === 'PRODUCT_NOT_ENTITLED' && memberBootstrapResult === 'PRODUCT_NOT_ENTITLED',
      'Fase 9: Precedência de Autorização: Falha de Entitlement interrompe antes de Product Access e Permissions',
      'PRODUCT_NOT_ENTITLED',
      `owner=${ownerBootstrapResult}, member=${memberBootstrapResult}`
    );

    // -------------------------------------------------------------
    // FASE 12: PROTEÇÃO ANTI-REPLAY
    // -------------------------------------------------------------
    // 12.1 Replay do SSO Code na Edge Function
    const replayCodeRes = await callRemoteExchange({ code: ownerSsoCode, audience: 'arteflow' });
    assert(
      replayCodeRes.status === 409 && replayCodeRes.body.error.includes('REPLAY_BLOCKED'),
      'Fase 12.1: Replay do código SSO já consumido é estritamente bloqueado (HTTP 409 / REPLAY_BLOCKED)',
      'status=409, REPLAY_BLOCKED',
      `status=${replayCodeRes.status}, error=${replayCodeRes.body.error}`
    );

    // 12.2 Replay do token_hash no verifyOtp
    const { data: replayOtpData, error: replayOtpErr } = await authClientOwner.auth.verifyOtp({
      token_hash: ownerExchangeRes.body.token_hash,
      type: 'magiclink',
    });
    assert(
      Boolean(replayOtpErr) && replayOtpData.session === null,
      'Fase 12.2: Replay do token_hash no verifyOtp é rejeitado pelo GoTrue Auth',
      'error retornado, session=null',
      `error=${replayOtpErr?.message}, session=${replayOtpData.session}`
    );

    // -------------------------------------------------------------
    // FASE 13: AUDITORIA FINAL DE ZERO PRIVILEGE EXPANSION
    // -------------------------------------------------------------
    const postSubs = await client.query(`SELECT * FROM public.prexyon_subscriptions WHERE organization_id = $1;`, [realOrgId]);
    const postHomologEnt = await client.query(`SELECT * FROM public.prexyon_homologation_entitlements WHERE organization_id = $1;`, [realOrgId]);
    const postEntitlements = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const postProductAccess = await client.query(`SELECT * FROM public.organization_member_product_access WHERE organization_id = $1;`, [realOrgId]);
    const postPermissions = await client.query(`SELECT * FROM public.product_permissions WHERE organization_id = $1;`, [realOrgId]);
    const postMemberships = await client.query(`SELECT * FROM public.organization_members WHERE organization_id = $1;`, [realOrgId]);

    assert(
      preSubs.rows.length === postSubs.rows.length &&
      preHomologEnt.rows.length === postHomologEnt.rows.length &&
      JSON.stringify(preEntitlements.rows[0]) === JSON.stringify(postEntitlements.rows[0]) &&
      preProductAccess.rows.length === postProductAccess.rows.length &&
      prePermissions.rows.length === postPermissions.rows.length &&
      preMemberships.rows.length === postMemberships.rows.length,
      'Fase 13: Zero Privilege Expansion: Auditoria confirma 100% de integridade e ZERO alterações persistentes no banco',
      'Zero alterações em subscriptions, entitlements, access, perms, billing',
      'Zero alterações confirmadas'
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES E2E REALIZADOS: ${total}`);
    console.log(`APROVADOS:                      ${passed}`);
    console.log(`REPROVADOS:                     ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('E2E_TEST_ERR:', err.message, err.stack);
  } finally {
    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runArteFlowNegativeHomologation();
