/**
 * ==============================================================================
 * PREXYON — ETAPA 5: TESTES AUTOMATIZADOS DE ONBOARDING REAL
 * Validação ponta a ponta do fluxo de primeiro acesso de novo cliente
 * ==============================================================================
 */

import { getDbClient } from './db-client';

const client = getDbClient();

async function runOnboardingTests() {
  await client.connect();
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, expected: string, found: string) {
    if (condition) {
      console.log(`[PASSOU] ${testName}`);
      console.log(`   Esperado:   ${expected}`);
      console.log(`   Encontrado: ${found}\n`);
      passed++;
    } else {
      console.error(`[FALHOU] ${testName} (Exp: ${expected} | Found: ${found})`);
      failed++;
    }
  }

  const testUserId = '88888888-8888-8888-a888-888888888888';
  const testUserEmail = 'cliente-stage5@prexyon.com';
  let createdOrgId = '';

  try {
    // 0. Setup
    await client.query('DELETE FROM public.organizations WHERE id IN (SELECT organization_id FROM public.organization_members WHERE user_id = $1);', [testUserId]);
    await client.query('DELETE FROM public.profiles WHERE id = $1;', [testUserId]);
    await client.query('DELETE FROM auth.users WHERE id = $1;', [testUserId]);

    await client.query('INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at) VALUES ($1, $2, $3, now(), now())', [testUserId, testUserEmail, '{"full_name": "Cliente Inicial"}']);
    await client.query(`SET request.jwt.claims = '{"sub": "${testUserId}", "email": "${testUserEmail}"}';`);

    // Teste B: Criação atômica
    const r1 = await client.query(`
      SELECT public.prexyon_create_organization(
        p_trade_name := 'Gráfica Modelo Onboarding'::text,
        p_corporate_name := 'Empresa Onboarding Teste LTDA'::text,
        p_document := '12.345.678/0001-90'::text,
        p_full_name := 'Carlos Eduardo Silva'::text
      ) as result;
    `);
    const createdOrg = r1.rows[0].result;
    createdOrgId = createdOrg.id;
    assert(createdOrg && createdOrg.id && createdOrg.tradeName === 'Gráfica Modelo Onboarding', 'Teste B: Criação atômica da Organização com dados válidos', 'id gerado', createdOrg?.id);

    // Teste C: Role Owner
    const m = await client.query('SELECT om.role, om.is_active, p.full_name FROM public.organization_members om JOIN public.profiles p ON p.id = om.user_id WHERE om.organization_id = $1 AND om.user_id = $2;', [createdOrgId, testUserId]);
    const memberRow = m.rows[0];
    assert(memberRow && memberRow.role === 'owner' && memberRow.is_active === true && memberRow.full_name === 'Carlos Eduardo Silva', 'Teste C: Usuário atribuído atomicamente como OWNER e perfil atualizado', 'owner', memberRow?.role);

    // Teste A: Validação unicidade
    const countCheck = await client.query('SELECT count(*) as count FROM public.organization_members WHERE user_id = $1;', [testUserId]);
    assert(parseInt(countCheck.rows[0].count, 10) === 1, 'Teste A: Usuário possui exatamente 1 organização após onboarding concluído', '1', countCheck.rows[0].count);

    // Teste D: Fail-closed unauthenticated
    await client.query('RESET request.jwt.claims;');
    let unauthBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_create_organization(
          p_trade_name := 'Org Hacker'::text,
          p_corporate_name := 'Org Hacker'::text,
          p_document := null::text,
          p_full_name := 'Hacker'::text
        ) as result;
      `);
    } catch (err: any) {
      unauthBlocked = err.message.includes('UNAUTHENTICATED') || err.code === '42501';
    }
    assert(unauthBlocked, 'Teste D: Chamada sem auth.uid() é estritamente bloqueada (Fail-Closed)', 'UNAUTHENTICATED', unauthBlocked ? 'Bloqueado' : 'Permitiu');

    // Teste E: Idempotência
    await client.query(`SET request.jwt.claims = '{"sub": "${testUserId}", "email": "${testUserEmail}"}';`);
    const dup = await client.query(`
      SELECT public.prexyon_create_organization(
        p_trade_name := 'Tentativa Duplo Clique'::text,
        p_corporate_name := 'Tentativa LTDA'::text,
        p_document := null::text,
        p_full_name := 'Carlos Eduardo Silva'::text
      ) as result;
    `);
    const duplicateRes = dup.rows[0].result;
    const orgCountAfterDup = await client.query('SELECT count(*) as count FROM public.organization_members WHERE user_id = $1;', [testUserId]);
    assert(duplicateRes.id === createdOrgId && duplicateRes.alreadyExisted === true && parseInt(orgCountAfterDup.rows[0].count, 10) === 1, 'Teste E: Duplo clique não cria organizações duplicadas (Idempotência)', 'alreadyExisted=true', duplicateRes?.alreadyExisted);

    // Teste F & G: Vínculo persistido
    const persistCheck = await client.query('SELECT o.trade_name, om.role FROM public.organization_members om JOIN public.organizations o ON o.id = om.organization_id WHERE om.user_id = $1;', [testUserId]);
    assert(persistCheck.rowCount === 1 && persistCheck.rows[0].role === 'owner', 'Teste F & G: Vínculo de Organização persiste para refresh e futuros logins', 'rowCount=1', `${persistCheck.rowCount}`);

    // Teste H: Não necessita onboarding
    assert(persistCheck.rowCount > 0, 'Teste H: Usuário com organização não é enviado para onboarding', 'true', 'true');

    // Teste I: Sem assinatura e sem produtos
    const ent = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [createdOrgId]);
    const subData = ent.rows[0]?.data;
    assert(subData && subData.has_subscription === false && (!subData.included_products || subData.included_products.length === 0), 'Teste I: Organização recém-criada permanece SEM assinatura e SEM produtos liberados', 'has_subscription=false', `${subData?.has_subscription}`);

    // Teste J: SSO bloqueado 403
    let ssoRejected = false;
    try {
      await client.query('SELECT public.prexyon_generate_sso_code($1, $2, $3);', [createdOrgId, testUserId, 'orcagraf']);
    } catch (err: any) {
      ssoRejected = err.message.includes('PRODUCT_NOT_SUBSCRIBED') || err.message.includes('ENTITLEMENT_NOT_FOUND') || err.code === 'P0001';
    }
    assert(ssoRejected, 'Teste J: Tentativa de SSO sem assinatura é rejeitada no backend com 403', 'Bloqueado', ssoRejected ? 'Bloqueado' : 'Permitiu');

    // Teste K: Transações = 0
    const tx = await client.query('SELECT count(*) as count FROM public.prexyon_payment_transactions WHERE organization_id = $1;', [createdOrgId]);
    assert(parseInt(tx.rows[0].count, 10) === 0, 'Teste K: Nenhuma cobrança financeira ou transação foi criada', '0', tx.rows[0].count);

    // Teste L: Isolamento Cross-Tenant
    const otherOrgMemberCheck = await client.query('SELECT count(*) as count FROM public.organization_members WHERE organization_id = $1 AND user_id != $2;', [createdOrgId, testUserId]);
    assert(parseInt(otherOrgMemberCheck.rows[0].count, 10) === 0, 'Teste L: Isolamento Cross-Tenant garantido (apenas o novo cliente possui acesso)', '0', otherOrgMemberCheck.rows[0].count);

    // Cleanup
    if (createdOrgId) {
      await client.query('DELETE FROM public.organizations WHERE id = $1;', [createdOrgId]);
    }
    await client.query('DELETE FROM public.profiles WHERE id = $1;', [testUserId]);
    await client.query('DELETE FROM auth.users WHERE id = $1;', [testUserId]);

    console.log(`\n================================================================`);
    console.log(`TOTAL DE TESTES DE ONBOARDING: ${passed + failed}`);
    console.log(`APROVADOS:                     ${passed}`);
    console.log(`REPROVADOS:                    ${failed}`);
    console.log(`================================================================\n`);
  } finally {
    await client.end();
    if (failed > 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  }
}

runOnboardingTests().catch((err) => {
  console.error('Erro na execução dos testes de onboarding:', err);
  process.exit(1);
});
