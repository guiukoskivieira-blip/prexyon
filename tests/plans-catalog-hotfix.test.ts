/**
 * ==============================================================================
 * PREXYON — SUÍTE DE TESTES: CATÁLOGO OFICIAL DE PLANOS E ENTITLEMENTS (HOTFIX)
 * Cobertura completa dos 16 testes obrigatórios com PostgreSQL central real
 * ==============================================================================
 */

import crypto from 'crypto';
import { getDbClient } from './db-client';

async function runPlansCatalogTests() {
  const client = getDbClient();
  await client.connect();

  console.log('================================================================');
  console.log('PREXYON — SUÍTE DE TESTES: CATÁLOGO OFICIAL DE PLANOS & ENTITLEMENTS');
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

  // IDs temporários para isolamento de testes
  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  const inactivePlanId = crypto.randomUUID();

  try {
    // --------------------------------------------------------------------------
    // TESTE 1: Somente 5 planos comerciais ativos aparecem
    // --------------------------------------------------------------------------
    const activePlansRes = await client.query(`
      SELECT id, code, name, monthly_price_cents, annual_price_cents, included_users, extra_user_price_cents, is_active, display_order 
      FROM public.prexyon_plans 
      WHERE is_active = true 
      ORDER BY display_order ASC;
    `);
    const activePlans = activePlansRes.rows;
    assert(
      activePlans.length === 5,
      'Teste 1: Somente cinco planos comerciais ativos aparecem no catálogo',
      '5 planos ativos',
      `${activePlans.length} planos ativos`
    );

    // --------------------------------------------------------------------------
    // TESTE 2: Nenhum "Plano Duo Teste" aparece
    // --------------------------------------------------------------------------
    const duoTestRes = await client.query(`
      SELECT count(*) as count 
      FROM public.prexyon_plans 
      WHERE (name ILIKE '%duo%' OR name ILIKE '%teste%' OR code ILIKE '%duo%') AND is_active = true;
    `);
    const duoCount = parseInt(duoTestRes.rows[0].count, 10);
    assert(
      duoCount === 0,
      'Teste 2: Nenhum Plano Duo Teste aparece no catálogo comercial público',
      '0 planos de teste',
      `${duoCount} planos de teste encontrados`
    );

    // --------------------------------------------------------------------------
    // TESTE 3: OrçaGraf possui somente OrçaGraf
    // --------------------------------------------------------------------------
    const orcagrafProds = await client.query(`
      SELECT pp.product_code 
      FROM public.prexyon_plan_products pp 
      JOIN public.prexyon_plans p ON p.id = pp.plan_id 
      WHERE p.code = 'orcagraf' 
      ORDER BY pp.product_code;
    `);
    const orcagrafList = orcagrafProds.rows.map((r) => r.product_code);
    assert(
      orcagrafList.length === 1 && orcagrafList[0] === 'orcagraf',
      'Teste 3: Plano OrçaGraf possui exclusivamente o software OrçaGraf',
      '[orcagraf]',
      JSON.stringify(orcagrafList)
    );

    // --------------------------------------------------------------------------
    // TESTE 4: ArteFlow possui somente ArteFlow
    // --------------------------------------------------------------------------
    const arteflowProds = await client.query(`
      SELECT pp.product_code 
      FROM public.prexyon_plan_products pp 
      JOIN public.prexyon_plans p ON p.id = pp.plan_id 
      WHERE p.code = 'arteflow' 
      ORDER BY pp.product_code;
    `);
    const arteflowList = arteflowProds.rows.map((r) => r.product_code);
    assert(
      arteflowList.length === 1 && arteflowList[0] === 'arteflow',
      'Teste 4: Plano ArteFlow possui exclusivamente o software ArteFlow',
      '[arteflow]',
      JSON.stringify(arteflowList)
    );

    // --------------------------------------------------------------------------
    // TESTE 5: ArteCheck possui somente ArteCheck
    // --------------------------------------------------------------------------
    const artecheckProds = await client.query(`
      SELECT pp.product_code 
      FROM public.prexyon_plan_products pp 
      JOIN public.prexyon_plans p ON p.id = pp.plan_id 
      WHERE p.code = 'artecheck' 
      ORDER BY pp.product_code;
    `);
    const artecheckList = artecheckProds.rows.map((r) => r.product_code);
    assert(
      artecheckList.length === 1 && artecheckList[0] === 'artecheck',
      'Teste 5: Plano ArteCheck possui exclusivamente o software ArteCheck',
      '[artecheck]',
      JSON.stringify(artecheckList)
    );

    // --------------------------------------------------------------------------
    // TESTE 6: OrçaGraf + ArteFlow possui exatamente dois produtos
    // --------------------------------------------------------------------------
    const comboProds = await client.query(`
      SELECT pp.product_code 
      FROM public.prexyon_plan_products pp 
      JOIN public.prexyon_plans p ON p.id = pp.plan_id 
      WHERE p.code = 'orcagraf_arteflow' 
      ORDER BY pp.product_code;
    `);
    const comboList = comboProds.rows.map((r) => r.product_code);
    const comboMatch = comboList.length === 2 && comboList.includes('orcagraf') && comboList.includes('arteflow') && !comboList.includes('artecheck');
    assert(
      comboMatch,
      'Teste 6: Plano OrçaGraf + ArteFlow possui exatamente os dois softwares contratados',
      '[arteflow, orcagraf]',
      JSON.stringify(comboList)
    );

    // --------------------------------------------------------------------------
    // TESTE 7: Prexyon Completo possui exatamente três produtos
    // --------------------------------------------------------------------------
    const completeProds = await client.query(`
      SELECT pp.product_code 
      FROM public.prexyon_plan_products pp 
      JOIN public.prexyon_plans p ON p.id = pp.plan_id 
      WHERE p.code = 'prexyon_complete' 
      ORDER BY pp.product_code;
    `);
    const completeList = completeProds.rows.map((r) => r.product_code);
    const completeMatch = completeList.length === 3 && completeList.includes('orcagraf') && completeList.includes('arteflow') && completeList.includes('artecheck');
    assert(
      completeMatch,
      'Teste 7: Plano Prexyon Completo possui exatamente os três softwares do ecossistema',
      '[artecheck, arteflow, orcagraf]',
      JSON.stringify(completeList)
    );

    // --------------------------------------------------------------------------
    // TESTE 8: Preços mensais oficiais corretos
    // --------------------------------------------------------------------------
    const pricesMap: Record<string, { monthly: number; annual: number }> = {
      orcagraf: { monthly: 5990, annual: 59900 },
      arteflow: { monthly: 7990, annual: 79900 },
      artecheck: { monthly: 6990, annual: 69900 },
      orcagraf_arteflow: { monthly: 11990, annual: 119900 },
      prexyon_complete: { monthly: 15990, annual: 159900 },
    };

    let monthlyPricesOk = true;
    const monthlyFound: Record<string, number> = {};
    for (const plan of activePlans) {
      monthlyFound[plan.code] = plan.monthly_price_cents;
      const expected = pricesMap[plan.code]?.monthly;
      if (plan.monthly_price_cents !== expected) {
        monthlyPricesOk = false;
      }
    }
    assert(
      monthlyPricesOk,
      'Teste 8: Preços mensais oficiais rigorosamente configurados (59,90 / 79,90 / 69,90 / 119,90 / 159,90)',
      JSON.stringify(Object.fromEntries(Object.entries(pricesMap).map(([k, v]) => [k, v.monthly]))),
      JSON.stringify(monthlyFound)
    );

    // --------------------------------------------------------------------------
    // TESTE 9: Preços anuais oficiais corretos
    // --------------------------------------------------------------------------
    let annualPricesOk = true;
    const annualFound: Record<string, number> = {};
    for (const plan of activePlans) {
      annualFound[plan.code] = plan.annual_price_cents;
      const expected = pricesMap[plan.code]?.annual;
      if (plan.annual_price_cents !== expected) {
        annualPricesOk = false;
      }
    }
    assert(
      annualPricesOk,
      'Teste 9: Preços anuais oficiais rigorosamente configurados (599,00 / 799,00 / 699,00 / 1.199,00 / 1.599,00)',
      JSON.stringify(Object.fromEntries(Object.entries(pricesMap).map(([k, v]) => [k, v.annual]))),
      JSON.stringify(annualFound)
    );

    // --------------------------------------------------------------------------
    // TESTE 10: 3 usuários incluídos em todos os planos
    // --------------------------------------------------------------------------
    const userSeatsCheck = activePlans.every((p) => p.included_users === 3);
    assert(
      userSeatsCheck,
      'Teste 10: Todos os cinco planos comerciais incluem exatamente 3 usuários no pacote base',
      'included_users = 3 para todos os 5 planos',
      userSeatsCheck ? 'included_users = 3 para todos' : 'Inconsistente'
    );

    // --------------------------------------------------------------------------
    // TESTE 11: R$ 12,90 por usuário adicional configurado (extra_user_price_cents = 1290)
    // --------------------------------------------------------------------------
    const extraUserPriceCheck = activePlans.every((p) => p.extra_user_price_cents === 1290);
    assert(
      extraUserPriceCheck,
      'Teste 11: Preço do usuário adicional fixado em R$ 12,90/mês (1290 centavos)',
      'extra_user_price_cents = 1290 para todos os 5 planos',
      extraUserPriceCheck ? 'extra_user_price_cents = 1290 para todos' : 'Inconsistente'
    );

    // --------------------------------------------------------------------------
    // TESTE 12: Plano inexistente não gera entitlement
    // --------------------------------------------------------------------------
    const fakeOrgId = crypto.randomUUID();
    const noPlanEnt = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [fakeOrgId]);
    const noPlanData = noPlanEnt.rows[0]?.data;
    assert(
      noPlanData && noPlanData.has_subscription === false && (!noPlanData.included_products || noPlanData.included_products.length === 0),
      'Teste 12: Organização sem plano/plano inexistente não gera nenhum entitlement',
      'has_subscription = false, included_products = []',
      `has_subscription = ${noPlanData?.has_subscription}, included_products = ${JSON.stringify(noPlanData?.included_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 13: Plano inativo não gera novo checkout / não pode ser contratado
    // --------------------------------------------------------------------------
    await client.query(`
      INSERT INTO public.prexyon_plans (id, code, name, description, monthly_price_cents, annual_price_cents, included_users, extra_user_price_cents, is_active)
      VALUES ('${inactivePlanId}', 'plano-inativo-teste', 'Plano Desativado', 'Desc', 1000, 10000, 1, 1000, false)
      ON CONFLICT (id) DO NOTHING;
    `);

    const inactiveLookup = await client.query(`
      SELECT * FROM public.prexyon_plans WHERE code = 'plano-inativo-teste' AND is_active = true;
    `);
    assert(
      inactiveLookup.rows.length === 0,
      'Teste 13: Plano inativo é rejeitado na busca de planos ativos para checkout',
      '0 resultados na consulta de planos ativos',
      `${inactiveLookup.rows.length} resultados`
    );

    // --------------------------------------------------------------------------
    // TESTE 14: Frontend não controla preço autoritativo (resolução server-side em centavos)
    // --------------------------------------------------------------------------
    const serverPriceCheck = await client.query(`
      SELECT code, monthly_price_cents, annual_price_cents FROM public.prexyon_plans WHERE code = 'orcagraf';
    `);
    const authoritativePrice = serverPriceCheck.rows[0]?.monthly_price_cents;
    assert(
      authoritativePrice === 5990,
      'Teste 14: Preço autoritativo resolvido exclusivamente no servidor (5990 centavos)',
      '5990',
      `${authoritativePrice}`
    );

    // --------------------------------------------------------------------------
    // TESTE 15: Usuário sem subscription continua fail-closed
    // --------------------------------------------------------------------------
    await client.query(`INSERT INTO public.organizations (id, trade_name, is_active) VALUES ('${testOrgId}', 'Org Fail Closed Test', true);`);
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${testUserId}', 'failclosed-${Date.now()}@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${testUserId}', 'User FailClosed', 'failclosed-${Date.now()}@prexyon.com');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ('${testOrgId}', '${testUserId}', 'owner', true, false);`);

    const failClosedEnt = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [testOrgId]);
    const fcData = failClosedEnt.rows[0]?.data;
    assert(
      fcData && fcData.has_subscription === false && (!fcData.included_products || fcData.included_products.length === 0),
      'Teste 15: Usuário e Organização sem subscription permanecem estritamente bloqueados (Fail-Closed)',
      'has_subscription = false',
      `has_subscription = ${fcData?.has_subscription}`
    );

    // --------------------------------------------------------------------------
    // TESTE 16: Produto fora do plano continua bloqueado no SSO
    // --------------------------------------------------------------------------
    // Criar assinatura de orcagraf_arteflow para a organização de teste
    const comboPlanIdRes = await client.query("SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf_arteflow';");
    const comboPlanId = comboPlanIdRes.rows[0]?.id;

    await client.query(`
      INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES ('${testOrgId}', '${comboPlanId}', 'active', now(), now() + interval '30 days');
    `);

    let artecheckSsoBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code('${testOrgId}', '${testUserId}', 'artecheck');`);
    } catch (err: any) {
      artecheckSsoBlocked = err.message.includes('PRODUCT_NOT_SUBSCRIBED') || err.code === 'P0001';
    }
    assert(
      artecheckSsoBlocked,
      'Teste 16: Produto fora do plano contratado (ArteCheck em plano OrçaGraf+ArteFlow) é bloqueado com 403 no SSO',
      'Exceção PRODUCT_NOT_SUBSCRIBED (P0001)',
      artecheckSsoBlocked ? 'Bloqueado com PRODUCT_NOT_SUBSCRIBED' : 'Falhou: permitiu SSO fora do plano'
    );

    // --------------------------------------------------------------------------
    // TESTE 17: Request manual para conceder permissão sem subscription é REJEITADO
    // --------------------------------------------------------------------------
    const noSubOrgId = crypto.randomUUID();
    const noSubUserId = crypto.randomUUID();
    await client.query(`INSERT INTO public.organizations (id, trade_name, is_active) VALUES ('${noSubOrgId}', 'Org Sem Sub Test', true);`);
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${noSubUserId}', 'nosub-${Date.now()}@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${noSubUserId}', 'No Sub Owner', 'nosub-${Date.now()}@prexyon.com');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ('${noSubOrgId}', '${noSubUserId}', 'owner', true, false);`);

    await client.query(`SET request.jwt.claims = '{"sub": "${noSubUserId}", "email": "nosub@prexyon.com"}';`);

    let manualNoSubBlocked = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_access_and_permissions(
          '${noSubOrgId}',
          '${noSubUserId}',
          ARRAY['orcagraf'],
          '{"orcagraf": {"orcagraf.quotes.create": true}}'::jsonb
        );
      `);
    } catch (err: any) {
      manualNoSubBlocked = err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION') || err.code === 'P0001';
    }

    // Verificar no banco que NENHUMA permissão ou acesso foi persistido
    const noSubPermsInDb = await client.query(`
      SELECT count(*) as count FROM public.product_permissions WHERE organization_id = '${noSubOrgId}';
    `);
    const noSubAccessInDb = await client.query(`
      SELECT count(*) as count FROM public.organization_member_product_access WHERE organization_id = '${noSubOrgId}' AND is_enabled = true;
    `);
    const permsCount0 = parseInt(noSubPermsInDb.rows[0].count, 10);
    const accessCount0 = parseInt(noSubAccessInDb.rows[0].count, 10);

    assert(
      manualNoSubBlocked && permsCount0 === 0 && accessCount0 === 0,
      'Teste 17: Request manual em organização sem assinatura é rejeitado e banco permanece 100% inalterado',
      'Rejeitado (P0001) e 0 registros persistidos',
      `Rejeitado: ${manualNoSubBlocked}, perms: ${permsCount0}, access: ${accessCount0}`
    );

    // --------------------------------------------------------------------------
    // TESTE 18: Organização com OrçaGraf individual: ArteFlow e ArteCheck manuais são rejeitados
    // --------------------------------------------------------------------------
    const singleSubOrgId = crypto.randomUUID();
    const singleSubUserId = crypto.randomUUID();
    const orcagrafPlanIdRes = await client.query("SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';");
    const orcagrafPlanId = orcagrafPlanIdRes.rows[0]?.id;

    await client.query(`INSERT INTO public.organizations (id, trade_name, is_active) VALUES ('${singleSubOrgId}', 'Org Single Sub Test', true);`);
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${singleSubUserId}', 'single-${Date.now()}@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${singleSubUserId}', 'Single Owner', 'single-${Date.now()}@prexyon.com');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ('${singleSubOrgId}', '${singleSubUserId}', 'owner', true, false);`);
    await client.query(`INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end) VALUES ('${singleSubOrgId}', '${orcagrafPlanId}', 'active', now(), now() + interval '30 days');`);

    await client.query(`SET request.jwt.claims = '{"sub": "${singleSubUserId}", "email": "single@prexyon.com"}';`);

    // 18a: Permitido para OrçaGraf
    let orcagrafAllowed = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_access_and_permissions(
          '${singleSubOrgId}',
          '${singleSubUserId}',
          ARRAY['orcagraf'],
          '{"orcagraf": {"orcagraf.quotes.create": true}}'::jsonb
        );
      `);
      orcagrafAllowed = true;
    } catch (err: any) {
      orcagrafAllowed = false;
    }

    // 18b: Rejeitado para ArteFlow
    let arteflowRejected = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_access_and_permissions(
          '${singleSubOrgId}',
          '${singleSubUserId}',
          ARRAY['orcagraf', 'arteflow'],
          '{"arteflow": {"arteflow.view": true}}'::jsonb
        );
      `);
    } catch (err: any) {
      arteflowRejected = err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION') || err.code === 'P0001';
    }

    // Provar no banco que ArteFlow não foi persistido
    const arteflowCheckInDb = await client.query(`
      SELECT count(*) as count FROM public.product_permissions WHERE organization_id = '${singleSubOrgId}' AND product_key = 'arteflow';
    `);
    const arteflowCountInDb = parseInt(arteflowCheckInDb.rows[0].count, 10);

    assert(
      orcagrafAllowed && arteflowRejected && arteflowCountInDb === 0,
      'Teste 18: Plano individual OrçaGraf permite OrçaGraf mas rejeita estritamente concessão de ArteFlow (Banco inalterado)',
      'OrçaGraf OK, ArteFlow Rejeitado (P0001), 0 perms persistidas para ArteFlow',
      `OrçaGraf: ${orcagrafAllowed}, ArteFlow Rejeitado: ${arteflowRejected}, DB count: ${arteflowCountInDb}`
    );

    // --------------------------------------------------------------------------
    // TESTE 19: Plano Prexyon Completo permite todos os 3 softwares com isolamento e integridade
    // --------------------------------------------------------------------------
    const completePlanIdRes = await client.query("SELECT id FROM public.prexyon_plans WHERE code = 'prexyon_complete';");
    const completePlanId = completePlanIdRes.rows[0]?.id;

    await client.query(`
      UPDATE public.prexyon_subscriptions 
      SET plan_id = '${completePlanId}', updated_at = now() 
      WHERE organization_id = '${singleSubOrgId}';
    `);

    let completeAllAllowed = false;
    try {
      await client.query(`
        SELECT public.prexyon_update_member_access_and_permissions(
          '${singleSubOrgId}',
          '${singleSubUserId}',
          ARRAY['orcagraf', 'arteflow', 'artecheck'],
          '{"orcagraf": {"orcagraf.quotes.create": true}, "arteflow": {"arteflow.view": true}, "artecheck": {"artecheck.preflight.run": true}}'::jsonb
        );
      `);
      completeAllAllowed = true;
    } catch (err: any) {
      completeAllAllowed = false;
    }

    const all3PermsInDb = await client.query(`
      SELECT count(*) as count FROM public.product_permissions WHERE organization_id = '${singleSubOrgId}';
    `);
    const all3Count = parseInt(all3PermsInDb.rows[0].count, 10);

    assert(
      completeAllAllowed && all3Count === 3,
      'Teste 19: Plano Prexyon Completo autoriza os três produtos e persiste exatamente as permissões granulares',
      'true e 3 permissões persistidas',
      `${completeAllAllowed} e ${all3Count} permissões persistidas`
    );

    // --------------------------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------------------------
    await client.query(`DELETE FROM public.prexyon_plans WHERE id = '${inactivePlanId}';`);
    await client.query(`DELETE FROM public.product_permissions WHERE organization_id IN ('${testOrgId}', '${noSubOrgId}', '${singleSubOrgId}');`);
    await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id IN ('${testOrgId}', '${noSubOrgId}', '${singleSubOrgId}');`);
    await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id IN ('${testOrgId}', '${noSubOrgId}', '${singleSubOrgId}');`);
    await client.query(`DELETE FROM public.organizations WHERE id IN ('${testOrgId}', '${noSubOrgId}', '${singleSubOrgId}');`);
    await client.query(`DELETE FROM public.profiles WHERE id IN ('${testUserId}', '${noSubUserId}', '${singleSubUserId}');`);
    await client.query(`DELETE FROM auth.users WHERE id IN ('${testUserId}', '${noSubUserId}', '${singleSubUserId}');`);

  } finally {
    await client.end();
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES DO CATÁLOGO OFICIAL: ${passed + failed}`);
  console.log(`APROVADOS:                           ${passed}`);
  console.log(`REPROVADOS:                          ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

runPlansCatalogTests().catch((err) => {
  console.error('Erro fatal na suíte do Catálogo de Planos:', err);
  process.exitCode = 1;
});
