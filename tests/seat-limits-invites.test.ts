import crypto from 'crypto';
import { getDbClient } from './db-client';

function assert(condition: boolean, title: string, expected: string, received: string) {
  if (condition) {
    console.log(`[PASSOU] ${title}`);
    console.log(`   Esperado:   ${expected}`);
    console.log(`   Encontrado: ${received}\n`);
  } else {
    console.error(`[FALHOU] ${title}`);
    console.error(`   Esperado:   ${expected}`);
    console.error(`   Encontrado: ${received}\n`);
    throw new Error(`FALHA_ASSERT: ${title}`);
  }
}

async function runSeatLimitAndInviteSecurityTests() {
  const client = getDbClient();
  let passedCount = 0;
  let failedCount = 0;

  try {
    await client.connect();
    console.log('================================================================');
    console.log('PREXYON — VALIDAÇÃO DE SEAT LIMITS, CONVITES & SEGURANÇA DE TOKEN');
    console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // Fixtures
    const ts = Date.now();
    const orgCommercialId = crypto.randomUUID();
    const orgHomologId = crypto.randomUUID();
    const orgEmptyId = crypto.randomUUID();
    const orgExpiredId = crypto.randomUUID();
    const orgRevokedId = crypto.randomUUID();

    const ownerCommercialId = crypto.randomUUID();
    const ownerHomologId = crypto.randomUUID();
    const ownerEmptyId = crypto.randomUUID();
    const ownerExpiredId = crypto.randomUUID();
    const ownerRevokedId = crypto.randomUUID();
    const member2HomologId = crypto.randomUUID();

    const emailComm = `owner-comm-${ts}@prexyon.com`;
    const emailHomolog = `owner-homolog-${ts}@prexyon.com`;
    const emailEmpty = `owner-empty-${ts}@prexyon.com`;
    const emailExp = `owner-exp-${ts}@prexyon.com`;
    const emailRev = `owner-rev-${ts}@prexyon.com`;
    const emailMem2 = `member2-homolog-${ts}@prexyon.com`;
    const inviteeEmail = `invitee-${ts}@prexyon.com`;

    // 1. Criar organizações e usuários de teste
    await client.query(`
      INSERT INTO public.organizations (id, trade_name, is_active) VALUES
      ('${orgCommercialId}', 'Org Comercial 3 Seats', true),
      ('${orgHomologId}', 'Org Homolog 2 Seats', true),
      ('${orgEmptyId}', 'Org Sem Acesso', true),
      ('${orgExpiredId}', 'Org Homolog Expirada', true),
      ('${orgRevokedId}', 'Org Homolog Revogada', true);
    `);

    await client.query(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${ownerCommercialId}', '${emailComm}', '{"full_name":"Owner Comm"}'),
      ('${ownerHomologId}', '${emailHomolog}', '{"full_name":"Owner Homolog"}'),
      ('${ownerEmptyId}', '${emailEmpty}', '{"full_name":"Owner Empty"}'),
      ('${ownerExpiredId}', '${emailExp}', '{"full_name":"Owner Exp"}'),
      ('${ownerRevokedId}', '${emailRev}', '{"full_name":"Owner Rev"}'),
      ('${member2HomologId}', '${emailMem2}', '{"full_name":"Member 2"}');
    `);

    await client.query(`
      INSERT INTO public.profiles (id, full_name, email) VALUES
      ('${ownerCommercialId}', 'Owner Comm', '${emailComm}'),
      ('${ownerHomologId}', 'Owner Homolog', '${emailHomolog}'),
      ('${ownerEmptyId}', 'Owner Empty', '${emailEmpty}'),
      ('${ownerExpiredId}', 'Owner Exp', '${emailExp}'),
      ('${ownerRevokedId}', 'Owner Rev', '${emailRev}'),
      ('${member2HomologId}', 'Member 2', '${emailMem2}');
    `);

    await client.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES
      ('${orgCommercialId}', '${ownerCommercialId}', 'owner', true),
      ('${orgHomologId}', '${ownerHomologId}', 'owner', true),
      ('${orgEmptyId}', '${ownerEmptyId}', 'owner', true),
      ('${orgExpiredId}', '${ownerExpiredId}', 'owner', true),
      ('${orgRevokedId}', '${ownerRevokedId}', 'owner', true);
    `);

    // Setup A: Comercial com plano de 3 seats (plano intermediário ou standard)
    const planRes = await client.query(`SELECT id, included_users FROM public.prexyon_plans WHERE included_users = 3 LIMIT 1;`);
    const plan3Id = planRes.rows[0]?.id;
    if (plan3Id) {
      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status)
        VALUES ('${orgCommercialId}', '${plan3Id}', 'active');
      `);
    }

    // Setup B: Homologação ativa
    await client.query(`
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, expires_at)
      VALUES ('${orgHomologId}', 'orcagraf', 'system', 'Teste seat homolog', now() + interval '7 days');
    `);

    // Setup D: Homologação expirada
    await client.query(`
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, created_at, expires_at)
      VALUES ('${orgExpiredId}', 'orcagraf', 'system', 'Teste expirado', now() - interval '10 days', now() - interval '1 day');
    `);

    // Setup E: Homologação revogada
    await client.query(`
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, revoked_at, expires_at)
      VALUES ('${orgRevokedId}', 'orcagraf', 'system', 'Teste revogado', now() - interval '1 hour', now() + interval '7 days');
    `);

    // ==========================================================================
    // TESTE 1: Assinatura Comercial com 3 seats -> Regra Comercial funciona
    // ==========================================================================
    if (plan3Id) {
      await client.query(`SET request.jwt.claims = '{"sub": "${ownerCommercialId}", "email": "${emailComm}", "role": "authenticated"}';`);
      const inv1 = await client.query(`
        SELECT public.prexyon_invite_user(
          '${orgCommercialId}',
          'comm-user2@prexyon.com',
          'member',
          ARRAY['orcagraf'],
          '{}'::jsonb,
          null
        ) as res;
      `);
      assert(
        inv1.rows[0].res.id !== null,
        'Teste 1: Assinatura comercial permite convidar até o limite comercial (3 seats)',
        'Sucesso na emissão do convite',
        `Convite emitido id=${inv1.rows[0].res.id}`
      );
      passedCount++;
    }

    // ==========================================================================
    // TESTE 2: Homologação Ativa + 1 OWNER -> Pode criar exatamente 1 convite
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerHomologId}", "email": "${emailHomolog}", "role": "authenticated"}';`);
    const invHomologRes = await client.query(`
      SELECT public.prexyon_invite_user(
        '${orgHomologId}',
        '${inviteeEmail}',
        'member',
        ARRAY['orcagraf'],
        '{"orcagraf": ["orcagraf.view", "orcagraf.quotes.view", "orcagraf.quotes.create"]}'::jsonb,
        null
      ) as res;
    `);
    const invitePayload = invHomologRes.rows[0].res;
    assert(
      invitePayload.id !== null && invitePayload.token !== undefined && invitePayload.token_hash !== undefined,
      'Teste 2: Homologação ativa com 1 OWNER permite convidar exatamente o 2º usuário (MEMBER)',
      'id preenchido, token raw gerado e token_hash gerado',
      `id=${invitePayload.id}, token=${invitePayload.token.substring(0, 10)}..., hash=${invitePayload.token_hash.substring(0, 10)}...`
    );
    passedCount++;

    // ==========================================================================
    // TESTE 3: Homologação Ativa + 2 Usuários Ativos -> 3º Bloqueado (HOMOLOGATION_USER_LIMIT_REACHED)
    // ==========================================================================
    // Simular que o 2º usuário já é membro ativo na organização
    await client.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
      VALUES ('${orgHomologId}', '${member2HomologId}', 'member', true);
    `);

    let thirdUserBlocked = false;
    let thirdUserError = '';
    try {
      await client.query(`
        SELECT public.prexyon_invite_user(
          '${orgHomologId}',
          'third-user@prexyon.com',
          'member',
          ARRAY['orcagraf'],
          '{}'::jsonb,
          null
        );
      `);
    } catch (err: any) {
      thirdUserBlocked = err.message.includes('HOMOLOGATION_USER_LIMIT_REACHED') || err.code === 'P0002';
      thirdUserError = err.message;
    }
    assert(
      thirdUserBlocked,
      'Teste 3: Homologação ativa com 2 usuários ativos bloqueia estritamente o 3º usuário (HOMOLOGATION_USER_LIMIT_REACHED)',
      'HOMOLOGATION_USER_LIMIT_REACHED (P0002)',
      thirdUserError
    );
    passedCount++;

    // ==========================================================================
    // TESTE 4: Sem Assinatura + Sem Homologação -> Convite Bloqueado (Fail-Closed)
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerEmptyId}", "email": "${emailEmpty}", "role": "authenticated"}';`);
    let emptyOrgBlocked = false;
    let emptyOrgError = '';
    try {
      await client.query(`
        SELECT public.prexyon_invite_user(
          '${orgEmptyId}',
          'someone@prexyon.com',
          'member',
          ARRAY['orcagraf'],
          '{}'::jsonb,
          null
        );
      `);
    } catch (err: any) {
      emptyOrgBlocked = err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION') || err.code === 'P0001';
      emptyOrgError = err.message;
    }
    assert(
      emptyOrgBlocked,
      'Teste 4: Organização sem assinatura e sem homologação tem emissão de convites estritamente negada (Fail-Closed)',
      'PRODUCT_NOT_IN_SUBSCRIPTION (P0001)',
      emptyOrgError
    );
    passedCount++;

    // ==========================================================================
    // TESTE 5: Entitlement de Homologação Expirado -> Convite Bloqueado
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerExpiredId}", "email": "${emailExp}", "role": "authenticated"}';`);
    let expOrgBlocked = false;
    let expOrgError = '';
    try {
      await client.query(`
        SELECT public.prexyon_invite_user(
          '${orgExpiredId}',
          'someone@prexyon.com',
          'member',
          ARRAY['orcagraf'],
          '{}'::jsonb,
          null
        );
      `);
    } catch (err: any) {
      expOrgBlocked = err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION') || err.code === 'P0001';
      expOrgError = err.message;
    }
    assert(
      expOrgBlocked,
      'Teste 5: Organização com homologação expirada é bloqueada de emitir novos convites',
      'PRODUCT_NOT_IN_SUBSCRIPTION (P0001)',
      expOrgError
    );
    passedCount++;

    // ==========================================================================
    // TESTE 6: Entitlement de Homologação Revogado -> Convite Bloqueado
    // ==========================================================================
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerRevokedId}", "email": "${emailRev}", "role": "authenticated"}';`);
    let revOrgBlocked = false;
    let revOrgError = '';
    try {
      await client.query(`
        SELECT public.prexyon_invite_user(
          '${orgRevokedId}',
          'someone@prexyon.com',
          'member',
          ARRAY['orcagraf'],
          '{}'::jsonb,
          null
        );
      `);
    } catch (err: any) {
      revOrgBlocked = err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION') || err.code === 'P0001';
      revOrgError = err.message;
    }
    assert(
      revOrgBlocked,
      'Teste 6: Organização com homologação revogada é bloqueada de emitir novos convites',
      'PRODUCT_NOT_IN_SUBSCRIPTION (P0001)',
      revOrgError
    );
    passedCount++;

    // ==========================================================================
    // TESTE 7: Verificação Criptográfica de Token (Raw Token vs SHA-256 no Banco)
    // ==========================================================================
    const dbInviteRow = await client.query(`SELECT * FROM public.organization_invitations WHERE id = '${invitePayload.id}';`);
    const storedHash = dbInviteRow.rows[0]?.token_hash;
    const rawToken = invitePayload.token;
    const computedExpectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    assert(
      storedHash === computedExpectedHash && storedHash !== rawToken,
      'Teste 7: Arquitetura criptográfica de token (Raw Token enviado ao convidado !== SHA-256 armazenado no banco)',
      `stored_hash === sha256(raw_token) e stored_hash !== raw_token`,
      `stored_hash=${storedHash.substring(0, 16)}..., raw_token=${rawToken.substring(0, 16)}...`
    );
    passedCount++;

    // ==========================================================================
    // TESTE 8: Aceite de Convite com Token Raw + Proteção Anti-Replay
    // ==========================================================================
    const newInvitedUserId = crypto.randomUUID();
    await client.query(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${newInvitedUserId}', '${inviteeEmail}', '{"full_name":"Convidado Homolog"}');
    `);
    await client.query(`
      INSERT INTO public.profiles (id, full_name, email)
      VALUES ('${newInvitedUserId}', 'Convidado Homolog', '${inviteeEmail}');
    `);

    // 8.1 Aceite com Token Raw
    await client.query(`SET request.jwt.claims = '{"sub": "${newInvitedUserId}", "email": "${inviteeEmail}", "role": "authenticated"}';`);
    const acceptRes = await client.query(`
      SELECT public.prexyon_accept_invitation('${rawToken}') as res;
    `);
    assert(
      acceptRes.rows[0].res.success === true,
      'Teste 8.1: Convidado aceita convite usando o Token Raw recebido com sucesso',
      'success=true',
      `success=${acceptRes.rows[0].res.success}`
    );
    passedCount++;

    // 8.2 Proteção Anti-Replay (Segunda tentativa)
    let replayBlocked = false;
    let replayError = '';
    try {
      await client.query(`
        SELECT public.prexyon_accept_invitation('${rawToken}') as res;
      `);
    } catch (err: any) {
      replayBlocked = err.message.includes('INVITATION_ALREADY_USED') || err.code === 'P0003';
      replayError = err.message;
    }
    assert(
      replayBlocked,
      'Teste 8.2: Proteção Anti-Replay impede rigorosamente reaproveitar o mesmo token (INVITATION_ALREADY_USED)',
      'INVITATION_ALREADY_USED (P0003)',
      replayError
    );
    passedCount++;

    // ==========================================================================
    // LIMPEZA OBRIGATÓRIA (ROLLBACK DE TODAS AS FIXTURES)
    // ==========================================================================
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id IN ('${orgCommercialId}', '${orgHomologId}', '${orgEmptyId}', '${orgExpiredId}', '${orgRevokedId}');`);
    await client.query(`DELETE FROM public.product_permissions WHERE organization_id IN ('${orgCommercialId}', '${orgHomologId}', '${orgEmptyId}', '${orgExpiredId}', '${orgRevokedId}');`);
    await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id IN ('${orgCommercialId}', '${orgHomologId}', '${orgEmptyId}', '${orgExpiredId}', '${orgRevokedId}');`);
    await client.query(`DELETE FROM public.organization_invitations WHERE organization_id IN ('${orgCommercialId}', '${orgHomologId}', '${orgEmptyId}', '${orgExpiredId}', '${orgRevokedId}');`);
    await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id = '${orgCommercialId}';`);
    await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id IN ('${orgCommercialId}', '${orgHomologId}', '${orgEmptyId}', '${orgExpiredId}', '${orgRevokedId}');`);
    await client.query(`DELETE FROM public.organizations WHERE id IN ('${orgCommercialId}', '${orgHomologId}', '${orgEmptyId}', '${orgExpiredId}', '${orgRevokedId}');`);
    await client.query(`DELETE FROM public.profiles WHERE id IN ('${ownerCommercialId}', '${ownerHomologId}', '${ownerEmptyId}', '${ownerExpiredId}', '${ownerRevokedId}', '${member2HomologId}', '${newInvitedUserId}');`);
    await client.query(`DELETE FROM auth.users WHERE id IN ('${ownerCommercialId}', '${ownerHomologId}', '${ownerEmptyId}', '${ownerExpiredId}', '${ownerRevokedId}', '${member2HomologId}', '${newInvitedUserId}');`);

    // Verificação de limpeza na organização real de homologação
    const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
    const realInvCountRes = await client.query(`SELECT COUNT(*) FROM public.organization_invitations WHERE organization_id = '${realOrgId}';`);
    const realInvCount = parseInt(realInvCountRes.rows[0].count, 10);
    assert(
      realInvCount === 2,
      'Teste 9: Organização real de homologação preserva rigorosamente os convites reais existentes (0 resíduos de teste)',
      '2 convites reais preservados',
      `${realInvCount} convites`
    );
    passedCount++;

    console.log('================================================================');
    console.log(`TOTAL DE TESTES EXECUTADOS: ${passedCount + failedCount}`);
    console.log(`APROVADOS:                  ${passedCount}`);
    console.log(`REPROVADOS:                 ${failedCount}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('ERRO_FATAL_TESTE_SEAT_INVITES:', err);
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

runSeatLimitAndInviteSecurityTests().then(() => process.exit(0)).catch(() => process.exit(1));
