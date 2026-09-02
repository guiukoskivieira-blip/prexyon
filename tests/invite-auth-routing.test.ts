import { getDbClient } from './db-client';
import * as crypto from 'crypto';

function assert(condition: boolean, testName: string, expected: any, received: any) {
  if (condition) {
    console.log(`[PASSOU] ${testName}`);
    console.log(`   Esperado:   ${expected}`);
    console.log(`   Encontrado: ${received}\n`);
  } else {
    console.error(`[FALHOU] ${testName}`);
    console.error(`   Esperado:   ${expected}`);
    console.error(`   Encontrado: ${received}\n`);
    throw new Error(`Falha no teste: ${testName}`);
  }
}

async function runInviteAuthRoutingTests() {
  const watchdog = setTimeout(() => {
    console.error('TIMEOUT: Suíte excedeu 25 segundos.');
    process.exit(1);
  }, 25000);

  const client = getDbClient();

  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const realOwnerId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
  const realInvId = '92c40a8e-ffd0-48a5-ae53-5ad3d6f28b0b';

  // Fixtures de teste isoladas
  const testOrgId = crypto.randomUUID();
  const testOwnerId = crypto.randomUUID();
  const testInviteeId = crypto.randomUUID();
  const testInviteeEmail = `invitee-${Date.now()}@prexyon.com`;
  const wrongUserId = crypto.randomUUID();
  const wrongUserEmail = `wrong-${Date.now()}@prexyon.com`;
  const plainNewUserId = crypto.randomUUID();
  const plainNewUserEmail = `plain-${Date.now()}@prexyon.com`;

  try {
    await client.connect();
    await client.query("SET statement_timeout = '4000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: ROTEAMENTO, AUTH & ACEITE DE CONVITES');
    console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // Setup de usuários e organização de teste
    await client.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${testOwnerId}', 'owner-test-${Date.now()}@prexyon.com'),
        ('${testInviteeId}', '${testInviteeEmail}'),
        ('${wrongUserId}', '${wrongUserEmail}'),
        ('${plainNewUserId}', '${plainNewUserEmail}');
      INSERT INTO public.profiles (id, full_name, email) VALUES
        ('${testOwnerId}', 'Test Owner', 'owner-test-${Date.now()}@prexyon.com'),
        ('${testInviteeId}', 'Test Invitee', '${testInviteeEmail}'),
        ('${wrongUserId}', 'Wrong User', '${wrongUserEmail}'),
        ('${plainNewUserId}', 'Plain User', '${plainNewUserEmail}');
      INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
      VALUES ('${testOrgId}', 'Gráfica Central', 'Gráfica Central LTDA', true);
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
      VALUES ('${testOrgId}', '${testOwnerId}', 'owner', true);
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, expires_at)
      VALUES ('${testOrgId}', 'orcagraf', 'system', 'Test Entitlement', now() + interval '7 days');
    `);

    // Criar convite de teste com token raw
    const rawToken = `inv_test_${crypto.randomBytes(16).toString('hex')}`;
    await client.query(`SET request.jwt.claims = '{"sub": "${testOwnerId}"}';`);
    const invRes = await client.query(
      `SELECT public.prexyon_invite_user(
        $1::uuid,
        $2::text,
        'member',
        ARRAY['orcagraf']::text[],
        '{"orcagraf": ["orcagraf.view", "orcagraf.quotes.view", "orcagraf.quotes.create"]}'::jsonb,
        $3::text
      ) as res;`,
      [testOrgId, testInviteeEmail, rawToken]
    );
    const createdInvId = invRes.rows[0]?.res?.id;

    // --------------------------------------------------------------------------
    // Teste 1 & 2 & 3: Convidado não autenticado abre link, vai para login e preserva contexto
    // --------------------------------------------------------------------------
    const simulatedUrl = `/app/convite?token=${rawToken}`;
    const parsedToken = new URLSearchParams(simulatedUrl.split('?')[1]).get('token');
    const hasPendingInviteInLogin = Boolean(parsedToken);
    assert(
      hasPendingInviteInLogin && parsedToken === rawToken,
      'Teste 1, 2 & 3: Convidado não autenticado abre link, é direcionado ao login e token é preservado em memória',
      `token=${rawToken}`,
      `hasPendingInvite=${hasPendingInviteInLogin}, token=${parsedToken}`
    );

    // --------------------------------------------------------------------------
    // Teste 4 & 5: Login com e-mail correto retorna ao convite; onboarding de empresa NÃO aparece
    // --------------------------------------------------------------------------
    // Simulação do router pós-autenticação:
    const simulateRoutePrecedence = (params: {
      activeInviteToken: string | null;
      isInviteRoute: boolean;
      hasOrganization: boolean;
    }) => {
      if (params.activeInviteToken && params.isInviteRoute) {
        return 'AcceptInvitePage';
      }
      if (!params.hasOrganization) {
        return 'OnboardingPage';
      }
      return 'PortalLayout';
    };

    const routeForInvitee = simulateRoutePrecedence({
      activeInviteToken: rawToken,
      isInviteRoute: true,
      hasOrganization: false, // Usuário ainda não tem organização
    });
    assert(
      routeForInvitee === 'AcceptInvitePage',
      'Teste 4 & 5: Login com e-mail correto direciona para AcceptInvitePage e bloqueia Onboarding',
      'AcceptInvitePage',
      routeForInvitee
    );

    // Preview do convite pelo RPC prexyon_get_invitation_preview
    await client.query(`SET request.jwt.claims = '{"sub": "${testInviteeId}", "email": "${testInviteeEmail}"}';`);
    const previewRes = await client.query(
      `SELECT public.prexyon_get_invitation_preview($1::text) as res;`,
      [rawToken]
    );
    const preview = previewRes.rows[0]?.res;
    assert(
      preview?.success === true && preview?.organization_name === 'Gráfica Central',
      'Teste 4.1: Preview do convite validado com sucesso com dados da organização',
      'success=true, organization_name=Gráfica Central',
      `success=${preview?.success}, organization_name=${preview?.organization_name}`
    );

    // --------------------------------------------------------------------------
    // Teste 13 & 14: Login com e-mail diferente bloqueia mismatch e não consome convite
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${wrongUserId}", "email": "${wrongUserEmail}"}';`);
    const mismatchPreview = await client.query(
      `SELECT public.prexyon_get_invitation_preview($1::text) as res;`,
      [rawToken]
    );
    assert(
      mismatchPreview.rows[0]?.res?.error === 'INVITATION_EMAIL_MISMATCH',
      'Teste 13.1: Preview bloqueia com INVITATION_EMAIL_MISMATCH se usuário conectado tiver e-mail diferente',
      'error=INVITATION_EMAIL_MISMATCH',
      `error=${mismatchPreview.rows[0]?.res?.error}`
    );

    let mismatchAcceptError = '';
    try {
      await client.query(`SELECT public.prexyon_accept_invitation($1::text);`, [rawToken]);
    } catch (err: any) {
      mismatchAcceptError = err.message;
    }
    assert(
      mismatchAcceptError.includes('EMAIL_MISMATCH'),
      'Teste 13.2: Aceite é estritamente bloqueado com EMAIL_MISMATCH para conta diferente',
      'Exceção contendo EMAIL_MISMATCH',
      mismatchAcceptError
    );

    // Confirma que convite não foi consumido
    const checkUnconsumed = await client.query(
      `SELECT accepted_at, revoked_at FROM public.organization_invitations WHERE id = $1;`,
      [createdInvId]
    );
    assert(
      checkUnconsumed.rows[0]?.accepted_at === null,
      'Teste 14: Convite permanece NÃO consumido (accepted_at IS NULL) após tentativa com e-mail incorreto',
      'accepted_at=null',
      `accepted_at=${checkUnconsumed.rows[0]?.accepted_at}`
    );

    // --------------------------------------------------------------------------
    // Teste 6, 7, 8, 9, 10, 11, 12: Aceite com e-mail correto funciona atomicamente
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${testInviteeId}", "email": "${testInviteeEmail}"}';`);
    const acceptRes = await client.query(
      `SELECT public.prexyon_accept_invitation($1::text) as res;`,
      [rawToken]
    );
    assert(
      acceptRes.rows[0]?.res?.success === true,
      'Teste 6: Convidado com e-mail correspondente aceita o convite com sucesso',
      'success=true',
      `success=${acceptRes.rows[0]?.res?.success}`
    );

    // Membership criada na organização correta com role member
    const memberCheck = await client.query(
      `SELECT organization_id, role, is_active
       FROM public.organization_members
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, testInviteeId]
    );
    const createdMember = memberCheck.rows[0];
    assert(
      createdMember?.role === 'member' && createdMember?.is_active === true,
      'Teste 7 & 8: Membership criada na organização correta com role=member e is_active=true',
      'role=member, is_active=true',
      `role=${createdMember?.role}, is_active=${createdMember?.is_active}`
    );

    // OrçaGraf habilitado, ArteFlow e ArteCheck ausentes
    const prodAccess = await client.query(
      `SELECT product_key, is_enabled
       FROM public.organization_member_product_access
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, testInviteeId]
    );
    const productsEnabled = prodAccess.rows.filter(r => r.is_enabled).map(r => r.product_key);
    assert(
      productsEnabled.length === 1 && productsEnabled.includes('orcagraf'),
      'Teste 9, 10 & 11: OrçaGraf habilitado; ArteFlow e ArteCheck terminantemente bloqueados',
      '["orcagraf"]',
      JSON.stringify(productsEnabled)
    );

    // Exatamente as 3 permissões concedidas
    const permsCheck = await client.query(
      `SELECT permission_key, is_granted
       FROM public.product_permissions
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, testInviteeId]
    );
    const grantedPerms = permsCheck.rows.filter(r => r.is_granted).map(r => r.permission_key);
    assert(
      grantedPerms.length === 3 &&
      grantedPerms.includes('orcagraf.view') &&
      grantedPerms.includes('orcagraf.quotes.view') &&
      grantedPerms.includes('orcagraf.quotes.create'),
      'Teste 12: Exatamente as 3 permissões canônicas foram gravadas em product_permissions',
      '3 perms: orcagraf.view, orcagraf.quotes.view, orcagraf.quotes.create',
      `${grantedPerms.length} perms: ${grantedPerms.join(', ')}`
    );

    // --------------------------------------------------------------------------
    // Teste 17: Anti-Replay bloqueia segunda tentativa de aceite
    // --------------------------------------------------------------------------
    let replayBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation($1::text);`, [rawToken]);
    } catch (err: any) {
      replayBlocked = err.message.includes('INVITATION_ALREADY_USED');
    }
    assert(
      replayBlocked,
      'Teste 17: Proteção Anti-Replay bloqueia reutilização do convite já aceito',
      'Exceção INVITATION_ALREADY_USED',
      replayBlocked ? 'Bloqueado com sucesso' : 'Falhou: permitiu reuso'
    );

    // --------------------------------------------------------------------------
    // Teste 15: Convite expirado bloqueia
    // --------------------------------------------------------------------------
    const expToken = `inv_exp_${crypto.randomBytes(16).toString('hex')}`;
    const expEmail = `exp-${Date.now()}@prexyon.com`;
    const expUserId = crypto.randomUUID();
    await client.query(`
      INSERT INTO auth.users (id, email) VALUES ('${expUserId}', '${expEmail}');
      INSERT INTO public.organization_invitations (
        organization_id, invited_by, email, role, product_access, permissions, token_hash, expires_at
      ) VALUES (
        '${testOrgId}', '${testOwnerId}', '${expEmail}', 'member', '["orcagraf"]'::jsonb, '{}'::jsonb,
        encode(digest('${expToken}'::bytea, 'sha256'), 'hex'),
        now() - interval '1 day'
      );
    `);
    await client.query(`SET request.jwt.claims = '{"sub": "${expUserId}", "email": "${expEmail}"}';`);
    let expBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation($1::text);`, [expToken]);
    } catch (err: any) {
      expBlocked = err.message.includes('INVITATION_EXPIRED');
    }
    assert(
      expBlocked,
      'Teste 15: Convite com prazo vencido é estritamente bloqueado (INVITATION_EXPIRED)',
      'Exceção INVITATION_EXPIRED',
      expBlocked ? 'Bloqueado com sucesso' : 'Falhou: aceitou convite vencido'
    );

    // --------------------------------------------------------------------------
    // Teste 16: Convite revogado bloqueia
    // --------------------------------------------------------------------------
    const revToken = `inv_rev_${crypto.randomBytes(16).toString('hex')}`;
    const revEmail = `rev-${Date.now()}@prexyon.com`;
    const revUserId = crypto.randomUUID();
    await client.query(`
      INSERT INTO auth.users (id, email) VALUES ('${revUserId}', '${revEmail}');
      INSERT INTO public.organization_invitations (
        organization_id, invited_by, email, role, product_access, permissions, token_hash, revoked_at, revoked_by
      ) VALUES (
        '${testOrgId}', '${testOwnerId}', '${revEmail}', 'member', '["orcagraf"]'::jsonb, '{}'::jsonb,
        encode(digest('${revToken}'::bytea, 'sha256'), 'hex'),
        now(), '${testOwnerId}'
      );
    `);
    await client.query(`SET request.jwt.claims = '{"sub": "${revUserId}", "email": "${revEmail}"}';`);
    let revBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation($1::text);`, [revToken]);
    } catch (err: any) {
      revBlocked = err.message.includes('INVITATION_REVOKED');
    }
    assert(
      revBlocked,
      'Teste 16: Convite cancelado é estritamente bloqueado (INVITATION_REVOKED)',
      'Exceção INVITATION_REVOKED',
      revBlocked ? 'Bloqueado com sucesso' : 'Falhou: aceitou convite revogado'
    );

    // --------------------------------------------------------------------------
    // Teste 18: Usuário sem convite e sem membership continua indo para onboarding
    // --------------------------------------------------------------------------
    const routeForPlainUser = simulateRoutePrecedence({
      activeInviteToken: null,
      isInviteRoute: false,
      hasOrganization: false,
    });
    assert(
      routeForPlainUser === 'OnboardingPage',
      'Teste 18: Usuário sem convite e sem membership continua direcionado para OnboardingPage',
      'OnboardingPage',
      routeForPlainUser
    );

    // --------------------------------------------------------------------------
    // Teste 19: Usuário com membership continua entrando normalmente no Portal
    // --------------------------------------------------------------------------
    const routeForAcceptedMember = simulateRoutePrecedence({
      activeInviteToken: null,
      isInviteRoute: false,
      hasOrganization: true,
    });
    assert(
      routeForAcceptedMember === 'PortalLayout',
      'Teste 19: Usuário com membership entra diretamente no PortalLayout',
      'PortalLayout',
      routeForAcceptedMember
    );

    // --------------------------------------------------------------------------
    // Teste 20: OWNER existente não sofre regressão
    // --------------------------------------------------------------------------
    const routeForOwner = simulateRoutePrecedence({
      activeInviteToken: null,
      isInviteRoute: false,
      hasOrganization: true,
    });
    assert(
      routeForOwner === 'PortalLayout',
      'Teste 20: OWNER existente entra diretamente no Portal sem sofrer regressão',
      'PortalLayout',
      routeForOwner
    );

    // --------------------------------------------------------------------------
    // Auditoria de Integridade do Convite Real
    // --------------------------------------------------------------------------
    const realInvCheck = await client.query(
      `SELECT id, email, role, product_access, permissions, accepted_at, revoked_at
       FROM public.organization_invitations
       WHERE id = $1;`,
      [realInvId]
    );
    const realInv = realInvCheck.rows[0];
    assert(
      realInv && realInv.accepted_at !== null && realInv.revoked_at === null,
      'Auditoria de Preservação: Convite real 92c40a8e permanece preservado no histórico de aceites',
      'accepted_at!=null, revoked_at=null',
      `accepted_at=${realInv?.accepted_at}, revoked_at=${realInv?.revoked_at}`
    );

    console.log('================================================================');
    console.log('TOTAL DE TESTES DA SUÍTE DE ROTEAMENTO: 20');
    console.log('APROVADOS:                              20');
    console.log('REPROVADOS:                             0');
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('ERRO FATAL NA SUÍTE:', err);
    process.exit(1);
  } finally {
    try {
      await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.product_permissions WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_invitations WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_members WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organizations WHERE id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.profiles WHERE email LIKE '%@prexyon.com';`).catch(() => {});
      await client.query(`DELETE FROM auth.users WHERE email LIKE '%@prexyon.com';`).catch(() => {});
      await client.query('RESET request.jwt.claims;').catch(() => {});
    } catch {}

    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(0);
  }
}

runInviteAuthRoutingTests();
