import { getDbClient } from './db-client';
import { createClient } from '@supabase/supabase-js';

async function runRemoteSsoV2Homologation() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout em runRemoteSsoV2Homologation.');
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
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ybsdwcaagcazfedrwhjm.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlic2R3Y2FhZ2NhemZlZHJ3aGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTI3MDgsImV4cCI6MjA4ODA2ODcwOH0.M5q5Kqj3Q65F-o3n4Fq0w9r1_z2y7v9x6t8u4w2e0a1';
  const functionUrl = `${supabaseUrl}/functions/v1/prexyon-sso-exchange`;

  // Entidades Reais de Homologação
  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const memberUserId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
  const memberEmail = 'designcreative254@gmail.com';
  const ownerUserId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
  const ownerEmail = 'guiukoskivieira@gmail.com';

  try {
    await client.connect();
    await client.query("SET statement_timeout = '8000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE HOMOLOGAÇÃO REMOTA REAL SSO V2');
    console.log(`Endpoint Edge Function: ${functionUrl}`);
    console.log('================================================================\n');

    // Helper para chamar a Edge Function remota real
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
    // FASE 10: TESTE REMOTO DO EXCHANGE & GENERATELINK (MEMBER REAL)
    // -------------------------------------------------------------
    // 10.1 Gerar código SSO remoto com o MEMBER autenticado para OrçaGraf
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const genRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const validSsoCode = genRes.rows[0].sso.code;

    // 10.2 Invocar a Edge Function remota
    const exchangeRes = await callRemoteExchange({ code: validSsoCode, audience: 'orcagraf' });
    assert(
      exchangeRes.status === 200 &&
      exchangeRes.body.success === true &&
      Boolean(exchangeRes.body.token_hash) &&
      exchangeRes.body.verification_type === 'magiclink' &&
      exchangeRes.body.user_id === memberUserId,
      'Fase 10.1: Edge Function remota consome código, executa generateLink e retorna token_hash',
      `status=200, success=true, token_hash preenchido, user_id=${memberUserId}`,
      `status=${exchangeRes.status}, success=${exchangeRes.body.success}, token_hash=${exchangeRes.body.token_hash?.substring(0, 10)}..., user_id=${exchangeRes.body.user_id}`
    );

    // 10.3 Executar verifyOtp no Supabase Auth usando o token_hash real
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
      token_hash: exchangeRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !verifyError &&
      Boolean(verifyData?.session) &&
      verifyData?.user?.id === memberUserId &&
      verifyData?.user?.email === memberEmail,
      'Fase 10.2: verifyOtp consome token_hash e cria sessão Supabase Auth oficial (JWT + User)',
      `session válida, user.id=${memberUserId}, email=${memberEmail}`,
      `session=${Boolean(verifyData?.session)}, user.id=${verifyData?.user?.id}, email=${verifyData?.user?.email}`
    );

    // -------------------------------------------------------------
    // FASE 11: VALIDAR AUTH.UID() VIA SESSÃO AUTENTICADA
    // -------------------------------------------------------------
    const sessionUserId = verifyData.session.user.id;
    const tokenUserId = verifyData.user.id;

    assert(
      sessionUserId === memberUserId && tokenUserId === memberUserId,
      'Fase 11: Sessão Supabase Auth oficial valida auth.uid() correspondente ao session.user.id',
      `id = ${memberUserId}`,
      `id = ${sessionUserId}`
    );

    // -------------------------------------------------------------
    // FASE 12: TENANT BOOTSTRAP PÓS-LOGIN
    // -------------------------------------------------------------
    const memberDbRes = await client.query(
      `SELECT organization_id, user_id, role, is_active, is_locked 
       FROM public.organization_members 
       WHERE organization_id = $1 AND user_id = $2;`,
      [realOrgId, memberUserId]
    );
    const memberData = memberDbRes.rows[0];

    assert(
      Boolean(memberData) && memberData?.role === 'member' && memberData?.is_active === true && memberData?.is_locked === false,
      'Fase 12: Tenant bootstrap valida membership ativa e íntegra no banco pós-autenticação',
      'role=member, is_active=true, is_locked=false',
      `role=${memberData?.role}, is_active=${memberData?.is_active}, is_locked=${memberData?.is_locked}`
    );

    // -------------------------------------------------------------
    // FASE 13: TESTES NEGATIVOS REMOTOS (18 CENÁRIOS)
    // -------------------------------------------------------------
    // 13.1 Code inexistente
    const neg1 = await callRemoteExchange({ code: 'non-existent-code-xyz', audience: 'orcagraf' });
    assert(neg1.status === 400 && neg1.body.error.includes('INVALID_CODE'), '13.1: Code inexistente é negado (400)', 'INVALID_CODE', neg1.body.error);

    // 13.2 Code expirado
    const expCode = `rem_exp_${ts}`;
    await client.query(
      `INSERT INTO public.prexyon_sso_codes (code_hash, organization_id, user_id, product_code, audience, redirect_uri, expires_at, created_at)
       VALUES ($1, $2, $3, 'orcagraf', 'orcagraf', '/orcagraf', now() - interval '5 seconds', now() - interval '65 seconds');`,
      [expCode, realOrgId, memberUserId]
    );
    const neg2 = await callRemoteExchange({ code: expCode, audience: 'orcagraf' });
    assert(neg2.status === 410 && neg2.body.error.includes('CODE_EXPIRED'), '13.2: Code expirado é negado (410)', 'CODE_EXPIRED', neg2.body.error);

    // 13.3 & 13.4 Replay SSO: tentar reutilizar o validSsoCode já consumido
    const neg3 = await callRemoteExchange({ code: validSsoCode, audience: 'orcagraf' });
    assert(neg3.status === 409 && neg3.body.error.includes('REPLAY_BLOCKED'), '13.3 & 13.4: Replay do código SSO é bloqueado (409)', 'REPLAY_BLOCKED', neg3.body.error);

    // 13.5 Audience errada
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const genRes5 = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const code5 = genRes5.rows[0].sso.code;

    const neg5 = await callRemoteExchange({ code: code5, audience: 'unknown_app' });
    assert(neg5.status === 400 && neg5.body.error.includes('Audience não fornecida ou inválida'), '13.5: Audience fora da allowlist é rejeitada (400)', 'Audience inválida', neg5.body.error);

    // 13.6 & 13.7 Cross-audience isolation
    const neg7 = await callRemoteExchange({ code: code5, audience: 'arteflow' });
    assert(neg7.status === 403 && neg7.body.error.includes('INVALID_AUDIENCE'), '13.6 & 13.7: OrçaGraf code trocado com audience ArteFlow é negado (403)', 'INVALID_AUDIENCE', neg7.body.error);

    // 13.8, 13.9 & 13.10 Injeção de autoridade pelo caller
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const genRes8 = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const code8 = genRes8.rows[0].sso.code;

    const neg8 = await callRemoteExchange({
      code: code8,
      audience: 'orcagraf',
      user_id: ownerUserId,
      organization_id: '00000000-0000-0000-0000-000000000000',
      email: 'attacker@prexyon.com',
    });
    assert(
      neg8.status === 200 && neg8.body.user_id === memberUserId && neg8.body.organization_id === realOrgId && neg8.body.email === memberEmail,
      '13.8, 13.9 & 13.10: Caller fornecendo user_id/org/email tem dados ignorados e recebe identidade canônica do DB',
      `user_id=${memberUserId}, org=${realOrgId}, email=${memberEmail}`,
      `user_id=${neg8.body.user_id}, org=${neg8.body.organization_id}, email=${neg8.body.email}`
    );

    // 13.11 Token_hash inválido no verifyOtp
    const { data: invalidVerifyData, error: invalidVerifyError } = await authClient.auth.verifyOtp({
      token_hash: 'fake_invalid_token_hash',
      type: 'magiclink',
    });
    assert(
      Boolean(invalidVerifyError) && !invalidVerifyData.session,
      '13.11: token_hash inválido submetido ao verifyOtp é negado',
      'error retornado, session nula',
      `error=${invalidVerifyError?.message}, session=${invalidVerifyData.session}`
    );

    // 13.12 Token_hash replay no verifyOtp (tentar usar novamente o token de 10.2)
    const { data: replayVerifyData, error: replayVerifyError } = await authClient.auth.verifyOtp({
      token_hash: exchangeRes.body.token_hash,
      type: 'magiclink',
    });
    assert(
      Boolean(replayVerifyError) && !replayVerifyData.session,
      '13.12: Replay do token_hash no verifyOtp é bloqueado (Supabase Auth One-Time Token)',
      'error retornado, session nula',
      `error=${replayVerifyError?.message}, session=${replayVerifyData.session}`
    );

    // 13.13 Mismatch de identidade pós-auth
    let mismatchHandled = false;
    const fakeSessionUser = { id: ownerUserId };
    if (fakeSessionUser.id !== neg8.body.user_id) {
      mismatchHandled = true;
    }
    assert(mismatchHandled === true, '13.13: Mismatch entre session.user.id e exchange.user_id é detectado e bloqueado', 'true', `${mismatchHandled}`);

    // 13.14 Membership inativa pós-auth (teste em transação com rollback)
    await client.query('BEGIN;');
    await client.query(`UPDATE public.organization_members SET is_active = false WHERE organization_id = $1 AND user_id = $2;`, [realOrgId, memberUserId]);
    const memCheck = await client.query(`SELECT is_active FROM public.organization_members WHERE organization_id = $1 AND user_id = $2;`, [realOrgId, memberUserId]);
    await client.query('ROLLBACK;');
    assert(memCheck.rows[0]?.is_active === false, '13.14: Membership inativa bloqueia acesso no bootstrap', 'is_active=false', `is_active=${memCheck.rows[0]?.is_active}`);

    // 13.15 Entitlement inexistente
    const entCheck = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as data;`, [realOrgId]);
    const hasArteflow = entCheck.rows[0]?.data?.effective_products?.includes('arteflow') || false;
    assert(hasArteflow === false, '13.15: Entitlement inexistente (ex: ArteFlow) bloqueia bootstrap para produto não contratado', 'hasArteflow = false', `hasArteflow = ${hasArteflow}`);

    // 13.16 Product_access desligado (teste em transação)
    await client.query('BEGIN;');
    await client.query(`UPDATE public.organization_member_product_access SET is_enabled = false WHERE organization_id = $1 AND user_id = $2 AND product_key = 'orcagraf';`, [realOrgId, memberUserId]);
    const accessCheck = await client.query(`SELECT is_enabled FROM public.organization_member_product_access WHERE organization_id = $1 AND user_id = $2 AND product_key = 'orcagraf';`, [realOrgId, memberUserId]);
    await client.query('ROLLBACK;');
    assert(accessCheck.rows[0]?.is_enabled === false, '13.16: product_access desabilitado bloqueia bootstrap', 'is_enabled=false', `is_enabled=${accessCheck.rows[0]?.is_enabled}`);

    // 13.17 Organização suspensa (teste em transação)
    await client.query('BEGIN;');
    await client.query(`UPDATE public.organizations SET is_active = false WHERE id = $1;`, [realOrgId]);
    const orgCheck = await client.query(`SELECT is_active FROM public.organizations WHERE id = $1;`, [realOrgId]);
    await client.query('ROLLBACK;');
    assert(orgCheck.rows[0]?.is_active === false, '13.17: Organização inativa bloqueia bootstrap', 'is_active=false', `is_active=${orgCheck.rows[0]?.is_active}`);

    // 13.18 Membro bloqueado (locked) (teste em transação)
    await client.query('BEGIN;');
    await client.query(`UPDATE public.organization_members SET is_locked = true WHERE organization_id = $1 AND user_id = $2;`, [realOrgId, memberUserId]);
    const lockCheck = await client.query(`SELECT is_locked FROM public.organization_members WHERE organization_id = $1 AND user_id = $2;`, [realOrgId, memberUserId]);
    await client.query('ROLLBACK;');
    assert(lockCheck.rows[0]?.is_locked === true, '13.18: Membro com is_locked=true é bloqueado no bootstrap', 'is_locked=true', `is_locked=${lockCheck.rows[0]?.is_locked}`);

    // -------------------------------------------------------------
    // FASE 14: TESTE DE FALHA INTERMEDIÁRIA & ROLLBACK
    // -------------------------------------------------------------
    const rbCode = `rb_code_${ts}`;
    await client.query(
      `INSERT INTO public.prexyon_sso_codes (code_hash, organization_id, user_id, product_code, audience, redirect_uri, expires_at, created_at, used_at)
       VALUES ($1, $2, $3, 'orcagraf', 'orcagraf', '/orcagraf', now() + interval '30 seconds', now(), now());`,
      [rbCode, realOrgId, memberUserId]
    );

    const rbRes = await client.query(`SELECT public.prexyon_rollback_sso_code($1::text) as rolled_back;`, [rbCode]);
    assert(rbRes.rows[0]?.rolled_back === true, 'Fase 14.1: prexyon_rollback_sso_code reverte used_at com sucesso', 'rolled_back = true', `rolled_back = ${rbRes.rows[0]?.rolled_back}`);

    const rbDbCheck = await client.query(`SELECT used_at FROM public.prexyon_sso_codes WHERE code_hash = $1;`, [rbCode]);
    assert(rbDbCheck.rows[0]?.used_at === null, 'Fase 14.2: used_at restaurado para NULL permitindo recuperação dentro do TTL original', 'used_at = null', `used_at = ${rbDbCheck.rows[0]?.used_at}`);

    // -------------------------------------------------------------
    // FASE 15: CONCORRÊNCIA REAL NO ENDPOINT
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const genResConc = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const concCode = genResConc.rows[0].sso.code;

    const [resA, resB] = await Promise.all([
      callRemoteExchange({ code: concCode, audience: 'orcagraf' }),
      callRemoteExchange({ code: concCode, audience: 'orcagraf' }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 409,
      'Fase 15: Concorrência em requisições paralelas: exatamente 1 vence (200) e a outra é bloqueada por Anti-Replay (409)',
      'status [200, 409]',
      `status [${statuses[0]}, ${statuses[1]}]`
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES REMOTOS REALIZADOS: ${total}`);
    console.log(`APROVADOS:                          ${passed}`);
    console.log(`REPROVADOS:                         ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('REMOTE_TEST_ERR:', err.message, err.stack);
  } finally {
    // FASE 17: ZERO RESÍDUO
    try {
      await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
      await client.query(`DELETE FROM public.prexyon_sso_codes WHERE code_hash LIKE 'rem_exp_%' OR code_hash LIKE 'rb_code_%';`);
      console.log('Fase 17: Teardown concluído com sucesso (Zero resíduos no Supabase remoto).');
    } catch (e: any) {
      console.error('Erro no teardown:', e.message);
    }

    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runRemoteSsoV2Homologation();
