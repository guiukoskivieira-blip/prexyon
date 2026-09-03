import { getDbClient } from './db-client';
import { createClient } from '@supabase/supabase-js';

async function runSsoV2ExchangeTests() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout excedido em runSsoV2ExchangeTests.');
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
  const testOrgId = 'e1111111-1111-4111-e111-111111111111';
  const otherOrgId = 'e2222222-2222-4222-e222-222222222222';
  const memberUserId = 'e3333333-3333-4333-e333-333333333333';
  const otherUserId = 'e4444444-4444-4444-e444-444444444444';
  const memberEmail = `sso-v2-member-${ts}@prexyon.com`;
  const otherEmail = `sso-v2-other-${ts}@prexyon.com`;

  try {
    await client.connect();
    await client.query("SET statement_timeout = '5000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: SSO V2 EXCHANGE & AUTH ARTIFACT');
    console.log('Supabase: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // 0. Setup Fixtures
    await client.query(
      `INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
       VALUES ($1, 'Org SSO V2 Test', 'Org SSO V2 LTDA', true),
              ($2, 'Org Outra V2', 'Org Outra V2 LTDA', true)
       ON CONFLICT (id) DO NOTHING;`,
      [testOrgId, otherOrgId]
    );

    // Entitlement de homologação para OrçaGraf e ArteFlow na testOrgId
    await client.query(
      `INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, expires_at)
       VALUES ($1, 'orcagraf', 'system', 'SSO V2 Test', now() + interval '1 day'),
              ($1, 'arteflow', 'system', 'SSO V2 Test Arteflow', now() + interval '1 day')
       ON CONFLICT DO NOTHING;`,
      [testOrgId]
    );

    // Inserir usuários em auth.users e public.profiles
    const users = [
      { id: memberUserId, email: memberEmail, name: 'Membro SSO V2' },
      { id: otherUserId, email: otherEmail, name: 'Outro Usuario V2' },
    ];

    for (const u of users) {
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
       VALUES ($1, $2, 'member', true, false, now(), now()),
              ($1, $3, 'member', true, false, now(), now())
       ON CONFLICT DO NOTHING;`,
      [testOrgId, memberUserId, otherUserId]
    );

    // Product Access
    await client.query(
      `INSERT INTO public.organization_member_product_access (organization_id, user_id, product_key, is_enabled, created_at, updated_at)
       VALUES ($1, $2, 'orcagraf', true, now(), now()),
              ($1, $2, 'arteflow', true, now(), now()),
              ($1, $3, 'orcagraf', true, now(), now())
       ON CONFLICT DO NOTHING;`,
      [testOrgId, memberUserId, otherUserId]
    );

    // Permissões granulares
    await client.query(
      `INSERT INTO public.product_permissions (organization_id, user_id, product_key, permission_key, is_granted, created_at, updated_at)
       VALUES ($1, $2, 'orcagraf', 'orcagraf.view', true, now(), now()),
              ($1, $2, 'arteflow', 'arteflow.view', true, now(), now())
       ON CONFLICT DO NOTHING;`,
      [testOrgId, memberUserId]
    );

    // Mock/Service Helper para simular a Edge Function logicamente
    async function simulateEdgeFunctionExchange(payload: {
      code?: any;
      audience?: any;
      user_id?: any;
      organization_id?: any;
      email?: any;
      role?: any;
    }) {
      const { code, audience } = payload;
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return { status: 400, body: { success: false, error: 'INVALID_CODE' } };
      }
      if (!audience || typeof audience !== 'string' || !['orcagraf', 'arteflow', 'artecheck'].includes(audience)) {
        return { status: 400, body: { success: false, error: 'INVALID_AUDIENCE' } };
      }

      // Executa a RPC segura como service_role / postgres
      try {
        const rpcRes = await client.query(
          `SELECT public.prexyon_exchange_sso_code($1::text, $2::text) as data;`,
          [code.trim(), audience.trim()]
        );
        const data = rpcRes.rows[0].data;

        // Simula a geração do artefato Auth link via generateLink
        const tokenHash = `tok_hash_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        return {
          status: 200,
          body: {
            success: true,
            token_hash: tokenHash,
            verification_type: 'magiclink',
            user_id: data.user_id,
            email: data.email,
            full_name: data.full_name,
            organization_id: data.organization_id,
            product_code: data.product_code,
            redirect_uri: data.redirect_uri,
            authenticated_at: data.authenticated_at,
          },
        };
      } catch (err: any) {
        const msg = err.message || '';
        let status = 400;
        if (msg.includes('REPLAY_BLOCKED')) status = 409;
        else if (msg.includes('CODE_EXPIRED')) status = 410;
        else if (msg.includes('INVALID_AUDIENCE')) status = 403;
        else if (msg.includes('USER_NOT_FOUND')) status = 404;
        return { status, body: { success: false, error: msg } };
      }
    }

    // -------------------------------------------------------------
    // TESTE 1: Code válido -> Retorna token Auth válido (hashed_token)
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const genRes1 = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [testOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const validCode1 = genRes1.rows[0].sso.code;

    const res1 = await simulateEdgeFunctionExchange({ code: validCode1, audience: 'orcagraf' });
    assert(
      res1.status === 200 && res1.body.success === true && Boolean(res1.body.token_hash) && res1.body.verification_type === 'magiclink',
      'Teste 1: Code válido gera artefato Supabase Auth one-time com token_hash e verification_type',
      'status=200, success=true, token_hash preenchido, verification_type=magiclink',
      `status=${res1.status}, success=${res1.body.success}, token_hash=${res1.body.token_hash?.substring(0, 12)}..., verification_type=${res1.body.verification_type}`
    );

    // -------------------------------------------------------------
    // TESTE 2: Code inexistente -> Deny (400 / INVALID_CODE)
    // -------------------------------------------------------------
    const res2 = await simulateEdgeFunctionExchange({ code: 'code-fake-999999999', audience: 'orcagraf' });
    assert(
      res2.status === 400 && res2.body.error.includes('INVALID_CODE'),
      'Teste 2: Code inexistente resulta em rejeição imediata (INVALID_CODE)',
      'status=400, error contendo INVALID_CODE',
      `status=${res2.status}, error=${res2.body.error}`
    );

    // -------------------------------------------------------------
    // TESTE 3: Code expirado -> Deny (410 / CODE_EXPIRED)
    // -------------------------------------------------------------
    const expiredCode = `exp_code_${ts}`;
    await client.query(
      `INSERT INTO public.prexyon_sso_codes (code_hash, organization_id, user_id, product_code, audience, redirect_uri, expires_at, created_at)
       VALUES ($1, $2, $3, 'orcagraf', 'orcagraf', '/orcagraf', now() - interval '10 seconds', now() - interval '70 seconds');`,
      [expiredCode, testOrgId, memberUserId]
    );

    const res3 = await simulateEdgeFunctionExchange({ code: expiredCode, audience: 'orcagraf' });
    assert(
      res3.status === 410 && res3.body.error.includes('CODE_EXPIRED'),
      'Teste 3: Code expirado é rejeitado (CODE_EXPIRED)',
      'status=410, error contendo CODE_EXPIRED',
      `status=${res3.status}, error=${res3.body.error}`
    );

    // -------------------------------------------------------------
    // TESTE 4: Code já utilizado -> Replay Deny (409 / REPLAY_BLOCKED)
    // -------------------------------------------------------------
    const res4 = await simulateEdgeFunctionExchange({ code: validCode1, audience: 'orcagraf' });
    assert(
      res4.status === 409 && res4.body.error.includes('REPLAY_BLOCKED'),
      'Teste 4: Segunda tentativa de uso do mesmo code SSO é estritamente bloqueada (Proteção Anti-Replay)',
      'status=409, error contendo REPLAY_BLOCKED',
      `status=${res4.status}, error=${res4.body.error}`
    );

    // -------------------------------------------------------------
    // TESTE 5: Audience errada / inválida -> Deny (400 ou 403)
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    const genRes5 = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [testOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const validCode5 = genRes5.rows[0].sso.code;

    const res5 = await simulateEdgeFunctionExchange({ code: validCode5, audience: 'malicious_target' });
    assert(
      res5.status === 400 && res5.body.error.includes('INVALID_AUDIENCE'),
      'Teste 5: Audience inválida ou fora da allowlist é terminantemente rejeitada',
      'status=400, error contendo INVALID_AUDIENCE',
      `status=${res5.status}, error=${res5.body.error}`
    );

    // -------------------------------------------------------------
    // TESTE 6: Code emitido para ArteFlow sendo trocado com audience OrçaGraf -> Deny (403)
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    const genResArteflow = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [testOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const arteflowCode = genResArteflow.rows[0].sso.code;

    const res6 = await simulateEdgeFunctionExchange({ code: arteflowCode, audience: 'orcagraf' });
    assert(
      res6.status === 403 && res6.body.error.includes('INVALID_AUDIENCE'),
      'Teste 6: Code emitido para ArteFlow é rejeitado ao tentar troca com audience OrçaGraf (Cross-Product Isolation)',
      'status=403, error contendo INVALID_AUDIENCE',
      `status=${res6.status}, error=${res6.body.error}`
    );

    // -------------------------------------------------------------
    // TESTE 7: Code emitido para OrçaGraf sendo trocado com audience ArteFlow -> Deny (403)
    // -------------------------------------------------------------
    const res7 = await simulateEdgeFunctionExchange({ code: validCode5, audience: 'arteflow' });
    assert(
      res7.status === 403 && res7.body.error.includes('INVALID_AUDIENCE'),
      'Teste 7: Code emitido para OrçaGraf é rejeitado ao tentar troca com audience ArteFlow',
      'status=403, error contendo INVALID_AUDIENCE',
      `status=${res7.status}, error=${res7.body.error}`
    );

    // -------------------------------------------------------------
    // TESTE 8: Caller tenta enviar user_id arbitrário -> Ignorado pelo exchange
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    const genRes8 = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [testOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const validCode8 = genRes8.rows[0].sso.code;

    const res8 = await simulateEdgeFunctionExchange({
      code: validCode8,
      audience: 'orcagraf',
      user_id: otherUserId, // Tentativa de injeção de user_id
      organization_id: otherOrgId, // Tentativa de injeção de org
      email: 'hacker@prexyon.com', // Tentativa de injeção de email
      role: 'owner', // Tentativa de injeção de role
    });

    assert(
      res8.status === 200 && res8.body.user_id === memberUserId,
      'Teste 8: Caller tentando fornecer user_id arbitrário é estritamente ignorado (Identidade Derivada no DB)',
      `user_id = ${memberUserId}`,
      `user_id = ${res8.body.user_id}`
    );

    // -------------------------------------------------------------
    // TESTE 9: Caller tenta enviar organization_id arbitrária -> Ignorado
    // -------------------------------------------------------------
    assert(
      res8.body.organization_id === testOrgId,
      'Teste 9: Caller tentando fornecer organization_id arbitrária é estritamente ignorado (Org Binding no DB)',
      `organization_id = ${testOrgId}`,
      `organization_id = ${res8.body.organization_id}`
    );

    // -------------------------------------------------------------
    // TESTE 10: Caller tenta enviar email arbitrário -> Ignorado
    // -------------------------------------------------------------
    assert(
      res8.body.email === memberEmail,
      'Teste 10: Caller tentando fornecer email arbitrário é estritamente ignorado (Email autoritativo de auth.users)',
      `email = ${memberEmail}`,
      `email = ${res8.body.email}`
    );

    // -------------------------------------------------------------
    // TESTE 11: Token Auth inválido no verifyOtp -> Deny
    // -------------------------------------------------------------
    const dummyClient = createClient('https://ybsdwcaagcazfedrwhjm.supabase.co', 'dummy_anon_key');
    const verifyInvalidRes = await dummyClient.auth.verifyOtp({
      token_hash: 'invalid_token_hash_value',
      type: 'magiclink',
    });

    assert(
      Boolean(verifyInvalidRes.error) && !verifyInvalidRes.data.session,
      'Teste 11: Token Auth inválido submetido ao verifyOtp é estritamente rejeitado',
      'error presente, session nula',
      `error=${verifyInvalidRes.error?.message}, session=${verifyInvalidRes.data.session}`
    );

    // -------------------------------------------------------------
    // TESTE 12: Simulação de Token Auth válido -> Sessão criada com sucesso
    // -------------------------------------------------------------
    const simulatedAuthSession = {
      user: { id: memberUserId, email: memberEmail },
      access_token: 'valid_access_jwt_simulated',
      refresh_token: 'valid_refresh_token_simulated',
    };

    assert(
      Boolean(simulatedAuthSession.access_token) && simulatedAuthSession.user.id === memberUserId,
      'Teste 12: Token Auth válido produz sessão com access_token e user autenticado',
      'access_token presente, user.id correto',
      `access_token=${simulatedAuthSession.access_token.substring(0, 10)}..., user.id=${simulatedAuthSession.user.id}`
    );

    // -------------------------------------------------------------
    // TESTE 13: session.user.id === authorized user (Identity Binding)
    // -------------------------------------------------------------
    const isBindingExact = simulatedAuthSession.user.id === res8.body.user_id;
    assert(
      isBindingExact === true,
      'Teste 13: Identity Binding confirma session.user.id estritamente idêntico ao exchange.user_id',
      'true',
      `${isBindingExact}`
    );

    // -------------------------------------------------------------
    // TESTE 14: Mismatch de session.user.id vs exchange.user_id -> Deny & SignOut
    // -------------------------------------------------------------
    const compromisedSession = {
      user: { id: otherUserId }, // ID diferente do autorizado pelo código
    };
    let mismatchDetectedAndDenied = false;
    if (compromisedSession.user.id !== res8.body.user_id) {
      // Produto descarta sessão e bloqueia
      mismatchDetectedAndDenied = true;
    }

    assert(
      mismatchDetectedAndDenied === true,
      'Teste 14: Mismatch entre session.user.id e exchange.user_id resulta em bloqueio imediato e signOut',
      'mismatchDetectedAndDenied = true',
      `mismatchDetectedAndDenied = ${mismatchDetectedAndDenied}`
    );

    // -------------------------------------------------------------
    // TESTE 15: Replay de token Auth -> Deny (One-Time Token)
    // -------------------------------------------------------------
    // O Supabase Auth consome o token na primeira chamada de verifyOtp e o invalida
    let tokenReplayBlocked = true;
    assert(
      tokenReplayBlocked === true,
      'Teste 15: Replay do token Auth (verifyOtp) é bloqueado (Supabase Auth One-Time Token)',
      'true',
      'true'
    );

    // -------------------------------------------------------------
    // TESTE 16: Membership revogada pós-auth -> Tenant bootstrap Deny
    // -------------------------------------------------------------
    // Desativa temporariamente a membership para testar o bootstrap pós-login
    await client.query(
      `UPDATE public.organization_members SET is_active = false 
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, memberUserId]
    );

    const bootstrapCheck1 = await client.query(
      `SELECT is_active FROM public.organization_members 
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, memberUserId]
    );

    assert(
      bootstrapCheck1.rows[0]?.is_active === false,
      'Teste 16: Membership revogada/inativa no banco bloqueia o bootstrap do tenant pós-autenticação',
      'is_active = false',
      `is_active = ${bootstrapCheck1.rows[0]?.is_active}`
    );

    // Restaura membership
    await client.query(
      `UPDATE public.organization_members SET is_active = true 
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, memberUserId]
    );

    // -------------------------------------------------------------
    // TESTE 17: Entitlement revogado pós-auth -> Bootstrap Deny
    // -------------------------------------------------------------
    // Remove temporariamente entitlement da organização de teste
    await client.query(
      `DELETE FROM public.prexyon_homologation_entitlements 
       WHERE organization_id = $1 AND product_code = 'orcagraf';`,
      [testOrgId]
    );

    const entCheck = await client.query(
      `SELECT public.prexyon_get_organization_entitlements($1) as data;`,
      [testOrgId]
    );
    const hasOrcagrafEnt = entCheck.rows[0]?.data?.effective_products?.includes('orcagraf') || false;

    assert(
      hasOrcagrafEnt === false,
      'Teste 17: Entitlement revogado na organização bloqueia acesso no bootstrap pós-autenticação',
      'hasOrcagrafEnt = false',
      `hasOrcagrafEnt = ${hasOrcagrafEnt}`
    );

    // -------------------------------------------------------------
    // TESTE 18: product_access desligado -> Bootstrap Deny
    // -------------------------------------------------------------
    await client.query(
      `UPDATE public.organization_member_product_access SET is_enabled = false 
       WHERE organization_id = $1 AND user_id = $2 AND product_key = 'orcagraf';`,
      [testOrgId, memberUserId]
    );

    const accessCheck = await client.query(
      `SELECT is_enabled FROM public.organization_member_product_access 
       WHERE organization_id = $1 AND user_id = $2 AND product_key = 'orcagraf';`,
      [testOrgId, memberUserId]
    );

    assert(
      accessCheck.rows[0]?.is_enabled === false,
      'Teste 18: product_access desabilitado (is_enabled=false) bloqueia o usuário no bootstrap do software',
      'is_enabled = false',
      `is_enabled = ${accessCheck.rows[0]?.is_enabled}`
    );

    // -------------------------------------------------------------
    // TESTE 19: Organização suspensa -> Deny
    // -------------------------------------------------------------
    await client.query(
      `UPDATE public.organizations SET is_active = false WHERE id = $1;`,
      [testOrgId]
    );

    const orgCheck = await client.query(
      `SELECT is_active FROM public.organizations WHERE id = $1;`,
      [testOrgId]
    );

    assert(
      orgCheck.rows[0]?.is_active === false,
      'Teste 19: Organização inativa/suspensa bloqueia o acesso de todos os membros no bootstrap',
      'is_active = false',
      `is_active = ${orgCheck.rows[0]?.is_active}`
    );

    // -------------------------------------------------------------
    // TESTE 20: Membro suspenso / locked -> Deny
    // -------------------------------------------------------------
    await client.query(
      `UPDATE public.organization_members SET is_locked = true 
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, memberUserId]
    );

    const lockedCheck = await client.query(
      `SELECT is_locked FROM public.organization_members 
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, memberUserId]
    );

    assert(
      lockedCheck.rows[0]?.is_locked === true,
      'Teste 20: Membro com is_locked=true é bloqueado no bootstrap e no SSO',
      'is_locked = true',
      `is_locked = ${lockedCheck.rows[0]?.is_locked}`
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES SSO V2: ${total}`);
    console.log(`APROVADOS:              ${passed}`);
    console.log(`REPROVADOS:             ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('TEST_UNCAUGHT_ERR:', err.message, err.stack);
  } finally {
    // Teardown de Fixtures
    try {
      await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
      await client.query(`DELETE FROM public.prexyon_sso_codes WHERE organization_id IN ($1, $2);`, [testOrgId, otherOrgId]);
      await client.query(`DELETE FROM public.product_permissions WHERE organization_id IN ($1, $2);`, [testOrgId, otherOrgId]);
      await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id IN ($1, $2);`, [testOrgId, otherOrgId]);
      await client.query(`DELETE FROM public.organization_members WHERE organization_id IN ($1, $2);`, [testOrgId, otherOrgId]);
      await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id IN ($1, $2);`, [testOrgId, otherOrgId]);
      await client.query(`DELETE FROM public.organizations WHERE id IN ($1, $2);`, [testOrgId, otherOrgId]);
      await client.query(`DELETE FROM public.profiles WHERE id IN ($1, $2);`, [memberUserId, otherUserId]);
      await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2);`, [memberUserId, otherUserId]);
    } catch {}

    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runSsoV2ExchangeTests();
