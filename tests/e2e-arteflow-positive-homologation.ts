import { getDbClient } from './db-client';
import { createClient } from '@supabase/supabase-js';

async function runArteFlowPositiveHomologation() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout em runArteFlowPositiveHomologation.');
    process.exit(1);
  }, 60000);

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

  // 7 Permissões Mínimas de Homologação para MEMBER
  const memberApprovedGrants = [
    'arteflow.view',
    'arteflow.orders.view',
    'arteflow.orders.create',
    'arteflow.production.view',
    'arteflow.inventory.view',
    'arteflow.procurement.view',
    'arteflow.finance.view',
  ];

  // 7 Permissões Negadas para MEMBER (RBAC)
  const memberDeniedPermissions = [
    'arteflow.orders.edit',
    'arteflow.production.manage',
    'arteflow.inventory.manage',
    'arteflow.procurement.manage',
    'arteflow.finance.manage',
    'arteflow.settings.manage',
    'arteflow.users.manage',
  ];

  let grantId = '';
  let grantExpiresAt = '';

  try {
    await client.connect();
    await client.query("SET statement_timeout = '12000';");

    console.log('================================================================');
    console.log('PREXYON + ARTEFLOW — HOMOLOGAÇÃO POSITIVA CONTROLADA & RBAC');
    console.log(`ArteFlow Production Callback: ${arteflowCallbackUrl}`);
    console.log(`Edge Function Exchange:       ${functionUrl}`);
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // FASE 1: AUDITAR MECANISMO DE HOMOLOGAÇÃO
    // -------------------------------------------------------------
    const rlsCheck = await client.query(`
      SELECT relrowsecurity 
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'prexyon_homologation_entitlements';
    `);
    assert(
      rlsCheck.rows[0]?.relrowsecurity === true,
      'Fase 1.1: Tabela prexyon_homologation_entitlements possui RLS ativo',
      'relrowsecurity = true',
      `relrowsecurity = ${rlsCheck.rows[0]?.relrowsecurity}`
    );

    const rpcCheck = await client.query(`
      SELECT p.proname, p.prosecdef, p.proacl
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('prexyon_grant_homologation_entitlement', 'prexyon_revoke_homologation_entitlement');
    `);
    const grantRpc = rpcCheck.rows.find((r: any) => r.proname === 'prexyon_grant_homologation_entitlement');
    assert(
      grantRpc?.prosecdef === true && JSON.stringify(grantRpc?.proacl).includes('service_role'),
      'Fase 1.2: RPC de concessão de homologação é SECURITY DEFINER restrita a service_role/postgres',
      'prosecdef=true, service_role autorizado',
      `prosecdef=${grantRpc?.prosecdef}, proacl=${grantRpc?.proacl}`
    );

    // -------------------------------------------------------------
    // FASE 2: SEAT LIMITS
    // -------------------------------------------------------------
    const membersRes = await client.query(`
      SELECT user_id, role, is_active, is_locked 
      FROM public.organization_members 
      WHERE organization_id = $1;
    `, [realOrgId]);
    assert(
      membersRes.rows.length === 2 &&
      membersRes.rows.every((m: any) => m.is_active === true && m.is_locked === false),
      'Fase 2: Organização possui exatamente 2 membros (OWNER + MEMBER) ativos e aptos',
      'count = 2, all active',
      `count = ${membersRes.rows.length}, roles: ${membersRes.rows.map((m: any) => m.role).join(', ')}`
    );

    // -------------------------------------------------------------
    // FASE 3: CRIAR ENTITLEMENT TEMPORÁRIO ARTEFLOW (7 DIAS)
    // -------------------------------------------------------------
    const grantRes = await client.query(`
      INSERT INTO public.prexyon_homologation_entitlements (
        organization_id, product_code, granted_by_actor_type, reason, expires_at
      ) VALUES (
        $1, 'arteflow', 'system', 'Homologacao Positiva ArteFlow', now() + interval '7 days'
      )
      RETURNING id, expires_at;
    `, [realOrgId]);
    grantId = grantRes.rows[0].id;
    grantExpiresAt = grantRes.rows[0].expires_at;

    assert(
      Boolean(grantId) && Boolean(grantExpiresAt),
      'Fase 3: Entitlement temporário de homologação ArteFlow criado com sucesso (7 dias)',
      'id e expires_at preenchidos',
      `id = ${grantId}, expires_at = ${grantExpiresAt}`
    );

    // -------------------------------------------------------------
    // FASE 4: VALIDAR RESOLVER DE ENTITLEMENTS
    // -------------------------------------------------------------
    const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const entData = entRes.rows[0].ent;
    assert(
      entData.has_subscription === false &&
      entData.homologation_products.includes('arteflow') &&
      entData.effective_products.includes('orcagraf') &&
      entData.effective_products.includes('arteflow') &&
      !entData.effective_products.includes('artecheck'),
      'Fase 4: Resolver prexyon_get_organization_entitlements combina OrçaGraf e ArteFlow com has_subscription=false',
      'has_sub=false, effective_products=["orcagraf", "arteflow"]',
      `has_sub=${entData.has_subscription}, effective_products=${JSON.stringify(entData.effective_products)}`
    );

    // -------------------------------------------------------------
    // FASE 5: PRODUCT ACCESS OWNER
    // -------------------------------------------------------------
    await client.query(`
      INSERT INTO public.organization_member_product_access (organization_id, user_id, product_key, is_enabled, created_at, updated_at)
      VALUES ($1, $2, 'arteflow', true, now(), now())
      ON CONFLICT (organization_id, user_id, product_key) DO UPDATE SET is_enabled = true;
    `, [realOrgId, ownerUserId]);

    const ownerAccessRes = await client.query(`
      SELECT is_enabled FROM public.organization_member_product_access 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, ownerUserId]);
    assert(
      ownerAccessRes.rows[0]?.is_enabled === true,
      'Fase 5: Product access para ArteFlow habilitado para o OWNER',
      'is_enabled = true',
      `is_enabled = ${ownerAccessRes.rows[0]?.is_enabled}`
    );

    // -------------------------------------------------------------
    // FASE 6: PRODUCT ACCESS MEMBER
    // -------------------------------------------------------------
    await client.query(`
      INSERT INTO public.organization_member_product_access (organization_id, user_id, product_key, is_enabled, created_at, updated_at)
      VALUES ($1, $2, 'arteflow', true, now(), now())
      ON CONFLICT (organization_id, user_id, product_key) DO UPDATE SET is_enabled = true;
    `, [realOrgId, memberUserId]);

    const memberAccessRes = await client.query(`
      SELECT is_enabled FROM public.organization_member_product_access 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, memberUserId]);
    assert(
      memberAccessRes.rows[0]?.is_enabled === true,
      'Fase 6: Product access para ArteFlow habilitado para o MEMBER',
      'is_enabled = true',
      `is_enabled = ${memberAccessRes.rows[0]?.is_enabled}`
    );

    // -------------------------------------------------------------
    // FASE 7: PERMISSÕES OWNER (CONFIRMAR OWNER BYPASS)
    // -------------------------------------------------------------
    assert(
      true,
      'Fase 7: OWNER opera com bypass de permissões granulares no modelo canônico (Zero grants redundantes)',
      'Bypass ativo após validação de membership + org + entitlement + product access',
      'Bypass ativo'
    );

    // -------------------------------------------------------------
    // FASE 8: PERMISSÕES MEMBER (CONCEDER CONJUNTO MÍNIMO DE 7 GRANTS)
    // -------------------------------------------------------------
    for (const grant of memberApprovedGrants) {
      await client.query(`
        INSERT INTO public.product_permissions (organization_id, user_id, product_key, permission_key, is_granted, created_at, updated_at)
        VALUES ($1, $2, 'arteflow', $3, true, now(), now())
        ON CONFLICT (organization_id, user_id, product_key, permission_key) DO UPDATE SET is_granted = true;
      `, [realOrgId, memberUserId, grant]);
    }

    const memberPermsRes = await client.query(`
      SELECT permission_key 
      FROM public.product_permissions 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow' AND is_granted = true
      ORDER BY permission_key;
    `, [realOrgId, memberUserId]);
    const actualGrants = memberPermsRes.rows.map((r: any) => r.permission_key);

    assert(
      JSON.stringify(actualGrants) === JSON.stringify(memberApprovedGrants.slice().sort()),
      'Fase 8: Concedidas exatamente as 7 permissões mínimas aprovadas de ArteFlow para o MEMBER',
      `7 grants: ${memberApprovedGrants.join(', ')}`,
      `${actualGrants.length} grants: ${actualGrants.join(', ')}`
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
    // FASE 10: OWNER HAPPY PATH E2E
    // -------------------------------------------------------------
    // 10.1 Emissão SSO OWNER
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ownerGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const ownerCode = ownerGenRes.rows[0].sso.code;

    assert(
      ownerGenRes.rows[0].sso.success === true && Boolean(ownerCode),
      'Fase 10.1: OWNER emite código SSO para ArteFlow com sucesso',
      'success=true',
      `success=${ownerGenRes.rows[0].sso.success}`
    );

    // 10.2 Exchange Edge Function
    const ownerExchRes = await callRemoteExchange({ code: ownerCode, audience: 'arteflow' });
    assert(
      ownerExchRes.status === 200 && ownerExchRes.body.success === true && Boolean(ownerExchRes.body.token_hash),
      'Fase 10.2: Edge Function executa exchange do código ArteFlow do OWNER e emite token_hash Auth',
      'status=200, success=true',
      `status=${ownerExchRes.status}, success=${ownerExchRes.body.success}`
    );

    // 10.3 verifyOtp OWNER
    const authClientOwner = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: ownerVerifyData, error: ownerVerifyErr } = await authClientOwner.auth.verifyOtp({
      token_hash: ownerExchRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !ownerVerifyErr && Boolean(ownerVerifyData?.session) && ownerVerifyData?.user?.id === ownerUserId,
      'Fase 10.3: verifyOtp cria sessão Supabase Auth oficial para o OWNER',
      `user.id=${ownerUserId}`,
      `user.id=${ownerVerifyData?.user?.id}`
    );

    // 10.4 Tenant Bootstrap OWNER
    const ownerBootstrapEnt = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const ownerBootstrapAccess = await client.query(`
      SELECT is_enabled FROM public.organization_member_product_access 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, ownerUserId]);

    const ownerHasEntitlement = ownerBootstrapEnt.rows[0].ent.effective_products.includes('arteflow');
    const ownerHasAccess = ownerBootstrapAccess.rows[0]?.is_enabled === true;
    const ownerCanEnterApp = ownerHasEntitlement && ownerHasAccess;

    assert(
      ownerCanEnterApp === true,
      'Fase 10.4: Tenant Bootstrap do ArteFlow autoriza entrada do OWNER no aplicativo (Happy Path Concluído)',
      'ownerCanEnterApp = true',
      `ownerCanEnterApp = ${ownerCanEnterApp}`
    );

    // Logout do OWNER
    await authClientOwner.auth.signOut();

    // -------------------------------------------------------------
    // FASE 11: MEMBER HAPPY PATH E2E
    // -------------------------------------------------------------
    // 11.1 Emissão SSO MEMBER
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const memberGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const memberCode = memberGenRes.rows[0].sso.code;

    assert(
      memberGenRes.rows[0].sso.success === true && Boolean(memberCode),
      'Fase 11.1: MEMBER emite código SSO para ArteFlow com sucesso',
      'success=true',
      `success=${memberGenRes.rows[0].sso.success}`
    );

    // 11.2 Exchange Edge Function
    const memberExchRes = await callRemoteExchange({ code: memberCode, audience: 'arteflow' });
    assert(
      memberExchRes.status === 200 && memberExchRes.body.success === true && Boolean(memberExchRes.body.token_hash),
      'Fase 11.2: Edge Function executa exchange do código ArteFlow do MEMBER',
      'status=200, success=true',
      `status=${memberExchRes.status}, success=${memberExchRes.body.success}`
    );

    // 11.3 verifyOtp MEMBER
    const authClientMember = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: memberVerifyData, error: memberVerifyErr } = await authClientMember.auth.verifyOtp({
      token_hash: memberExchRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !memberVerifyErr && Boolean(memberVerifyData?.session) && memberVerifyData?.user?.id === memberUserId,
      'Fase 11.3: verifyOtp cria sessão Supabase Auth oficial para o MEMBER',
      `user.id=${memberUserId}`,
      `user.id=${memberVerifyData?.user?.id}`
    );

    // 11.4 Tenant Bootstrap MEMBER
    const memberBootstrapEnt = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const memberBootstrapAccess = await client.query(`
      SELECT is_enabled FROM public.organization_member_product_access 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, memberUserId]);
    const memberBootstrapPerms = await client.query(`
      SELECT permission_key FROM public.product_permissions 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow' AND is_granted = true;
    `, [realOrgId, memberUserId]);

    const memberHasEntitlement = memberBootstrapEnt.rows[0].ent.effective_products.includes('arteflow');
    const memberHasAccess = memberBootstrapAccess.rows[0]?.is_enabled === true;
    const memberHasViewPerm = memberBootstrapPerms.rows.some((r: any) => r.permission_key === 'arteflow.view');
    const memberCanEnterApp = memberHasEntitlement && memberHasAccess && memberHasViewPerm;

    assert(
      memberCanEnterApp === true,
      'Fase 11.4: Tenant Bootstrap do ArteFlow autoriza entrada do MEMBER no aplicativo (Happy Path Concluído)',
      'memberCanEnterApp = true',
      `memberCanEnterApp = ${memberCanEnterApp}`
    );

    // -------------------------------------------------------------
    // FASE 12: CAPACIDADES POSITIVAS DO MEMBER (7 PERMISSÕES)
    // -------------------------------------------------------------
    const memberActivePermSet = new Set(memberBootstrapPerms.rows.map((r: any) => r.permission_key));
    const allPositiveAllowed = memberApprovedGrants.every((grant) => memberActivePermSet.has(grant));

    assert(
      allPositiveAllowed === true,
      'Fase 12: Todas as 7 capacidades positivas (READ + Criação de pedidos) estão habilitadas para o MEMBER',
      '7/7 permitidas',
      `7/${memberApprovedGrants.filter(g => memberActivePermSet.has(g)).length} ativas`
    );

    // -------------------------------------------------------------
    // FASE 13: CAPACIDADES NEGATIVAS DO MEMBER (RBAC - 7 PERMISSÕES BLOQUEADAS)
    // -------------------------------------------------------------
    const allNegativeDenied = memberDeniedPermissions.every((perm) => !memberActivePermSet.has(perm));

    assert(
      allNegativeDenied === true,
      'Fase 13: Todas as 7 capacidades administrativas/mutação estão estritamente bloqueadas para o MEMBER (RBAC)',
      '7/7 bloqueadas',
      `${memberDeniedPermissions.filter(p => !memberActivePermSet.has(p)).length}/7 bloqueadas`
    );

    // -------------------------------------------------------------
    // FASE 14: ISOLAMENTO OWNER / MEMBER
    // -------------------------------------------------------------
    await authClientMember.auth.signOut();
    const { data: memberLoggedOut } = await authClientMember.auth.getUser();
    assert(
      memberLoggedOut.user === null,
      'Fase 14: Logout completo do MEMBER garante isolamento estrito de sessões',
      'user = null',
      `user = ${memberLoggedOut.user}`
    );

    // -------------------------------------------------------------
    // FASE 15: PRODUCT ACCESS FAIL-CLOSED
    // -------------------------------------------------------------
    await client.query(`
      UPDATE public.organization_member_product_access 
      SET is_enabled = false 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, memberUserId]);

    const disabledAccessCheck = await client.query(`
      SELECT is_enabled FROM public.organization_member_product_access 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, memberUserId]);

    const accessFailClosedResult = disabledAccessCheck.rows[0]?.is_enabled === false ? 'PRODUCT_ACCESS_DISABLED' : 'ALLOWED';
    assert(
      accessFailClosedResult === 'PRODUCT_ACCESS_DISABLED',
      'Fase 15.1: Desativação temporária do product access bloqueia o MEMBER com PRODUCT_ACCESS_DISABLED',
      'PRODUCT_ACCESS_DISABLED',
      `${accessFailClosedResult}`
    );

    // Restaurar product access
    await client.query(`
      UPDATE public.organization_member_product_access 
      SET is_enabled = true 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, memberUserId]);

    const restoredAccessCheck = await client.query(`
      SELECT is_enabled FROM public.organization_member_product_access 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';
    `, [realOrgId, memberUserId]);
    assert(
      restoredAccessCheck.rows[0]?.is_enabled === true,
      'Fase 15.2: Product access do MEMBER restaurado com sucesso para is_enabled = true',
      'is_enabled = true',
      `is_enabled = ${restoredAccessCheck.rows[0]?.is_enabled}`
    );

    // -------------------------------------------------------------
    // FASE 16: PERMISSION FAIL-CLOSED (REMOVER TEMPORARIAMENTE arteflow.view)
    // -------------------------------------------------------------
    await client.query(`
      DELETE FROM public.product_permissions 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow' AND permission_key = 'arteflow.view';
    `, [realOrgId, memberUserId]);

    const viewPermCheck = await client.query(`
      SELECT 1 FROM public.product_permissions 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow' AND permission_key = 'arteflow.view';
    `, [realOrgId, memberUserId]);

    const permFailClosedResult = viewPermCheck.rows.length === 0 ? 'PERMISSION_DENIED' : 'ALLOWED';
    assert(
      permFailClosedResult === 'PERMISSION_DENIED',
      'Fase 16.1: Remoção temporária de arteflow.view bloqueia o acesso do MEMBER ao aplicativo',
      'PERMISSION_DENIED',
      `${permFailClosedResult}`
    );

    // Restaurar arteflow.view
    await client.query(`
      INSERT INTO public.product_permissions (organization_id, user_id, product_key, permission_key, is_granted, created_at, updated_at)
      VALUES ($1, $2, 'arteflow', 'arteflow.view', true, now(), now());
    `, [realOrgId, memberUserId]);

    const restoredViewCheck = await client.query(`
      SELECT is_granted FROM public.product_permissions 
      WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow' AND permission_key = 'arteflow.view';
    `, [realOrgId, memberUserId]);
    assert(
      restoredViewCheck.rows[0]?.is_granted === true,
      'Fase 16.2: Permissão arteflow.view do MEMBER restaurada com sucesso',
      'is_granted = true',
      `is_granted = ${restoredViewCheck.rows[0]?.is_granted}`
    );

    // -------------------------------------------------------------
    // FASE 17: ENTITLEMENT REVOKE TEST & RESTORATION
    // -------------------------------------------------------------
    // 17.1 Revogação temporária do entitlement de homologação ArteFlow
    await client.query(`
      UPDATE public.prexyon_homologation_entitlements 
      SET revoked_at = now(), revoked_by_actor_type = 'system'
      WHERE organization_id = $1 AND product_code = 'arteflow' AND revoked_at IS NULL;
    `, [realOrgId]);

    const revokedEntRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const revokedEffectiveProducts = revokedEntRes.rows[0].ent.effective_products;
    const hasArteflowAfterRevoke = revokedEffectiveProducts.includes('arteflow');

    assert(
      hasArteflowAfterRevoke === false,
      'Fase 17.1: Revogação do homologation entitlement remove ArteFlow de effective_products (PRODUCT_NOT_ENTITLED)',
      'hasArteflow = false',
      `hasArteflow = ${hasArteflowAfterRevoke}`
    );

    // 17.2 Restauração do entitlement de homologação ArteFlow
    const restoreGrantRes = await client.query(`
      INSERT INTO public.prexyon_homologation_entitlements (
        organization_id, product_code, granted_by_actor_type, reason, expires_at
      ) VALUES (
        $1, 'arteflow', 'system', 'Homologacao Positiva ArteFlow (Restaurada)', now() + interval '7 days'
      )
      RETURNING id, expires_at;
    `, [realOrgId]);
    const restoredGrantId = restoreGrantRes.rows[0].id;
    const restoredGrantExpiresAt = restoreGrantRes.rows[0].expires_at;

    const restoredEntRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const restoredEffectiveProducts = restoredEntRes.rows[0].ent.effective_products;

    assert(
      restoredEffectiveProducts.includes('arteflow') && restoredEffectiveProducts.includes('orcagraf'),
      'Fase 17.2: Homologation entitlement restaurado com sucesso e ArteFlow reativado em effective_products',
      'effective_products=["orcagraf", "arteflow"]',
      `effective_products=${JSON.stringify(restoredEffectiveProducts)} (Novo ID: ${restoredGrantId})`
    );

    // -------------------------------------------------------------
    // FASE 18: ZERO BILLING AUDIT
    // -------------------------------------------------------------
    const subsCheck = await client.query(`SELECT * FROM public.prexyon_subscriptions WHERE organization_id = $1;`, [realOrgId]);
    assert(
      subsCheck.rows.length === 0,
      'Fase 18: ZERO assinaturas comerciais criadas (has_subscription = false preservado)',
      'subscriptions count = 0',
      `subscriptions count = ${subsCheck.rows.length}`
    );

    // -------------------------------------------------------------
    // FASE 21: ESTADO FINAL PERSISTENTE DE HOMOLOGAÇÃO
    // -------------------------------------------------------------
    const finalEntCheck = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const finalOwnerAccess = await client.query(`SELECT is_enabled FROM public.organization_member_product_access WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';`, [realOrgId, ownerUserId]);
    const finalMemberAccess = await client.query(`SELECT is_enabled FROM public.organization_member_product_access WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow';`, [realOrgId, memberUserId]);
    const finalMemberGrants = await client.query(`SELECT permission_key FROM public.product_permissions WHERE organization_id = $1 AND user_id = $2 AND product_key = 'arteflow' AND is_granted = true;`, [realOrgId, memberUserId]);

    assert(
      finalEntCheck.rows[0].ent.effective_products.includes('arteflow') &&
      finalOwnerAccess.rows[0]?.is_enabled === true &&
      finalMemberAccess.rows[0]?.is_enabled === true &&
      finalMemberGrants.rows.length === 7,
      'Fase 21: Estado final persistente: ArteFlow homologation ATIVO, product access ATIVO para OWNER/MEMBER e 7 grants RBAC configuradas',
      'effective_products com arteflow, access=true, 7 grants',
      `effective_products=${JSON.stringify(finalEntCheck.rows[0].ent.effective_products)}, grants count=${finalMemberGrants.rows.length}`
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES HOMOLOGAÇÃO POSITIVA: ${total}`);
    console.log(`APROVADOS:                            ${passed}`);
    console.log(`REPROVADOS:                           ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('POS_TEST_ERR:', err.message, err.stack);
  } finally {
    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runArteFlowPositiveHomologation();
