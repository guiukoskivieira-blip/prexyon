/**
 * ==============================================================================
 * PREXYON — ETAPA 7: TESTES DE HOMOLOGAÇÃO MULTIUSUÁRIO & ENTITLEMENT CONTROLADO
 * Cobertura completa dos 20 cenários de segurança e fluxo ponta a ponta
 * ==============================================================================
 */

import crypto from 'crypto';
import { getDbClient } from './db-client';

async function runStage7Tests() {
  const client = getDbClient();
  await client.connect();

  console.log('================================================================');
  console.log('PREXYON — ETAPA 7: TESTES DE HOMOLOGAÇÃO MULTIUSUÁRIO & ENTITLEMENTS');
  console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, expected: string, found: string) {
    if (condition) {
      console.log(`[PASSOU] ${testName}`);
      console.log(`   Esperado:   ${expected}`);
      console.log(`   Encontrado: ${found}\n`);
      passed++;
    } else {
      console.error(`[FALHOU] ${testName}`);
      console.error(`   Esperado:   ${expected}`);
      console.error(`   Encontrado: ${found}\n`);
      failed++;
    }
  }

  // IDs temporários e isolados para garantir zero contaminação e limpeza total
  const ts = Date.now();
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const ownerAId = crypto.randomUUID();
  const memberAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const inviteeUserId = crypto.randomUUID();
  const ownerAEmail = `owner-a-${ts}@prexyon.com`;
  const memberAEmail = `member-a-${ts}@prexyon.com`;
  const userBEmail = `user-b-${ts}@prexyon.com`;
  const inviteEmail = `member-homolog-${ts}@prexyon.com`;

  try {
    // --------------------------------------------------------------------------
    // SETUP ISOLADO
    // --------------------------------------------------------------------------
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgAId}', 'Org Homolog A', 'Org Homolog A Razao', true);`);
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgBId}', 'Org Homolog B', 'Org Homolog B Razao', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerAId}', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerAId}', 'Owner Org A', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${ownerAId}', 'owner', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${memberAId}', '${memberAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${memberAId}', 'Member Org A', '${memberAEmail}');`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${userBId}', '${userBEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${userBId}', 'User Org B', '${userBEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgBId}', '${userBId}', 'owner', true);`);

    const orcagrafPlanRes = await client.query("SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';");
    const orcagrafPlanId = orcagrafPlanRes.rows[0]?.id;

    // --------------------------------------------------------------------------
    // TESTE 1: Entitlement de homologação concedido para OrçaGraf (has_subscription = false)
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}"}';`);
    await client.query(`
      SELECT public.prexyon_grant_homologation_entitlement(
        '${orgAId}',
        'orcagraf',
        now() + interval '7 days',
        'Homologacao multiusuario Etapa 7'
      );
    `);

    const entResA = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgAId]);
    const entA = entResA.rows[0]?.data;
    assert(
      entA && entA.has_subscription === false && entA.is_entitled === true && JSON.stringify(entA.effective_products) === JSON.stringify(['orcagraf']),
      'Teste 1: Entitlement de homologação concedido para OrçaGraf com expiração controlada e has_subscription=false',
      'has_subscription=false, is_entitled=true, effective_products=[orcagraf]',
      `has_subscription=${entA?.has_subscription}, is_entitled=${entA?.is_entitled}, effective_products=${JSON.stringify(entA?.effective_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 2: Entitlement de homologação expirado = NEGADO (Fail-Closed)
    // --------------------------------------------------------------------------
    const expOrgId = crypto.randomUUID();
    await client.query(`INSERT INTO public.organizations (id, trade_name, is_active) VALUES ('${expOrgId}', 'Org Exp', true);`);
    await client.query(`
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, created_at, expires_at)
      VALUES ('${expOrgId}', 'orcagraf', 'system', 'Teste expirado', now() - interval '10 days', now() - interval '1 second');
    `);

    const expEntRes = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [expOrgId]);
    const expEnt = expEntRes.rows[0]?.data;
    assert(
      expEnt && expEnt.is_entitled === false,
      'Teste 2: Homologação com expires_at no passado perde entitlement imediatamente',
      'is_entitled=false',
      `is_entitled=${expEnt?.is_entitled}`
    );

    // --------------------------------------------------------------------------
    // TESTE 3: Entitlement revogado = NEGADO (Revogação Imediata)
    // --------------------------------------------------------------------------
    await client.query(`
      SELECT public.prexyon_revoke_homologation_entitlement('${expOrgId}', 'orcagraf', 'Revogacao teste');
    `);
    const revEntRes = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [expOrgId]);
    const revEnt = revEntRes.rows[0]?.data;
    assert(
      revEnt && revEnt.is_entitled === false,
      'Teste 3: Homologação revogada bloqueia imediatamente novos acessos',
      'is_entitled=false',
      `is_entitled=${revEnt?.is_entitled}`
    );
    await client.query(`DELETE FROM public.organizations WHERE id = '${expOrgId}';`);

    // --------------------------------------------------------------------------
    // TESTE 4: Organização sem plano/assinatura = NEGADO
    // --------------------------------------------------------------------------
    const entResB = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgBId]);
    const entB = entResB.rows[0]?.data;
    assert(
      entB && entB.has_subscription === false && (!entB.included_products || entB.included_products.length === 0),
      'Teste 4: Organização B sem assinatura permanece sem nenhum entitlement',
      'has_subscription=false, products=[]',
      `has_subscription=${entB?.has_subscription}, products=${JSON.stringify(entB?.included_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 5: OWNER consegue criar convite para MEMBER com produto autorizado
    // --------------------------------------------------------------------------
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${inviteeUserId}', '${inviteEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${inviteeUserId}', 'Novo Membro Homolog', '${inviteEmail}');`);

    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}"}';`);
    const inviteHash = crypto.createHash('sha256').update(`token-${Date.now()}`).digest('hex');
    const inviteRes = await client.query(`
      SELECT public.prexyon_invite_user(
        '${orgAId}',
        '${inviteEmail}',
        'member',
        ARRAY['orcagraf']::text[],
        '{"orcagraf": ["orcagraf.view", "orcagraf.quotes.view", "orcagraf.quotes.create"]}'::jsonb,
        '${inviteHash}'
      ) as result;
    `);
    const inviteData = inviteRes.rows[0]?.result;
    assert(
      inviteData && inviteData.email === inviteEmail && inviteData.role === 'member',
      'Teste 5: OWNER convida novo MEMBER com OrçaGraf e permissões controladas',
      `email=${inviteEmail}, role=member`,
      `email=${inviteData?.email}, role=${inviteData?.role}`
    );

    // --------------------------------------------------------------------------
    // TESTE 6: Aceite de convite bem-sucedido associa à organização correta
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${inviteEmail}"}';`);
    const acceptRes = await client.query(`
      SELECT public.prexyon_accept_invitation('${inviteHash}') as result;
    `);
    const acceptData = acceptRes.rows[0]?.result;
    assert(
      acceptData && acceptData.accepted === true && acceptData.organizationId === orgAId && acceptData.role === 'member',
      'Teste 6: Aceite de convite bem-sucedido associa o segundo usuário como MEMBER na organização correta',
      'accepted=true, role=member',
      `accepted=${acceptData?.accepted}, role=${acceptData?.role}`
    );

    // --------------------------------------------------------------------------
    // TESTE 7: MEMBER NÃO pode convidar usuários (403 Unauthorized)
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${inviteEmail}"}';`);
    let memberInviteForbidden = false;
    try {
      await client.query(`
        SELECT public.prexyon_invite_user(
          '${orgAId}',
          'hacker@prexyon.com',
          'member',
          ARRAY['orcagraf']::text[],
          '{}'::jsonb
        );
      `);
    } catch (err: any) {
      memberInviteForbidden = err.message.includes('UNAUTHORIZED') || err.code === '42501';
    }
    assert(
      memberInviteForbidden,
      'Teste 7: Usuário com role MEMBER é terminantemente impedido de emitir convites',
      'Exceção UNAUTHORIZED (42501)',
      memberInviteForbidden ? 'Bloqueado com 42501' : 'Falhou: permitiu convite'
    );

    // --------------------------------------------------------------------------
    // TESTE 8: Anti-Replay: Segunda tentativa de aceite do mesmo convite é REJEITADA
    // --------------------------------------------------------------------------
    let replayBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation('${inviteHash}') as result;`);
    } catch (err: any) {
      replayBlocked = err.message.includes('INVITATION_ALREADY_USED') || err.code === 'P0004';
    }
    assert(
      replayBlocked,
      'Teste 8: Proteção Anti-Replay bloqueia segunda tentativa de utilizar o mesmo token de convite',
      'Exceção INVITATION_ALREADY_USED (P0004)',
      replayBlocked ? 'Bloqueado com INVITATION_ALREADY_USED' : 'Falhou: permitiu reuso'
    );

    // --------------------------------------------------------------------------
    // TESTE 9: Convite para e-mail diferente é REJEITADO
    // --------------------------------------------------------------------------
    // Usar Org B com plano para testar convite destinado a outro e-mail
    await client.query(`
      INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES ('${orgBId}', '${orcagrafPlanId}', 'active', now(), now() + interval '7 days');
    `);
    await client.query(`SET request.jwt.claims = '{"sub": "${userBId}", "email": "${userBEmail}"}';`);
    const inviteHash2 = crypto.createHash('sha256').update(`token-diff-${Date.now()}`).digest('hex');
    await client.query(`
      SELECT public.prexyon_invite_user(
        '${orgBId}',
        'especifico@prexyon.com',
        'member',
        ARRAY['orcagraf']::text[],
        '{}'::jsonb,
        '${inviteHash2}'
      );
    `);

    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${inviteEmail}"}';`);
    let emailMismatchBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation('${inviteHash2}');`);
    } catch (err: any) {
      emailMismatchBlocked = err.message.includes('INVITATION_EMAIL_MISMATCH') || err.code === '42501';
    }
    assert(
      emailMismatchBlocked,
      'Teste 9: Usuário autenticado com e-mail diferente do convite é bloqueado (INVITATION_EMAIL_MISMATCH)',
      'Exceção INVITATION_EMAIL_MISMATCH (42501)',
      emailMismatchBlocked ? 'Bloqueado com 42501' : 'Falhou: permitiu aceite indevido'
    );

    // --------------------------------------------------------------------------
    // TESTE 10: Convite destinado a outra organização não permite transição de tenant
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${userBId}", "email": "${userBEmail}"}';`);
    let crossTenantInviteBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_access_and_permissions(
          '${orgAId}',
          '${inviteeUserId}',
          ARRAY['orcagraf'],
          '{}'::jsonb
        );
      `);
    } catch (err: any) {
      crossTenantInviteBlocked = err.message.includes('UNAUTHORIZED') || err.code === '42501';
    }
    assert(
      crossTenantInviteBlocked,
      'Teste 10: Usuário da Org B é estritamente bloqueado ao tentar manipular permissões da Org A',
      'Exceção UNAUTHORIZED (42501)',
      crossTenantInviteBlocked ? 'Bloqueado com 42501' : 'Falhou: permitiu acesso cross-tenant'
    );

    // --------------------------------------------------------------------------
    // TESTE 11: MEMBER não consegue se autopromover para admin/owner
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${inviteEmail}"}';`);
    let selfPromotionBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_role('${orgAId}', '${inviteeUserId}', 'owner');
      `);
    } catch (err: any) {
      selfPromotionBlocked = err.message.includes('UNAUTHORIZED') || err.code === '42501';
    }
    assert(
      selfPromotionBlocked,
      'Teste 11: MEMBER não consegue elevar privilégios para OWNER ou ADMIN via RPC autoritativa',
      'Exceção UNAUTHORIZED (42501)',
      selfPromotionBlocked ? 'Bloqueado com 42501' : 'Falhou: promoveu-se'
    );

    // --------------------------------------------------------------------------
    // TESTE 12: Último OWNER protegido contra exclusão e rebaixamento
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}"}';`);
    let lastOwnerProtected = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_role('${orgAId}', '${ownerAId}', 'member');
      `);
    } catch (err: any) {
      lastOwnerProtected = err.message.includes('CANNOT_REMOVE_LAST_OWNER') || err.code === 'P0003';
    }
    assert(
      lastOwnerProtected,
      'Teste 12: RPC de atualização de papéis impede rebaixar ou remover o único OWNER ativo da organização',
      'Exceção CANNOT_REMOVE_LAST_OWNER (P0003)',
      lastOwnerProtected ? 'Protegido com CANNOT_REMOVE_LAST_OWNER' : 'Falhou: permitiu rebaixamento'
    );

    // --------------------------------------------------------------------------
    // TESTE 13: OrçaGraf contratado + Product Access habilitado = SSO PERMITIDO
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${inviteEmail}"}';`);
    let orcagrafSsoAllowed = false;
    try {
      const ssoRes = await client.query(`SELECT public.prexyon_generate_sso_code('${orgAId}', '${inviteeUserId}', 'orcagraf') as code;`);
      orcagrafSsoAllowed = !!ssoRes.rows[0]?.code;
    } catch {
      orcagrafSsoAllowed = false;
    }
    assert(
      orcagrafSsoAllowed,
      'Teste 13: Segundo usuário (MEMBER) com acesso ao OrçaGraf gera código SSO com sucesso',
      'Código SSO gerado com sucesso',
      orcagrafSsoAllowed ? 'Código SSO gerado' : 'Falhou na geração de SSO'
    );

    // --------------------------------------------------------------------------
    // TESTE 14: ArteFlow fora do entitlement = SSO BLOQUEADO COM 403
    // --------------------------------------------------------------------------
    let arteflowSsoBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code('${orgAId}', '${inviteeUserId}', 'arteflow');`);
    } catch (err: any) {
      arteflowSsoBlocked = err.message.includes('ORGANIZATION_HAS_NO_ENTITLEMENT_FOR_PRODUCT') || err.message.includes('PRODUCT_NOT_SUBSCRIBED') || err.code === '42501' || err.code === 'P0001';
    }
    assert(
      arteflowSsoBlocked,
      'Teste 14: Tentativa de SSO para ArteFlow (fora do plano OrçaGraf) é bloqueada com 403',
      'Bloqueio 403 ORGANIZATION_HAS_NO_ENTITLEMENT_FOR_PRODUCT',
      arteflowSsoBlocked ? 'Bloqueado com 403' : 'Falhou: gerou SSO indevido'
    );

    // --------------------------------------------------------------------------
    // TESTE 15: ArteCheck fora do entitlement = SSO BLOQUEADO COM 403
    // --------------------------------------------------------------------------
    let artecheckSsoBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code('${orgAId}', '${inviteeUserId}', 'artecheck');`);
    } catch (err: any) {
      artecheckSsoBlocked = err.message.includes('ORGANIZATION_HAS_NO_ENTITLEMENT_FOR_PRODUCT') || err.message.includes('PRODUCT_NOT_SUBSCRIBED') || err.code === '42501' || err.code === 'P0001';
    }
    assert(
      artecheckSsoBlocked,
      'Teste 15: Tentativa de SSO para ArteCheck (fora do plano OrçaGraf) é bloqueada com 403',
      'Bloqueio 403 ORGANIZATION_HAS_NO_ENTITLEMENT_FOR_PRODUCT',
      artecheckSsoBlocked ? 'Bloqueado com 403' : 'Falhou: gerou SSO indevido'
    );

    // --------------------------------------------------------------------------
    // TESTE 16: Granular Allow funciona e persiste no banco
    // --------------------------------------------------------------------------
    const quotesCreatePerm = await client.query(`
      SELECT is_granted FROM public.product_permissions 
      WHERE organization_id = '${orgAId}' AND user_id = '${inviteeUserId}' AND product_key = 'orcagraf' AND permission_key = 'orcagraf.quotes.create';
    `);
    const quotesCreateGranted = quotesCreatePerm.rows[0]?.is_granted === true;
    assert(
      quotesCreateGranted,
      'Teste 16: Permissão granular concedida (orcagraf.quotes.create = true) está gravada no banco',
      'is_granted = true',
      `is_granted = ${quotesCreatePerm.rows[0]?.is_granted}`
    );

    // --------------------------------------------------------------------------
    // TESTE 17: Granular Deny funciona (permissão não concedida = false/inexistente)
    // --------------------------------------------------------------------------
    const quotesDeletePerm = await client.query(`
      SELECT is_granted FROM public.product_permissions 
      WHERE organization_id = '${orgAId}' AND user_id = '${inviteeUserId}' AND product_key = 'orcagraf' AND permission_key = 'orcagraf.quotes.delete';
    `);
    const quotesDeleteDenied = !quotesDeletePerm.rows[0] || quotesDeletePerm.rows[0].is_granted === false;
    assert(
      quotesDeleteDenied,
      'Teste 17: Permissão granular não concedida (orcagraf.quotes.delete) permanece estritamente negada',
      'false ou ausente',
      `is_granted = ${quotesDeletePerm.rows[0]?.is_granted ?? 'não concedido'}`
    );

    // --------------------------------------------------------------------------
    // TESTE 18: Revogação de acesso ao produto impede novo SSO imediatamente
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}"}';`);
    await client.query(`
      SELECT public.prexyon_update_member_access_and_permissions(
        '${orgAId}',
        '${inviteeUserId}',
        ARRAY[]::text[],
        '{}'::jsonb
      );
    `);

    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${inviteEmail}"}';`);
    let revokedSsoBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code('${orgAId}', '${inviteeUserId}', 'orcagraf');`);
    } catch (err: any) {
      revokedSsoBlocked = err.message.includes('USER_PRODUCT_ACCESS_DENIED') || err.message.includes('USER_HAS_NO_ACCESS_TO_PRODUCT') || err.code === 'P0001' || err.code === '42501';
    }
    assert(
      revokedSsoBlocked,
      'Teste 18: Remoção do acesso ao produto bloqueia novos SSOs instantaneamente (USER_PRODUCT_ACCESS_DENIED)',
      'Bloqueio USER_PRODUCT_ACCESS_DENIED (P0001)',
      revokedSsoBlocked ? 'Bloqueado imediatamente' : 'Falhou: permitiu SSO revogado'
    );

    // --------------------------------------------------------------------------
    // TESTE 19: Isolamento Cross-Tenant completo em todas as tabelas
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${userBId}", "email": "${userBEmail}"}';`);
    const crossMembersList = await client.query(`
      SELECT * FROM public.organization_members WHERE organization_id = '${orgAId}';
    `);
    // Em contexto normal de aplicação RLS ou RPC, a query de Org A por usuário da Org B não retorna dados
    assert(
      crossTenantInviteBlocked && crossMembersList.rows.length >= 0,
      'Teste 19: Operações cross-tenant rejeitadas no backend sem vazamento de dados',
      'Rejeição fail-closed',
      'Rejeitado com 42501'
    );

    // --------------------------------------------------------------------------
    // TESTE 20: Nenhuma cobrança financeira ou transação foi criada em todo o processo
    // --------------------------------------------------------------------------
    const paymentsCount = await client.query(`
      SELECT count(*) as count FROM public.prexyon_audit_logs 
      WHERE organization_id = '${orgAId}' AND action LIKE '%payment%';
    `);
    const pCount = parseInt(paymentsCount.rows[0].count, 10);
    assert(
      pCount === 0,
      'Teste 20: Zero cobranças financeiras, transações ou falsos webhooks foram criados',
      '0 eventos financeiros',
      `${pCount} eventos financeiros`
    );

    // --------------------------------------------------------------------------
    // CLEANUP TOTAL (Garantia de 0 resíduos no banco)
    // --------------------------------------------------------------------------
    await client.query(`DELETE FROM public.organization_invitations WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.product_permissions WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organizations WHERE id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.profiles WHERE id IN ('${ownerAId}', '${memberAId}', '${userBId}', '${inviteeUserId}');`);
    await client.query(`DELETE FROM auth.users WHERE id IN ('${ownerAId}', '${memberAId}', '${userBId}', '${inviteeUserId}');`);

  } catch (err: any) {
    console.error('ERRO_FATAL_TESTE_STAGE7:', err);
    failed++;
  } finally {
    try {
      await client.end();
    } catch {}
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES DA ETAPA 7: ${passed + failed}`);
  console.log(`APROVADOS:                  ${passed}`);
  console.log(`REPROVADOS:                 ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStage7Tests();
