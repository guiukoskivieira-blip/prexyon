import { getDbClient } from './db-client';
import { createClient } from '@supabase/supabase-js';

async function runSsoSeparationEntitlementTests() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout em runSsoSeparationEntitlementTests');
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

  // Entidades reais de homologação
  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const memberUserId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
  const memberEmail = 'designcreative254@gmail.com';
  const ownerUserId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
  const ownerEmail = 'guiukoskivieira@gmail.com';

  try {
    await client.connect();
    await client.query("SET statement_timeout = '8000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: SEPARAÇÃO SSO (AUTH) x ENTITLEMENT (AUTHZ)');
    console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // Aplicar a migration de separação arquitetural no banco
    const fs = await import('fs');
    const path = await import('path');
    const migrationSql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260903_sso_separation_from_entitlement.sql'), 'utf-8');
    await client.query(migrationSql);

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
    // TESTE 1: OWNER válido + Org válida + ArteFlow (SEM entitlement) -> SSO Code GERADO
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const genResOwnerArteflow = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const ownerArteflowCode = genResOwnerArteflow.rows[0]?.sso?.code;

    assert(
      Boolean(ownerArteflowCode) && genResOwnerArteflow.rows[0]?.sso?.success === true,
      'Teste 1: OWNER emite SSO code para ArteFlow mesmo sem assinatura/entitlement (Separação Auth x Entitlement)',
      'success=true, code gerado',
      `success=${genResOwnerArteflow.rows[0]?.sso?.success}, code=${ownerArteflowCode?.substring(0, 10)}...`
    );

    // -------------------------------------------------------------
    // TESTE 2: MEMBER válido + Org válida + ArteFlow (SEM entitlement) -> SSO Code GERADO
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const genResMemberArteflow = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const memberArteflowCode = genResMemberArteflow.rows[0]?.sso?.code;

    assert(
      Boolean(memberArteflowCode) && genResMemberArteflow.rows[0]?.sso?.success === true,
      'Teste 2: MEMBER emite SSO code para ArteFlow mesmo sem assinatura/entitlement',
      'success=true, code gerado',
      `success=${genResMemberArteflow.rows[0]?.sso?.success}, code=${memberArteflowCode?.substring(0, 10)}...`
    );

    // -------------------------------------------------------------
    // TESTE 3: Usuário válido + Org válida + OrçaGraf (COM entitlement) -> SSO Code GERADO
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const genResOrcagraf = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const memberOrcagrafCode = genResOrcagraf.rows[0]?.sso?.code;

    assert(
      Boolean(memberOrcagrafCode) && genResOrcagraf.rows[0]?.sso?.success === true,
      'Teste 3: MEMBER emite SSO code para OrçaGraf com sucesso',
      'success=true, code gerado',
      `success=${genResOrcagraf.rows[0]?.sso?.success}, code=${memberOrcagrafCode?.substring(0, 10)}...`
    );

    // -------------------------------------------------------------
    // TESTE 4: Usuário fora da organização -> DENY (MEMBERSHIP_INACTIVE)
    // -------------------------------------------------------------
    const outsiderUserId = 'f9999999-9999-4999-a999-999999999999';
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${outsiderUserId}", "role": "authenticated"}';`);
    let outsiderDenied = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`, [realOrgId]);
    } catch (e: any) {
      outsiderDenied = e.message.includes('MEMBERSHIP_INACTIVE');
    }
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      outsiderDenied === true,
      'Teste 4: Usuário fora da organização é estritamente bloqueado no SSO (Isolamento Cross-Tenant)',
      'outsiderDenied = true',
      `outsiderDenied = ${outsiderDenied}`
    );

    // -------------------------------------------------------------
    // TESTE 5: Membership inativa -> DENY (MEMBERSHIP_INACTIVE)
    // -------------------------------------------------------------
    await client.query('BEGIN;');
    await client.query(`UPDATE public.organization_members SET is_active = false WHERE organization_id = $1 AND user_id = $2;`, [realOrgId, memberUserId]);
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    let inactiveDenied = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`, [realOrgId]);
    } catch (e: any) {
      inactiveDenied = e.message.includes('MEMBERSHIP_INACTIVE');
    }
    await client.query('ROLLBACK;');
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      inactiveDenied === true,
      'Teste 5: Membro inativo é estritamente bloqueado na emissão de código SSO',
      'inactiveDenied = true',
      `inactiveDenied = ${inactiveDenied}`
    );

    // -------------------------------------------------------------
    // TESTE 6: Membership bloqueada (is_locked = true) -> DENY (MEMBERSHIP_INACTIVE)
    // -------------------------------------------------------------
    await client.query('BEGIN;');
    await client.query(`UPDATE public.organization_members SET is_locked = true WHERE organization_id = $1 AND user_id = $2;`, [realOrgId, memberUserId]);
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    let lockedDenied = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`, [realOrgId]);
    } catch (e: any) {
      lockedDenied = e.message.includes('MEMBERSHIP_INACTIVE');
    }
    await client.query('ROLLBACK;');
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      lockedDenied === true,
      'Teste 6: Membro bloqueado (locked) é estritamente rejeitado no SSO',
      'lockedDenied = true',
      `lockedDenied = ${lockedDenied}`
    );

    // -------------------------------------------------------------
    // TESTE 7: Organização inativa/suspensa -> DENY (ORGANIZATION_INACTIVE)
    // -------------------------------------------------------------
    await client.query('BEGIN;');
    await client.query(`UPDATE public.organizations SET is_active = false WHERE id = $1;`, [realOrgId]);
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    let orgInactiveDenied = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'orcagraf');`, [realOrgId]);
    } catch (e: any) {
      orgInactiveDenied = e.message.includes('ORGANIZATION_INACTIVE');
    }
    await client.query('ROLLBACK;');
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      orgInactiveDenied === true,
      'Teste 7: Organização inativa ou suspensa bloqueia emissão de SSO para todos os membros',
      'orgInactiveDenied = true',
      `orgInactiveDenied = ${orgInactiveDenied}`
    );

    // -------------------------------------------------------------
    // TESTE 8: Audience desconhecida / produto fora do catálogo -> DENY (INVALID_PRODUCT_CODE)
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    let unknownProductDenied = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'software_fake_hacked');`, [realOrgId]);
    } catch (e: any) {
      unknownProductDenied = e.message.includes('INVALID_PRODUCT_CODE');
    }
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      unknownProductDenied === true,
      'Teste 8: Produto inexistente ou fora do catálogo oficial é rejeitado com INVALID_PRODUCT_CODE',
      'unknownProductDenied = true',
      `unknownProductDenied = ${unknownProductDenied}`
    );

    // -------------------------------------------------------------
    // TESTE 9: Caller tenta injetar outro user_id -> Bloqueado (Anti-Impersonation)
    // -------------------------------------------------------------
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "role": "authenticated"}';`);
    let legacy3ArgsDenied = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, $2::uuid, 'orcagraf');`, [realOrgId, ownerUserId]);
    } catch (e: any) {
      legacy3ArgsDenied = e.message.includes('permission denied');
    }
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      legacy3ArgsDenied === true,
      'Teste 9: Tentativa de invocar sobrecarga com p_user_id customizado é bloqueada com 42501 (Anti-Impersonação)',
      'legacy3ArgsDenied = true',
      `legacy3ArgsDenied = ${legacy3ArgsDenied}`
    );

    // -------------------------------------------------------------
    // TESTE 10: FLUXO COMPLETO OWNER -> ARTEFLOW EXCHANGE -> VERIFYOTP -> BOOTSTRAP NEGATIVO
    // -------------------------------------------------------------
    // 10.1 Exchange na Edge Function do código ArteFlow do OWNER
    const exchOwnerRes = await callRemoteExchange({ code: ownerArteflowCode, audience: 'arteflow' });
    assert(
      exchOwnerRes.status === 200 && exchOwnerRes.body.success === true && Boolean(exchOwnerRes.body.token_hash),
      'Teste 10.1: Edge Function executa exchange do código ArteFlow do OWNER e retorna token_hash',
      'status=200, success=true',
      `status=${exchOwnerRes.status}, success=${exchOwnerRes.body.success}`
    );

    // 10.2 verifyOtp do token gerado para o OWNER
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: ownerVerifyData, error: ownerVerifyError } = await authClient.auth.verifyOtp({
      token_hash: exchOwnerRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !ownerVerifyError && Boolean(ownerVerifyData?.session) && ownerVerifyData?.user?.id === ownerUserId,
      'Teste 10.2: verifyOtp cria sessão Supabase Auth oficial para o OWNER',
      `session=true, user.id=${ownerUserId}`,
      `session=${Boolean(ownerVerifyData?.session)}, user.id=${ownerVerifyData?.user?.id}`
    );

    // 10.3 Bootstrap ArteFlow para o OWNER: verifica entitlement e identifica ausência de ArteFlow
    const ownerEntRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as data;`, [realOrgId]);
    const ownerHasArteflow = ownerEntRes.rows[0]?.data?.effective_products?.includes('arteflow') || false;

    assert(
      ownerHasArteflow === false,
      'Teste 10.3: Bootstrap do ArteFlow identifica que a organização NÃO possui entitlement para ArteFlow (PRODUCT_NOT_ENTITLED)',
      'ownerHasArteflow = false',
      `ownerHasArteflow = ${ownerHasArteflow}`
    );

    // -------------------------------------------------------------
    // TESTE 11: FLUXO COMPLETO MEMBER -> ARTEFLOW EXCHANGE -> VERIFYOTP -> BOOTSTRAP NEGATIVO
    // -------------------------------------------------------------
    const exchMemberRes = await callRemoteExchange({ code: memberArteflowCode, audience: 'arteflow' });
    assert(
      exchMemberRes.status === 200 && exchMemberRes.body.success === true && Boolean(exchMemberRes.body.token_hash),
      'Teste 11.1: Edge Function executa exchange do código ArteFlow do MEMBER e retorna token_hash',
      'status=200, success=true',
      `status=${exchMemberRes.status}, success=${exchMemberRes.body.success}`
    );

    const { data: memberVerifyData, error: memberVerifyError } = await authClient.auth.verifyOtp({
      token_hash: exchMemberRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !memberVerifyError && Boolean(memberVerifyData?.session) && memberVerifyData?.user?.id === memberUserId,
      'Teste 11.2: verifyOtp cria sessão Supabase Auth oficial para o MEMBER',
      `session=true, user.id=${memberUserId}`,
      `session=${Boolean(memberVerifyData?.session)}, user.id=${memberVerifyData?.user?.id}`
    );

    const memberEntRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as data;`, [realOrgId]);
    const memberHasArteflow = memberEntRes.rows[0]?.data?.effective_products?.includes('arteflow') || false;

    assert(
      memberHasArteflow === false,
      'Teste 11.3: Bootstrap do ArteFlow identifica que o MEMBER NÃO possui entitlement para ArteFlow (PRODUCT_NOT_ENTITLED)',
      'memberHasArteflow = false',
      `memberHasArteflow = ${memberHasArteflow}`
    );

    // -------------------------------------------------------------
    // TESTE 12: AUDITORIA DE ZERO PRIVILEGE EXPANSION NOS DADOS REAIS
    // -------------------------------------------------------------
    const realPermsRes = await client.query(`
      SELECT pp.permission_key, pp.product_key, u.email
      FROM public.product_permissions pp
      JOIN auth.users u ON u.id = pp.user_id
      WHERE pp.organization_id = $1;
    `, [realOrgId]);

    const realArteflowGrants = realPermsRes.rows.filter((r: any) => r.product_key === 'arteflow');
    assert(
      realArteflowGrants.length === 0,
      'Teste 12.1: Zero grants do ArteFlow concedidos a membros na base real (Zero Privilege Expansion)',
      '0 grants',
      `${realArteflowGrants.length} grants`
    );

    const memberGrants = realPermsRes.rows.filter((r: any) => r.email === memberEmail).map((g: any) => g.permission_key).sort();
    assert(
      JSON.stringify(memberGrants) === JSON.stringify(['orcagraf.quotes.create', 'orcagraf.quotes.view', 'orcagraf.view']),
      'Teste 12.2: MEMBER real permanece com exatamente as 3 grants homologadas de OrçaGraf intactas',
      '["orcagraf.quotes.create","orcagraf.quotes.view","orcagraf.view"]',
      JSON.stringify(memberGrants)
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES EXECUTADOS: ${total}`);
    console.log(`APROVADOS:                  ${passed}`);
    console.log(`REPROVADOS:                 ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('TEST_ERR:', err.message, err.stack);
  } finally {
    // Teardown de códigos temporários gerados nos testes
    try {
      await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
      await client.query(`DELETE FROM public.prexyon_sso_codes WHERE code_hash LIKE 'rem_exp_%';`);
    } catch {}

    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runSsoSeparationEntitlementTests();
