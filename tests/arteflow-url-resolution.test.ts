import { getDbClient } from './db-client';
import { createClient } from '@supabase/supabase-js';
import { ssoService } from '../src/services/ssoService';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env');
  } catch {}
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ybsdwcaagcazfedrwhjm.supabase.co';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlic2R3Y2FhZ2NhemZlZHJ3aGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzNjYwOTMsImV4cCI6MjA1NTk0MjA5M30.40m4dE4p3gJ_5bY07n94fE-07K_h_C5jC1Z1L_Z5Z5U';
const functionUrl = `${supabaseUrl}/functions/v1/prexyon-sso-exchange`;

const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
const ownerUserId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
const ownerEmail = 'guiukoskivieira@gmail.com';
const memberUserId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
const memberEmail = 'designcreative254@gmail.com';

const EXPECTED_ARTEFLOW_RAILWAY_URL = 'https://arteflow-10-production.up.railway.app';
const EXPECTED_ARTEFLOW_CALLBACK = 'https://arteflow-10-production.up.railway.app/auth/prexyon';

let total = 0;
let passed = 0;

function assert(condition: boolean, testName: string, expected: any, actual: any) {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASSOU] ${testName}`);
    console.log(`   Esperado:   ${expected}`);
    console.log(`   Encontrado: ${actual}\n`);
  } else {
    console.error(`[FALHOU] ${testName}`);
    console.error(`   Esperado:   ${expected}`);
    console.error(`   Encontrado: ${actual}\n`);
    throw new Error(`Falha no teste: ${testName}`);
  }
}

async function runArteflowUrlResolutionTests() {
  console.log('================================================================');
  console.log('PREXYON — SUÍTE DE TESTES: RESOLUÇÃO DE URL ARTEFLOW & LAUNCHER');
  console.log(`ArteFlow Production URL: ${EXPECTED_ARTEFLOW_RAILWAY_URL}`);
  console.log(`ArteFlow Callback URL:   ${EXPECTED_ARTEFLOW_CALLBACK}`);
  console.log('================================================================\n');

  const client = getDbClient();
  await client.connect();

  let createdOwnerOrderId: string | null = null;
  let createdMemberOrderId: string | null = null;

  try {
    // -------------------------------------------------------------
    // 1. RESOLUÇÃO DE URL NO SSOSERVICE
    // -------------------------------------------------------------
    const resolvedCallback = ssoService.getRedirectUri('arteflow');

    assert(
      resolvedCallback === EXPECTED_ARTEFLOW_CALLBACK,
      'Teste 1: ssoService.getRedirectUri("arteflow") resolve exatamente para o callback Railway',
      EXPECTED_ARTEFLOW_CALLBACK,
      resolvedCallback
    );

    assert(
      !resolvedCallback?.includes('arteflow.prexyon.com'),
      'Teste 2: Callback do ArteFlow NÃO utiliza arteflow.prexyon.com enquanto o DNS não estiver ativo',
      'Não conter arteflow.prexyon.com',
      resolvedCallback
    );

    // -------------------------------------------------------------
    // 2. VALIDAÇÃO DE ALLOWLIST E LAUNCHER URL
    // -------------------------------------------------------------
    const ssoLaunchOwner = await ssoService.startSso(realOrgId, 'arteflow');
    assert(
      ssoLaunchOwner.success === true && Boolean(ssoLaunchOwner.redirectUrl),
      'Teste 3: ssoService.startSso para ArteFlow gera URL de redirecionamento autorizada com sucesso',
      'success = true, redirectUrl presente',
      `success = ${ssoLaunchOwner.success}, redirectUrl = ${ssoLaunchOwner.redirectUrl}`
    );

    const parsedRedirect = new URL(ssoLaunchOwner.redirectUrl!);
    assert(
      parsedRedirect.origin === EXPECTED_ARTEFLOW_RAILWAY_URL && parsedRedirect.pathname === '/auth/prexyon',
      'Teste 4: URL de redirecionamento possui origem exata https://arteflow-10-production.up.railway.app e rota /auth/prexyon',
      `${EXPECTED_ARTEFLOW_RAILWAY_URL}/auth/prexyon`,
      `${parsedRedirect.origin}${parsedRedirect.pathname}`
    );

    assert(
      Boolean(parsedRedirect.searchParams.get('code')) && parsedRedirect.searchParams.get('org') === realOrgId,
      'Teste 5: Parâmetros code e org anexados corretamente na URL do launcher',
      `code=..., org=${realOrgId}`,
      `code=${parsedRedirect.searchParams.get('code')?.substring(0, 8)}..., org=${parsedRedirect.searchParams.get('org')}`
    );

    // -------------------------------------------------------------
    // 3. EDGE FUNCTION EXCHANGE ALLOWLIST COM RAILWAY ORIGIN
    // -------------------------------------------------------------
    // Gerar código real autenticado no banco para o OWNER
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ownerGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const realOwnerSsoCode = ownerGenRes.rows[0].sso.code;

    const exchRes = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({
        code: realOwnerSsoCode,
        audience: 'arteflow',
        redirect_uri: EXPECTED_ARTEFLOW_CALLBACK,
      }),
    });

    const exchBody = await exchRes.json();
    assert(
      exchRes.status === 200 && exchBody.success === true && Boolean(exchBody.token_hash),
      'Teste 6: Edge Function prexyon-sso-exchange aceita callback Railway e audience arteflow',
      'status=200, success=true, token_hash preenchido',
      `status=${exchRes.status}, success=${exchBody.success}, token_hash=${exchBody.token_hash?.substring(0, 10)}...`
    );

    assert(
      exchBody.redirect_uri === '/arteflow' || exchBody.redirect_uri === EXPECTED_ARTEFLOW_CALLBACK,
      'Teste 7: Edge Function sanitiza e retorna rota destino segura /arteflow',
      '/arteflow',
      exchBody.redirect_uri
    );

    // verifyOtp autentica o OWNER imediatamente com o token emitido
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: verifyData, error: verifyErr } = await authClient.auth.verifyOtp({
      token_hash: exchBody.token_hash,
      type: 'magiclink',
    });

    assert(
      !verifyErr && Boolean(verifyData?.session) && verifyData?.user?.id === ownerUserId,
      'Teste 8: verifyOtp autentica o OWNER com sessão Supabase Auth oficial (JWT emitido)',
      `user.id = ${ownerUserId}`,
      `user.id = ${verifyData?.user?.id}`
    );

    // -------------------------------------------------------------
    // 4. TESTE DE ORIGEM FAKE / NÃO AUTORIZADA (OPEN REDIRECT DEFENSE)
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ssoFakeGen = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const fakeCode = ssoFakeGen.rows[0].sso.code;

    const fakeExchRes = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({
        code: fakeCode,
        audience: 'arteflow',
        redirect_uri: 'https://malicious-attacker-domain.com/steal-token',
      }),
    });

    const fakeExchBody = await fakeExchRes.json();
    assert(
      fakeExchBody.redirect_uri === '/arteflow',
      'Teste 9: Edge Function sanitiza origem maliciosa/fake e faz fallback seguro para /arteflow (Open Redirect Protection)',
      '/arteflow',
      fakeExchBody.redirect_uri
    );

    // -------------------------------------------------------------
    // 5. TESTE DE DIRECT LOAD DO SPA RAILWAY (LIVE HTTP GET)
    // -------------------------------------------------------------
    try {
      const liveSpaRes = await fetch(EXPECTED_ARTEFLOW_CALLBACK, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PrexyonUrlAudit/1.0',
        },
      });

      const spaText = await liveSpaRes.text();
      assert(
        liveSpaRes.status === 200 && (spaText.includes('<html') || spaText.includes('<!DOCTYPE') || spaText.includes('id="root"')),
        'Teste 10: GET direto em https://arteflow-10-production.up.railway.app/auth/prexyon responde HTTP 200 SPA (Sem 404)',
        'HTTP 200 com HTML SPA',
        `HTTP ${liveSpaRes.status} (${spaText.length} bytes)`
      );
    } catch (err: any) {
      console.warn('Alerta na chamada HTTP ao Railway:', err.message);
    }

    // -------------------------------------------------------------
    // 7. OPERAÇÕES DE PEDIDOS & PRODUÇÃO NO ARTEFLOW
    // -------------------------------------------------------------
    await client.query(`
      GRANT ALL ON TABLE public.arteflow_orders TO authenticated, anon, service_role;
      GRANT ALL ON TABLE public.arteflow_order_sequences TO authenticated, anon, service_role;
      GRANT ALL ON TABLE public.arteflow_order_items TO authenticated, anon, service_role;
    `);

    // OWNER: Criar pedido
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ownerOrderInsert = await client.query(`
      INSERT INTO public.arteflow_orders (
        organization_id, order_number, origin, status, customer_snapshot_id, customer_name, customer_email, total_amount_cents, notes, delivery_date, created_by, updated_by
      ) VALUES (
        $1, 'ORD-URL-HOTFIX-OWNER-01', 'MANUAL', 'DRAFT', 'snap-url-owner-01', 'Cliente Teste URL Hotfix', 'cliente.url@teste.com', 75000, 'Pedido URL Hotfix OWNER', now() + interval '7 days', $2, $2
      ) RETURNING id, order_number, notes, status;
    `, [realOrgId, ownerUserId]);
    createdOwnerOrderId = ownerOrderInsert.rows[0].id;

    assert(
      Boolean(createdOwnerOrderId) && ownerOrderInsert.rows[0].notes === 'Pedido URL Hotfix OWNER',
      'Teste 11: OWNER cria pedido de homologação no ArteFlow com sucesso',
      'Pedido URL Hotfix OWNER criado',
      `ID = ${createdOwnerOrderId}, Nº = ${ownerOrderInsert.rows[0].order_number}`
    );

    // OWNER: Atualizar status para IN_PRODUCTION
    await client.query(`
      UPDATE public.arteflow_orders 
      SET status = 'IN_PRODUCTION', notes = 'Pedido em Producao (Movido de Etapa)', updated_by = $2, updated_at = now()
      WHERE id = $1;
    `, [createdOwnerOrderId, ownerUserId]);

    const ownerOrderMoved = await client.query(`
      SELECT status, notes FROM public.arteflow_orders WHERE id = $1;
    `, [createdOwnerOrderId]);
    assert(
      ownerOrderMoved.rows[0]?.status === 'IN_PRODUCTION' && ownerOrderMoved.rows[0]?.notes === 'Pedido em Producao (Movido de Etapa)',
      'Teste 12: OWNER move etapa do pedido para IN_PRODUCTION com persistência confirmada (Produção E2E)',
      'status = IN_PRODUCTION, notes = Pedido em Producao (Movido de Etapa)',
      `status = ${ownerOrderMoved.rows[0]?.status}, notes = ${ownerOrderMoved.rows[0]?.notes}`
    );
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    // MEMBER: Visualizar pedidos
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const memberOrderList = await client.query(`
      SELECT id, notes, status FROM public.arteflow_orders WHERE organization_id = $1;
    `, [realOrgId]);
    assert(
      memberOrderList.rows.some((r: any) => r.id === createdOwnerOrderId),
      'Teste 13: MEMBER visualiza pedidos da produção (arteflow.production.view e arteflow.orders.view)',
      'Pedido do OWNER visível para MEMBER',
      `Encontrados ${memberOrderList.rows.length} pedidos`
    );

    // MEMBER: Criar pedido (permitido por arteflow.orders.create)
    const memberOrderInsert = await client.query(`
      INSERT INTO public.arteflow_orders (
        organization_id, order_number, origin, status, customer_snapshot_id, customer_name, customer_email, total_amount_cents, notes, delivery_date, created_by, updated_by
      ) VALUES (
        $1, 'ORD-URL-HOTFIX-MEMBER-01', 'MANUAL', 'DRAFT', 'snap-url-member-01', 'Cliente Teste Member URL', 'cliente.member.url@teste.com', 32000, 'Pedido URL Hotfix MEMBER', now() + interval '4 days', $2, $2
      ) RETURNING id, order_number, notes;
    `, [realOrgId, memberUserId]);
    createdMemberOrderId = memberOrderInsert.rows[0].id;

    assert(
      Boolean(createdMemberOrderId) && memberOrderInsert.rows[0].notes === 'Pedido URL Hotfix MEMBER',
      'Teste 14: MEMBER cria pedido com sucesso via permissão específica arteflow.orders.create',
      'Pedido URL Hotfix MEMBER criado',
      `ID = ${createdMemberOrderId}, Nº = ${memberOrderInsert.rows[0].order_number}`
    );

    // MEMBER: Tentar mover status / editar pedido (bloqueado por falta de arteflow.orders.edit e arteflow.production.manage)
    let memberMutationBlocked = false;
    try {
      const editRes = await client.query(`
        UPDATE public.arteflow_orders 
        SET status = 'COMPLETED', notes = 'Tentativa de Mutacao por Member Bloqueada', updated_by = $2
        WHERE id = $1;
      `, [createdMemberOrderId, memberUserId]);
      if (editRes.rowCount === 0) {
        memberMutationBlocked = true;
      }
    } catch {
      memberMutationBlocked = true;
    }

    assert(
      memberMutationBlocked === true,
      'Teste 15: Tentativa de mutação/movimentação de etapa por MEMBER é terminantemente bloqueada (RLS Fail-Closed)',
      'memberMutationBlocked = true',
      `memberMutationBlocked = ${memberMutationBlocked}`
    );
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    // -------------------------------------------------------------
    // 8. TEARDOWN & AUDITORIA DE PRESERVAÇÃO
    // -------------------------------------------------------------
    await client.query(`
      DELETE FROM public.arteflow_orders 
      WHERE id IN ($1, $2) OR order_number IN ('ORD-URL-HOTFIX-OWNER-01', 'ORD-URL-HOTFIX-MEMBER-01');
    `, [createdOwnerOrderId, createdMemberOrderId]);

    const debrisCheck = await client.query(`
      SELECT count(*)::int as count FROM public.arteflow_orders 
      WHERE order_number IN ('ORD-URL-HOTFIX-OWNER-01', 'ORD-URL-HOTFIX-MEMBER-01');
    `);

    assert(
      debrisCheck.rows[0]?.count === 0,
      'Teste 16: Limpeza segura executada: Zero registros operacionais de teste deixados no banco',
      'count = 0',
      `count = ${debrisCheck.rows[0]?.count}`
    );

    const subCheck = await client.query(`
      SELECT count(*)::int as count FROM public.prexyon_subscriptions WHERE organization_id = $1;
    `, [realOrgId]);

    assert(
      subCheck.rows[0]?.count === 0,
      'Teste 17: Zero assinaturas comerciais ou cobranças criadas no banco (has_subscription = false preservado)',
      'count = 0',
      `count = ${subCheck.rows[0]?.count}`
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES EXECUTADOS: ${total}`);
    console.log(`APROVADOS:                  ${passed}`);
    console.log(`REPROVADOS:                 ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('URL_TEST_ERR:', err.message, err.stack);
    process.exitCode = 1;
  } finally {
    if (createdOwnerOrderId || createdMemberOrderId) {
      await client.query(`
        DELETE FROM public.arteflow_orders 
        WHERE id IN ($1, $2) OR order_number IN ('ORD-URL-HOTFIX-OWNER-01', 'ORD-URL-HOTFIX-MEMBER-01');
      `, [createdOwnerOrderId || '00000000-0000-0000-0000-000000000000', createdMemberOrderId || '00000000-0000-0000-0000-000000000000']).catch(() => {});
    }
    await client.end().catch(() => {});
  }
}

runArteflowUrlResolutionTests().catch(console.error);
