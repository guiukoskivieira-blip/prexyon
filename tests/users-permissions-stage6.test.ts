/**
 * ==============================================================================
 * PREXYON — ETAPA 6: TESTES DE GESTÃO DE USUÁRIOS, ACESSOS E PERMISSÕES
 * Cobertura completa dos testes A até T com PostgreSQL central real
 * ==============================================================================
 */

import crypto from 'crypto';
import { getDbClient } from './db-client';

async function runStage6Tests() {
  const client = getDbClient();
  await client.connect();

  console.log('================================================================');
  console.log('PREXYON — ETAPA 6: SUÍTE DE TESTES DE USUÁRIOS E PERMISSÕES');
  console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co:5432)');
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

  // IDs de teste isolados
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const ownerUserId = crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const memberUserId = crypto.randomUUID();
  const invitedUserEmail = `invitee-${Date.now()}@prexyon.com`;
  const inviteeUserId = crypto.randomUUID();
  const planId = crypto.randomUUID();

  try {
    // --------------------------------------------------------------------------
    // SETUP: Criar Organizações, Usuários, Assinatura e Membros
    // --------------------------------------------------------------------------
    // 1. Criar Organizações
    await client.query(`INSERT INTO public.organizations (id, trade_name, is_active) VALUES ('${orgAId}', 'Gráfica Alpha Testes', true);`);

    // 2. Criar Usuários no auth.users e profiles
    const ts = Date.now();
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerUserId}', 'carlos-${ts}@test.com'), ('${adminUserId}', 'ana-${ts}@test.com'), ('${memberUserId}', 'roberto-${ts}@test.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerUserId}', 'Carlos Owner', 'carlos-${ts}@test.com'), ('${adminUserId}', 'Ana Admin', 'ana-${ts}@test.com'), ('${memberUserId}', 'Roberto Member', 'roberto-${ts}@test.com');`);

    await client.query('INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, $3, $4, $5);', [orgAId, ownerUserId, 'owner', true, false]);
    await client.query('INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, $3, $4, $5);', [orgAId, adminUserId, 'admin', true, false]);
    await client.query('INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, $3, $4, $5);', [orgAId, memberUserId, 'member', true, false]);

    // 4. Criar Plano e Assinatura com OrçaGraf + ArteFlow para Org A (sem ArteCheck)
    await client.query(`
      INSERT INTO public.prexyon_plans (id, code, name, description, included_users, monthly_price_cents, annual_price_cents, is_active)
      VALUES ('${planId}', 'plano-duo-${ts}', 'Plano Duo Teste (Isolado)', 'Plano Duo de Testes Stage 6', 5, 9900, 99000, false);
    `);

    await client.query(`
      INSERT INTO public.prexyon_plan_products (plan_id, product_code)
      VALUES ('${planId}', 'orcagraf'), ('${planId}', 'arteflow')
      ON CONFLICT DO NOTHING;
    `);

    await client.query(`
      INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES ('${orgAId}', '${planId}', 'active', now(), now() + interval '30 days');
    `);

    // Conceder acesso inicial ao OrçaGraf para o owner e member
    await client.query(`
      INSERT INTO public.organization_member_product_access (organization_id, user_id, product_key, is_enabled)
      VALUES ('${orgAId}', '${memberUserId}', 'orcagraf', true);
    `);

    // ==========================================================================
    // TESTE A: Owner consegue visualizar membros
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "owner@prexyon.com"}';`);
    const resMembers = await client.query(`SELECT public.prexyon_get_organization_members_full('${orgAId}') as members;`);
    const memberList = resMembers.rows[0].members;
    assert(
      Array.isArray(memberList) && memberList.length === 3,
      'Teste A: Owner consegue visualizar membros da organização',
      'Array com 3 membros',
      `Array com ${memberList?.length} membros`
    );

    // ==========================================================================
    // TESTE B: Member comum não consegue visualizar administração de outra org
    // ==========================================================================
    await client.query(`INSERT INTO public.organizations (id, trade_name, is_active) VALUES ('${orgBId}', 'Gráfica Beta Isolamento', true);`);
    await client.query(`SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "member@prexyon.com"}';`);
    let memberForbidden = false;
    try {
      await client.query(`SELECT public.prexyon_get_organization_members_full('${orgBId}') as members;`);
    } catch (err: any) {
      memberForbidden = err.message.includes('UNAUTHORIZED') || err.code === '42501';
    }
    assert(
      memberForbidden,
      'Teste B: Member não consegue acessar membros de organização que não pertence (403)',
      'Exceção UNAUTHORIZED (42501)',
      memberForbidden ? 'Bloqueado com 42501' : 'Falhou: permitiu leitura'
    );

    // ==========================================================================
    // TESTE C: Owner consegue convidar usuário com produtos válidos
    // ==========================================================================
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${inviteeUserId}', '${invitedUserEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${inviteeUserId}', 'Convidado Aceite', '${invitedUserEmail}');`);

    await client.query(`SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "owner@prexyon.com"}';`);
    const inviteHash = crypto.createHash('sha256').update(`token-${Date.now()}`).digest('hex');
    const inviteRes = await client.query(`
      SELECT public.prexyon_invite_user(
        '${orgAId}',
        '${invitedUserEmail}',
        'member',
        ARRAY['orcagraf']::text[],
        '{"orcagraf": ["orcagraf.view", "orcagraf.quotes.view"]}'::jsonb,
        '${inviteHash}'
      ) as result;
    `);
    const inv = inviteRes.rows[0].result;
    assert(
      inv && inv.email === invitedUserEmail && inv.role === 'member',
      'Teste C: Owner convida usuário com sucesso gerando convite transacional',
      `email = ${invitedUserEmail}, role = member`,
      `email = ${inv?.email}, role = ${inv?.role}`
    );

    // ==========================================================================
    // TESTE D: Admin consegue convidar member
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${adminUserId}", "email": "admin@prexyon.com"}';`);
    const adminInviteHash = crypto.createHash('sha256').update(`token-admin-${Date.now()}`).digest('hex');
    const adminInviteEmail = `invited-by-admin-${Date.now()}@prexyon.com`;
    const adminInviteRes = await client.query(`
      SELECT public.prexyon_invite_user(
        '${orgAId}',
        '${adminInviteEmail}',
        'member',
        ARRAY['orcagraf']::text[],
        '{}'::jsonb,
        '${adminInviteHash}'
      ) as result;
    `);
    assert(
      adminInviteRes.rows[0].result?.role === 'member',
      'Teste D: Admin consegue convidar novo member com sucesso',
      'role = member',
      `role = ${adminInviteRes.rows[0].result?.role}`
    );

    // ==========================================================================
    // TESTE E: Admin NÃO consegue alterar nem remover o Owner
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${adminUserId}", "email": "admin@prexyon.com"}';`);
    let adminModifyOwnerBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_role('${orgAId}', '${ownerUserId}', 'member');
      `);
    } catch (err: any) {
      adminModifyOwnerBlocked = err.message.includes('UNAUTHORIZED') || err.code === '42501';
    }
    assert(
      adminModifyOwnerBlocked,
      'Teste E: Admin não consegue alterar papel nem rebaixar o Owner',
      'Exceção UNAUTHORIZED (42501)',
      adminModifyOwnerBlocked ? 'Bloqueado com sucesso (UNAUTHORIZED)' : 'Falhou: permitiu alteração'
    );

    // ==========================================================================
    // TESTE F: Member NÃO consegue alterar sua própria role
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "member@prexyon.com"}';`);
    let memberElevateBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_role('${orgAId}', '${memberUserId}', 'owner');
      `);
    } catch (err: any) {
      memberElevateBlocked = err.message.includes('UNAUTHORIZED') || err.code === '42501';
    }
    assert(
      memberElevateBlocked,
      'Teste F: Member não consegue elevar o próprio papel para owner/admin',
      'Exceção UNAUTHORIZED (42501)',
      memberElevateBlocked ? 'Bloqueado com sucesso' : 'Falhou: permitiu elevação'
    );

    // ==========================================================================
    // TESTE G: Tentativa Cross-Tenant é estritamente rejeitada
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${adminUserId}", "email": "admin@prexyon.com"}';`);
    let crossTenantBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_invite_user('${orgBId}', 'invasor@prexyon.com', 'admin', ARRAY['orcagraf']::text[]);
      `);
    } catch (err: any) {
      crossTenantBlocked = err.message.includes('UNAUTHORIZED') || err.code === '42501';
    }
    assert(
      crossTenantBlocked,
      'Teste G: Tentativa de operação cross-tenant é rejeitada (Fail-Closed)',
      'Exceção UNAUTHORIZED (42501)',
      crossTenantBlocked ? 'Bloqueado cross-tenant com sucesso' : 'Falhou: permitiu operação em outra org'
    );

    // ==========================================================================
    // TESTE H: Usuário sem acesso explícito ao produto recebe 403 no SSO
    // ==========================================================================
    // memberUserId tem acesso ao orcagraf, mas NÃO ao arteflow
    let ssoNoAccessBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_generate_sso_code('${orgAId}', '${memberUserId}', 'arteflow');
      `);
    } catch (err: any) {
      ssoNoAccessBlocked = err.message.includes('USER_HAS_NO_ACCESS_TO_PRODUCT') || err.message.includes('USER_PRODUCT_ACCESS_DENIED') || err.code === '42501' || err.code === 'P0001';
    }
    assert(
      ssoNoAccessBlocked,
      'Teste H: Usuário sem acesso explícito ao produto recebe 403 no SSO',
      'Exceção USER_HAS_NO_ACCESS_TO_PRODUCT (42501)',
      ssoNoAccessBlocked ? 'Bloqueado com USER_HAS_NO_ACCESS_TO_PRODUCT' : 'Falhou: gerou SSO sem acesso'
    );

    // ==========================================================================
    // TESTE I: Usuário com acesso, mas organização sem entitlement, recebe 403
    // ==========================================================================
    // Org A não possui assinatura de artecheck
    let ssoNoOrgEntitlementBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_generate_sso_code('${orgAId}', '${ownerUserId}', 'artecheck');
      `);
    } catch (err: any) {
      ssoNoOrgEntitlementBlocked = err.message.includes('ORGANIZATION_HAS_NO_ENTITLEMENT_FOR_PRODUCT') || err.message.includes('PRODUCT_NOT_SUBSCRIBED') || err.code === '42501' || err.code === 'P0001';
    }
    assert(
      ssoNoOrgEntitlementBlocked,
      'Teste I: Organização sem entitlement para o produto bloqueia SSO (403)',
      'Exceção ORGANIZATION_HAS_NO_ENTITLEMENT_FOR_PRODUCT (42501)',
      ssoNoOrgEntitlementBlocked ? 'Bloqueado com ORGANIZATION_HAS_NO_ENTITLEMENT_FOR_PRODUCT' : 'Falhou: permitiu SSO'
    );

    // ==========================================================================
    // TESTE J: Usuário e Organização autorizados geram código SSO com sucesso
    // ==========================================================================
    const ssoSuccessRes = await client.query(`
      SELECT public.prexyon_generate_sso_code('${orgAId}', '${memberUserId}', 'orcagraf') as sso;
    `);
    const ssoCode = ssoSuccessRes.rows[0].sso?.code;
    assert(
      ssoCode && (ssoCode.length === 64 || ssoCode.length === 36),
      'Teste J: Usuário e Organização autorizados geram código SSO com sucesso',
      'Código criptográfico gerado com sucesso',
      `Código: ${ssoCode}`
    );

    // ==========================================================================
    // ==========================================================================
    // TESTE K: Usuário desativado não consegue iniciar SSO
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "owner@prexyon.com"}';`);
    await client.query(`SELECT public.prexyon_update_member_status('${orgAId}', '${memberUserId}', false);`);

    let ssoDeactivatedBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code('${orgAId}', '${memberUserId}', 'orcagraf');`);
    } catch (err: any) {
      ssoDeactivatedBlocked = err.message.includes('USER_MEMBERSHIP_INACTIVE') || err.message.includes('MEMBERSHIP_INACTIVE') || err.code === '42501' || err.code === 'P0001';
    }
    assert(
      ssoDeactivatedBlocked,
      'Teste K: Usuário inativo/desativado é bloqueado no SSO (Fail-Closed)',
      'Exceção USER_MEMBERSHIP_INACTIVE (42501)',
      ssoDeactivatedBlocked ? 'Bloqueado com USER_MEMBERSHIP_INACTIVE' : 'Falhou: gerou SSO para usuário inativo'
    );

    // Reativar para os próximos testes
    await client.query(`SELECT public.prexyon_update_member_status('${orgAId}', '${memberUserId}', true);`);

    // ==========================================================================
    // TESTE L: Produto não contratado não pode ser concedido
    // ==========================================================================
    let uncontractedProdBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_access_and_permissions(
          '${orgAId}',
          '${memberUserId}',
          ARRAY['artecheck']::text[],
          '{}'::jsonb
        );
      `);
    } catch (err: any) {
      uncontractedProdBlocked = err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION') || err.code === 'P0003' || err.code === 'P0001';
    }
    assert(
      uncontractedProdBlocked,
      'Teste L: Produto não contratado pela organização não pode ser concedido ao membro',
      'Exceção PRODUCT_NOT_IN_SUBSCRIPTION (P0003)',
      uncontractedProdBlocked ? 'Bloqueado com PRODUCT_NOT_IN_SUBSCRIPTION' : 'Falhou: concedeu produto'
    );

    // ==========================================================================
    // TESTE M & N: Preset aplica conjunto correto de permissões e persiste
    // ==========================================================================
    const comercialPresetPerms = {
      orcagraf: [
        'orcagraf.view',
        'orcagraf.quotes.view',
        'orcagraf.quotes.create',
        'orcagraf.quotes.edit',
        'orcagraf.clients.view',
        'orcagraf.clients.manage',
        'orcagraf.products.view',
      ],
    };

    await client.query(`
      SELECT public.prexyon_update_member_access_and_permissions(
        '${orgAId}',
        '${memberUserId}',
        ARRAY['orcagraf']::text[],
        '${JSON.stringify(comercialPresetPerms)}'::jsonb
      );
    `);

    const permsCheck = await client.query(`
      SELECT count(*) as count 
      FROM public.product_permissions 
      WHERE organization_id = '${orgAId}' AND user_id = '${memberUserId}' AND product_key = 'orcagraf' AND is_granted = true;
    `);
    assert(
      parseInt(permsCheck.rows[0].count, 10) === 7,
      'Teste M & N: Preset Comercial aplicado e 7 permissões persistidas no banco',
      'count = 7',
      `count = ${permsCheck.rows[0].count}`
    );

    // ==========================================================================
    // TESTE O: Personalização após preset persiste corretamente
    // ==========================================================================
    const customizedPerms = {
      orcagraf: [
        ...comercialPresetPerms.orcagraf,
        'orcagraf.quotes.approve',
      ],
    };

    await client.query(`
      SELECT public.prexyon_update_member_access_and_permissions(
        '${orgAId}',
        '${memberUserId}',
        ARRAY['orcagraf']::text[],
        '${JSON.stringify(customizedPerms)}'::jsonb
      );
    `);

    const approvePermCheck = await client.query(`
      SELECT is_granted 
      FROM public.product_permissions 
      WHERE organization_id = '${orgAId}' AND user_id = '${memberUserId}' AND permission_key = 'orcagraf.quotes.approve';
    `);
    assert(
      approvePermCheck.rows[0]?.is_granted === true,
      'Teste O: Personalização individual de permissão após preset persiste com sucesso',
      'is_granted = true para orcagraf.quotes.approve',
      `is_granted = ${approvePermCheck.rows[0]?.is_granted}`
    );

    // ==========================================================================
    // TESTE P: Convite expirado é rejeitado no aceite
    // ==========================================================================
    const expiredTokenHash = crypto.createHash('sha256').update(`expired-${Date.now()}`).digest('hex');
    await client.query(`
      INSERT INTO public.organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
      VALUES ('${orgAId}', '${invitedUserEmail}', 'member', '${expiredTokenHash}', '${ownerUserId}', now() - interval '1 hour');
    `);

    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${invitedUserEmail}"}';`);
    let expiredAcceptBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation('${expiredTokenHash}');`);
    } catch (err: any) {
      expiredAcceptBlocked = err.message.includes('INVITATION_EXPIRED') || err.code === 'P0004';
    }
    assert(
      expiredAcceptBlocked,
      'Teste P: Convite expirado é estritamente rejeitado no aceite',
      'Exceção INVITATION_EXPIRED (P0004)',
      expiredAcceptBlocked ? 'Rejeitado com INVITATION_EXPIRED' : 'Falhou: aceitou convite expirado'
    );

    // ==========================================================================
    // TESTE Q: Aceite legítimo e prevenção contra duplo aceite (Anti-Replay)
    // ==========================================================================
    // 1. Aceitar convite válido criado no Teste C
    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${invitedUserEmail}"}';`);
    const acceptRes = await client.query(`
      SELECT public.prexyon_accept_invitation('${inviteHash}') as result;
    `);
    const acceptedOk = acceptRes.rows[0].result?.success === true || acceptRes.rows[0].result?.accepted === true;

    // 2. Tentar aceitar novamente o mesmo convite
    let doubleAcceptBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation('${inviteHash}');`);
    } catch (err: any) {
      doubleAcceptBlocked = err.message.includes('INVITATION_ALREADY_USED_OR_REVOKED') || err.message.includes('INVITATION_ALREADY_USED') || err.code === 'P0003';
    }
    assert(
      acceptedOk && doubleAcceptBlocked,
      'Teste Q: Convite aceito com sucesso e segunda tentativa rejeitada (Anti-Replay)',
      'Aceito primeira vez e rejeitado com INVITATION_ALREADY_USED na segunda',
      `Primeiro: ${acceptedOk} | Segundo: ${doubleAcceptBlocked ? 'Bloqueado' : 'Permitiu'}`
    );

    // ==========================================================================
    // TESTE R: Convite de uma organização não pode ser usado em outra
    // ==========================================================================
    const orgBTokenHash = crypto.createHash('sha256').update(`orgb-${Date.now()}`).digest('hex');
    await client.query(`
      INSERT INTO public.organization_invitations (organization_id, email, role, token_hash, invited_by)
      VALUES ('${orgBId}', 'user-other@prexyon.com', 'member', '${orgBTokenHash}', '${ownerUserId}');
    `);

    await client.query(`SET request.jwt.claims = '{"sub": "${inviteeUserId}", "email": "${invitedUserEmail}"}';`);
    let emailMismatchBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation('${orgBTokenHash}');`);
    } catch (err: any) {
      emailMismatchBlocked = err.message.includes('INVITATION_EMAIL_MISMATCH') || err.message.includes('EMAIL_MISMATCH') || err.code === '42501';
    }
    assert(
      emailMismatchBlocked,
      'Teste R: Convite destinado a outro e-mail/organização é rejeitado (403)',
      'Exceção INVITATION_EMAIL_MISMATCH (42501)',
      emailMismatchBlocked ? 'Bloqueado com INVITATION_EMAIL_MISMATCH' : 'Falhou: permitiu aceite'
    );

    // ==========================================================================
    // TESTE S: Limite de usuários do plano é respeitado
    // ==========================================================================
    // Plano Duo tem included_users = 5. Atualmente temos 4 membros ativos (owner, admin, member, invitee).
    // Adicionar mais 1 membro para atingir 5
    const fillerUserId = crypto.randomUUID();
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${fillerUserId}', 'filler@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${fillerUserId}', 'Filler User', 'filler@prexyon.com');`);
    await client.query('INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ($1, $2, $3, $4);', [orgAId, fillerUserId, 'member', true]);

    // Agora tentar convidar o 6º usuário deve ser rejeitado
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "owner@prexyon.com"}';`);
    let planLimitBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_invite_user('${orgAId}', 'excess@prexyon.com', 'member', ARRAY['orcagraf']::text[]);
      `);
    } catch (err: any) {
      planLimitBlocked = err.message.includes('PLAN_USER_LIMIT_REACHED') || err.code === 'P0002';
    }
    assert(
      planLimitBlocked,
      'Teste S: Limite de usuários/assentos do plano é rigorosamente respeitado no backend',
      'Exceção PLAN_USER_LIMIT_REACHED (P0002)',
      planLimitBlocked ? 'Bloqueado com PLAN_USER_LIMIT_REACHED' : 'Falhou: permitiu ultrapassar limite'
    );

    // ==========================================================================
    // TESTE T: Operações administrativas geram registros de auditoria imutável
    // ==========================================================================
    const auditCountCheck = await client.query(`
      SELECT count(*) as count 
      FROM public.prexyon_audit_logs 
      WHERE organization_id = '${orgAId}';
    `);
    const totalAuditEvents = parseInt(auditCountCheck.rows[0].count, 10);
    assert(
      totalAuditEvents >= 4,
      'Teste T: Alterações de membros, convites e permissões geram audit logs reais',
      'Pelo menos 4 eventos de auditoria registrados',
      `${totalAuditEvents} eventos registrados`
    );

    // --------------------------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------------------------
    await client.query(`DELETE FROM public.organization_invitations WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.product_permissions WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.prexyon_plan_products WHERE plan_id = '${planId}';`);
    await client.query(`DELETE FROM public.prexyon_plans WHERE id = '${planId}';`);
    await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organizations WHERE id IN ('${orgAId}', '${orgBId}');`);
    const cleanupUserIds = [ownerUserId, adminUserId, memberUserId, inviteeUserId, fillerUserId];
    for (const uid of cleanupUserIds) {
      await client.query(`DELETE FROM public.profiles WHERE id = '${uid}';`);
      await client.query(`DELETE FROM auth.users WHERE id = '${uid}';`);
    }

  } finally {
    await client.end();
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES DA ETAPA 6: ${passed + failed}`);
  console.log(`APROVADOS:                  ${passed}`);
  console.log(`REPROVADOS:                 ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

runStage6Tests().catch((err) => {
  console.error('Erro fatal na suíte da Etapa 6:', err);
  process.exitCode = 1;
});
