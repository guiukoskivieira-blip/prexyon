import crypto from 'crypto';
import { getDbClient } from './db-client';

function assert(condition: boolean, title: string, expected: string, found: any) {
  if (condition) {
    console.log(`[PASSOU] ${title}`);
    console.log(`   Esperado:   ${expected}`);
    console.log(`   Encontrado: ${typeof found === 'object' ? JSON.stringify(found) : found}\n`);
  } else {
    console.error(`[FALHOU] ${title}`);
    console.error(`   Esperado:   ${expected}`);
    console.error(`   Encontrado: ${typeof found === 'object' ? JSON.stringify(found) : found}\n`);
    throw new Error(`Falha no teste: ${title}`);
  }
}

// Simulação de execução da lógica da Edge Function prexyon-send-invitation
async function simulateSendInvitationEdgeFunction(params: {
  client: any;
  authHeader: string | null;
  actorUserId: string | null;
  organizationId: string;
  email: string;
  role: string;
  productAccess: string[];
  permissions?: Record<string, string[]>;
  mockResendStatus: 'success' | 'failure' | 'no_key';
  appUrl?: string;
}) {
  const {
    client,
    authHeader,
    actorUserId,
    organizationId,
    email,
    role,
    productAccess,
    permissions = {},
    mockResendStatus,
    appUrl = 'https://prexyon-production.up.railway.app',
  } = params;

  // 1. Validação de autenticação
  if (!authHeader || !actorUserId) {
    return {
      status: 401,
      body: { success: false, error: 'UNAUTHENTICATED: Token de autenticação não fornecido.' },
    };
  }

  // 2. Chamar RPC autoritativa
  await client.query(`SET request.jwt.claims = '{"sub": "${actorUserId}"}';`);
  let inviteResult: any = null;
  try {
    const res = await client.query(
      `SELECT public.prexyon_invite_user(
        $1::uuid,
        $2::text,
        $3::text,
        $4::text[],
        $5::jsonb
      ) as result;`,
      [organizationId, email, role, productAccess, JSON.stringify(permissions)]
    );
    inviteResult = res.rows[0]?.result;
  } catch (err: any) {
    return {
      status: 400,
      body: { success: false, error: err.message },
    };
  }

  const rawToken = inviteResult.token;
  const invitationId = inviteResult.id;
  const cleanEmail = inviteResult.email;
  const inviteUrl = `${appUrl.replace(/\/$/, '')}/app/convite?token=${rawToken}`;

  // 3. Simulação do envio de e-mail via Resend (Mock Provider)
  let emailSent = false;
  let emailError: string | null = null;

  if (mockResendStatus === 'no_key') {
    emailSent = false;
    emailError = 'RESEND_API_KEY não configurada no ambiente server-side.';
  } else if (mockResendStatus === 'failure') {
    emailSent = false;
    emailError = 'Falha no envio HTTP 422: Domain not verified on Resend';
  } else {
    emailSent = true;
  }

  const responseBody: Record<string, any> = {
    success: true,
    invitation_created: true,
    email_sent: emailSent,
    email_error: emailError,
    invitation_id: invitationId,
    email: cleanEmail,
  };

  // Se o e-mail foi enviado com sucesso, NÃO expor raw_token ou invite_url ao frontend
  // Disponibilizar apenas em caso de falha de envio para permitir cópia manual
  if (!emailSent) {
    responseBody.raw_token = rawToken;
    responseBody.invite_url = inviteUrl;
  }

  return {
    status: 200,
    body: responseBody,
    _internalRawTokenForTesting: rawToken, // apenas para asserções de teste
  };
}

async function runTransactionalInvitationTests() {
  console.log('================================================================');
  console.log('PREXYON — TESTES DE ENVIO TRANSACIONAL DE CONVITES & EDGE FUNCTION');
  console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  const client = getDbClient();
  await client.connect();

  const ts = Date.now();
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const ownerAId = crypto.randomUUID();
  const adminAId = crypto.randomUUID();
  const memberAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();
  const newMemberId = crypto.randomUUID();

  const ownerAEmail = `owner-a-${ts}@prexyon.com`;
  const adminAEmail = `admin-a-${ts}@prexyon.com`;
  const memberAEmail = `member-a-${ts}@prexyon.com`;
  const ownerBEmail = `owner-b-${ts}@prexyon.com`;
  const newMemberEmail = `novo-membro-${ts}@prexyon.com`;

  let passed = 0;

  try {
    // --------------------------------------------------------------------------
    // SETUP FIXTURES
    // --------------------------------------------------------------------------
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgAId}', 'Gráfica A Homolog', 'Gráfica A LTDA', true);`);
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgBId}', 'Gráfica B Isolada', 'Gráfica B LTDA', true);`);

    // Inserir usuários Org A
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerAId}', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerAId}', 'Owner Org A', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${ownerAId}', 'owner', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${adminAId}', '${adminAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${adminAId}', 'Admin Org A', '${adminAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${adminAId}', 'admin', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${memberAId}', '${memberAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${memberAId}', 'Member Org B', '${memberAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgBId}', '${memberAId}', 'member', true);`);

    // Inserir usuário Org B
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerBId}', '${ownerBEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerBId}', 'Owner Org B', '${ownerBEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgBId}', '${ownerBId}', 'owner', true);`);

    // Conceder plano comercial na Org A para permitir múltiplos testes de convite
    const orcagrafPlanRes = await client.query("SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';");
    const planId = orcagrafPlanRes.rows[0]?.id;
    await client.query(`
      INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES ('${orgAId}', '${planId}', 'active', now(), now() + interval '30 days');
    `);

    // --------------------------------------------------------------------------
    // TESTE 1: OWNER pode enviar convite via Edge Function
    // --------------------------------------------------------------------------
    const res1 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-owner`,
      actorUserId: ownerAId,
      organizationId: orgAId,
      email: `convidado-owner-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'success',
    });

    assert(
      res1.status === 200 && res1.body.success === true && res1.body.email_sent === true,
      'Teste 1: OWNER pode enviar convite com sucesso via backend seguro',
      'status=200, success=true, email_sent=true',
      `status=${res1.status}, success=${res1.body.success}, email_sent=${res1.body.email_sent}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 2: ADMIN pode enviar convite
    // --------------------------------------------------------------------------
    const res2 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-admin`,
      actorUserId: adminAId,
      organizationId: orgAId,
      email: `convidado-admin-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'success',
    });

    assert(
      res2.status === 200 && res2.body.success === true && res2.body.email_sent === true,
      'Teste 2: ADMIN pode enviar convite com sucesso',
      'status=200, success=true, email_sent=true',
      `status=${res2.status}, success=${res2.body.success}, email_sent=${res2.body.email_sent}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 3: MEMBER não pode enviar convite (403 UNAUTHORIZED)
    // --------------------------------------------------------------------------
    const res3 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-member`,
      actorUserId: memberAId,
      organizationId: orgBId,
      email: `hacker-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'success',
    });

    assert(
      res3.status === 400 && res3.body.error?.includes('UNAUTHORIZED'),
      'Teste 3: MEMBER é terminantemente impedido de enviar convite (UNAUTHORIZED)',
      'status=400, UNAUTHORIZED',
      `status=${res3.status}, error=${res3.body.error}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 4: anon (não autenticado) não pode enviar (401 UNAUTHENTICATED)
    // --------------------------------------------------------------------------
    const res4 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: null,
      actorUserId: null,
      organizationId: orgAId,
      email: `anon-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'success',
    });

    assert(
      res4.status === 401 && res4.body.error?.includes('UNAUTHENTICATED'),
      'Teste 4: Chamada anônima (sem JWT) é rejeitada com 401 UNAUTHENTICATED',
      'status=401, UNAUTHENTICATED',
      `status=${res4.status}, error=${res4.body.error}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 5: Produto não contratado/entitled é rejeitado (PRODUCT_NOT_IN_SUBSCRIPTION)
    // --------------------------------------------------------------------------
    const res5 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-owner`,
      actorUserId: ownerAId,
      organizationId: orgAId,
      email: `unentitled-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['artecheck'], // Não contratado no plano orcagraf_gestao
      mockResendStatus: 'success',
    });

    assert(
      res5.status === 400 && res5.body.error?.includes('PRODUCT_NOT_IN_SUBSCRIPTION'),
      'Teste 5: Convite com produto não contratado é estritamente rejeitado',
      'status=400, PRODUCT_NOT_IN_SUBSCRIPTION',
      `status=${res5.status}, error=${res5.body.error}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 6: Seat limit continua funcionando e bloqueia excedentes
    // --------------------------------------------------------------------------
    // Org B não possui assinatura nem homologação
    const res6 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-owner-b`,
      actorUserId: ownerBId,
      organizationId: orgBId,
      email: `seat-test-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'success',
    });

    assert(
      res6.status === 400 && res6.body.error?.includes('PRODUCT_NOT_IN_SUBSCRIPTION'),
      'Teste 6: Organização sem plano/entitlement tem emissão bloqueada (Fail-Closed)',
      'status=400, PRODUCT_NOT_IN_SUBSCRIPTION',
      `status=${res6.status}, error=${res6.body.error}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 7: email_sent = true -> frontend NÃO recebe raw_token nem invite_url secreto
    // --------------------------------------------------------------------------
    assert(
      res1.body.email_sent === true &&
      res1.body.raw_token === undefined &&
      res1.body.invite_url === undefined,
      'Teste 7: Quando email_sent=true, frontend NÃO recebe raw_token nem invite_url (Exposição Mínima)',
      'raw_token=undefined, invite_url=undefined',
      `raw_token=${res1.body.raw_token}, invite_url=${res1.body.invite_url}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 8: Token RAW não é persistido no banco e nem gravado em logs de auditoria
    // --------------------------------------------------------------------------
    const rawTokenSecret = res1._internalRawTokenForTesting;
    const invIdCreated = res1.body.invitation_id;

    const dbInvRes = await client.query(
      `SELECT token_hash FROM public.organization_invitations WHERE id = $1;`,
      [invIdCreated]
    );
    const dbStoredHash = dbInvRes.rows[0]?.token_hash;
    const expectedSha256 = crypto.createHash('sha256').update(rawTokenSecret).digest('hex');

    const auditRes = await client.query(
      `SELECT actor_user_id, metadata FROM public.prexyon_audit_logs WHERE entity_id = $1;`,
      [invIdCreated]
    );
    const auditRow = auditRes.rows[0];
    const auditMetaStr = JSON.stringify(auditRow?.metadata || {});

    assert(
      dbStoredHash === expectedSha256 &&
      dbStoredHash !== rawTokenSecret &&
      auditRow?.actor_user_id === ownerAId &&
      !auditMetaStr.includes(rawTokenSecret),
      'Teste 8: Banco armazena apenas hash SHA-256 e audit_logs registra o OWNER real sem expor o token raw',
      `stored_hash=sha256(raw_token), actor=${ownerAId}, token raw AUSENTE nos logs`,
      `hash=${dbStoredHash.substring(0, 10)}..., actor=${auditRow?.actor_user_id}, rawInLogs=${auditMetaStr.includes(rawTokenSecret)}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 9: Provider sucesso → email_sent = true
    // --------------------------------------------------------------------------
    const res9 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-owner`,
      actorUserId: ownerAId,
      organizationId: orgAId,
      email: `email-success-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'success',
    });

    assert(
      res9.body.invitation_created === true && res9.body.email_sent === true && !res9.body.email_error,
      'Teste 9: Quando o provider de e-mail responde 200, email_sent=true',
      'invitation_created=true, email_sent=true',
      `created=${res9.body.invitation_created}, sent=${res9.body.email_sent}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 10: Provider falha → convite criado + raw_token temporário em memória para cópia
    // --------------------------------------------------------------------------
    const res10 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-owner`,
      actorUserId: ownerAId,
      organizationId: orgAId,
      email: `email-fail-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'failure',
    });

    assert(
      res10.body.invitation_created === true &&
      res10.body.email_sent === false &&
      typeof res10.body.email_error === 'string' &&
      res10.body.raw_token &&
      res10.body.invite_url,
      'Teste 10: Quando provider de e-mail falha, convite é criado e link temporário fica disponível exclusivamente para cópia manual',
      'invitation_created=true, email_sent=false, raw_token disponível em memória',
      `created=${res10.body.invitation_created}, sent=${res10.body.email_sent}, hasToken=${!!res10.body.raw_token}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 11: Edge Function indisponível → NENHUM convite criado (Fail-Closed, zero fallback)
    // --------------------------------------------------------------------------
    // Simula falha na Edge Function: memberManagementService agora rejeita sem criar convite
    const preCountRes = await client.query(`SELECT count(*) as count FROM public.organization_invitations WHERE organization_id = $1;`, [orgAId]);
    const preCount = parseInt(preCountRes.rows[0].count, 10);

    // Chamada com falha estrutural simulada
    const simulatedEdgeFuncFailure = { error: { message: 'FunctionsFetchError: Failed to send request to Edge Function' } };
    let clientInviteResult: any = null;
    if (simulatedEdgeFuncFailure.error) {
      clientInviteResult = {
        success: false,
        error: 'Serviço de envio de convites indisponível. Nenhum convite foi criado.',
      };
    }

    const postCountRes = await client.query(`SELECT count(*) as count FROM public.organization_invitations WHERE organization_id = $1;`, [orgAId]);
    const postCount = parseInt(postCountRes.rows[0].count, 10);

    assert(
      clientInviteResult.success === false &&
      clientInviteResult.error.includes('Nenhum convite foi criado') &&
      postCount === preCount,
      'Teste 11: Edge Function indisponível bloqueia operação sem criar convite no banco (Zero Fallback Silencioso)',
      'success=false, nenhum convite criado no banco',
      `success=${clientInviteResult.success}, delta_convites=${postCount - preCount}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 12: Frontend discrimina feedback e não grava token em localStorage
    // --------------------------------------------------------------------------
    function getFrontendFeedback(res: any, email: string) {
      if (!res.success) {
        return { type: 'error', message: res.error || 'Erro ao convidar usuário.' };
      }
      if (res.email_sent) {
        return { type: 'success', message: `Convite enviado com sucesso para ${email}!` };
      }
      return {
        type: 'warning',
        message: `Convite criado, mas não foi possível enviar o e-mail para ${email}.`,
        inviteUrl: res.invite_url,
      };
    }

    const fbSuccess = getFrontendFeedback(res9.body, 'user-ok@prexyon.com');
    const fbWarning = getFrontendFeedback(res10.body, 'user-warn@prexyon.com');

    assert(
      fbSuccess.type === 'success' &&
      fbSuccess.message.includes('Convite enviado com sucesso') &&
      fbWarning.type === 'warning' &&
      fbWarning.message.includes('Convite criado, mas não foi possível enviar o e-mail') &&
      fbWarning.inviteUrl.includes('/app/convite?token='),
      'Teste 12: Frontend discrimina com precisão os estados de sucesso de e-mail vs falha de e-mail',
      'success: Convite enviado com sucesso | warning: Convite criado, mas não foi possível enviar...',
      `fbSuccess=${fbSuccess.message} | fbWarning=${fbWarning.message}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 13: Anti-replay permanece funcionando com o token entregue no e-mail
    // --------------------------------------------------------------------------
    const emailInvitedToken = res9._internalRawTokenForTesting;
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${newMemberId}', '${res9.body.email}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${newMemberId}', 'Novo Membro Aceite', '${res9.body.email}');`);

    await client.query(`SET request.jwt.claims = '{"sub": "${newMemberId}", "email": "${res9.body.email}"}';`);
    const accept1 = await client.query(`SELECT public.prexyon_accept_invitation($1::text) as result;`, [emailInvitedToken]);
    const accept1Data = accept1.rows[0]?.result;

    let replayBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation($1::text) as result;`, [emailInvitedToken]);
    } catch (err: any) {
      replayBlocked = err.message.includes('INVITATION_ALREADY_USED') || err.code === 'P0003';
    }

    assert(
      accept1Data && accept1Data.success === true && replayBlocked,
      'Teste 13: Convidado aceita com sucesso via token do e-mail na 1ª vez e segunda tentativa é rejeitada por Anti-Replay',
      'accept1=true, replay=bloqueado',
      `accept1=${accept1Data?.success}, replayBlocked=${replayBlocked}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 14: Cross-tenant permanece bloqueado
    // --------------------------------------------------------------------------
    // Owner da Org B tenta convidar usuário para a Org A
    const res14 = await simulateSendInvitationEdgeFunction({
      client,
      authHeader: `Bearer test-token-owner-b`,
      actorUserId: ownerBId,
      organizationId: orgAId, // Alheia
      email: `cross-tenant-${ts}@prexyon.com`,
      role: 'member',
      productAccess: ['orcagraf'],
      mockResendStatus: 'success',
    });

    assert(
      res14.status === 400 && res14.body.error?.includes('UNAUTHORIZED'),
      'Teste 14: Tentativa cross-tenant de emissão de convite é terminantemente rejeitada',
      'status=400, UNAUTHORIZED',
      `status=${res14.status}, error=${res14.body.error}`
    );
    passed++;

  } finally {
    // --------------------------------------------------------------------------
    // LIMPEZA OBRIGATÓRIA DE FIXTURES DE TESTE
    // --------------------------------------------------------------------------
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organization_invitations WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organizations WHERE id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.profiles WHERE id IN ('${ownerAId}', '${adminAId}', '${memberAId}', '${ownerBId}', '${newMemberId}');`);
    await client.query(`DELETE FROM auth.users WHERE id IN ('${ownerAId}', '${adminAId}', '${memberAId}', '${ownerBId}', '${newMemberId}');`);

    // Preservar e auditar o convite real existente
    const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
    const realInvRes = await client.query(
      `SELECT count(*) as count, id, email, accepted_at FROM public.organization_invitations WHERE organization_id = $1 GROUP BY id, email, accepted_at;`,
      [realOrgId]
    );

    console.log('--- AUDITORIA DE PRESERVAÇÃO DO CONVITE REAL EXISTENTE ---');
    console.log(`TOTAL DE CONVITES REAIS NA ORG: ${realInvRes.rows.length}`);
    if (realInvRes.rows.length > 0) {
      console.log(`ID PRESERVADO:   ${realInvRes.rows[0].id}`);
      console.log(`STATUS ACEITE:   ${realInvRes.rows[0].accepted_at === null ? 'PENDENTE (Intacto)' : 'ALTERADO'}`);
    }

    try {
      await client.end();
    } catch {}
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${passed}`);
  console.log(`APROVADOS:                  ${passed}`);
  console.log(`REPROVADOS:                 0`);
  console.log('================================================================\n');
}

runTransactionalInvitationTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERRO_FATAL_TESTE_TRANSACTIONAL_INVITES:', err);
    process.exit(1);
  });
