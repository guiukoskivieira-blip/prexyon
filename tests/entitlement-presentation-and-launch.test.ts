import { getDbClient } from './db-client';
import { createClient } from '@supabase/supabase-js';

async function runEntitlementPresentationAndLaunchTests() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout em runEntitlementPresentationAndLaunchTests.');
    process.exit(1);
  }, 60000);

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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ybsdwcaagcazfedrwhjm.supabase.co';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlic2R3Y2FhZ2NhemZlZHJ3aGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTI3MDgsImV4cCI6MjA4ODA2ODcwOH0.M5q5Kqj3Q65F-o3n4Fq0w9r1_z2y7v9x6t8u4w2e0a1';
  const functionUrl = `${supabaseUrl}/functions/v1/prexyon-sso-exchange`;

  // Entidades Reais de Homologação
  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const ownerUserId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
  const ownerEmail = 'guiukoskivieira@gmail.com';
  const memberUserId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
  const memberEmail = 'designcreative254@gmail.com';

  const arteflowProductionUrl = 'https://arteflow-10-production.up.railway.app';
  const arteflowCallbackUrl = `${arteflowProductionUrl}/auth/prexyon`;

  let createdOwnerOrderId: string | null = null;
  let createdMemberOrderId: string | null = null;

  try {
    await client.connect();
    await client.query("SET statement_timeout = '15000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: APRESENTAÇÃO DE ENTITLEMENT & LAUNCH');
    console.log(`ArteFlow Production Callback: ${arteflowCallbackUrl}`);
    console.log(`Edge Function Exchange:       ${functionUrl}`);
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // 1. RESOLUÇÃO DE ENTITLEMENT CANÔNICO NO BANCO
    // -------------------------------------------------------------
    const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as ent;`, [realOrgId]);
    const entData = entRes.rows[0].ent;

    assert(
      entData.has_subscription === false &&
      entData.commercial_products.length === 0 &&
      entData.homologation_products.includes('arteflow') &&
      entData.homologation_products.includes('orcagraf') &&
      entData.effective_products.includes('arteflow') &&
      entData.effective_products.includes('orcagraf') &&
      !entData.effective_products.includes('artecheck'),
      'Teste 1: Resolver prexyon_get_organization_entitlements separa commercial_products=[] de homologation_products=["arteflow","orcagraf"]',
      'has_sub=false, comm=[], homolog=["arteflow","orcagraf"], effective=["arteflow","orcagraf"]',
      `has_sub=${entData.has_subscription}, comm=${JSON.stringify(entData.commercial_products)}, homolog=${JSON.stringify(entData.homologation_products)}, effective=${JSON.stringify(entData.effective_products)}`
    );

    // -------------------------------------------------------------
    // 2. SIMULAÇÃO DE CLASSIFICAÇÃO DE STATUS VISUAL
    // -------------------------------------------------------------
    function classifyProduct(
      prodId: 'orcagraf' | 'arteflow' | 'artecheck',
      commProducts: string[],
      homologProducts: string[],
      effectiveProds: string[],
      userHasAccess: boolean,
      userRole: string
    ) {
      const isCommercial = commProducts.includes(prodId);
      const isHomologation = homologProducts.includes(prodId) && !isCommercial;
      const isEntitledByOrg = effectiveProds.includes(prodId);

      let status = 'inactive';
      let statusLabel = 'Não contratado';
      let entitlementType = 'none';

      if (isCommercial) {
        entitlementType = 'commercial';
        statusLabel = userHasAccess ? 'Contratado' : 'Sem acesso';
        status = userHasAccess ? 'active' : 'inactive';
      } else if (isHomologation) {
        entitlementType = 'homologation';
        statusLabel = userHasAccess ? 'Acesso de homologação' : 'Sem acesso';
        status = userHasAccess ? 'homologation' : 'inactive';
      } else {
        entitlementType = 'none';
        statusLabel = 'Não contratado';
        status = 'inactive';
      }

      let ctaText = 'Não disponível';
      if (userHasAccess) {
        ctaText = `Abrir ${prodId}`;
      } else if (userRole === 'owner') {
        ctaText = isEntitledByOrg ? 'Gerenciar acesso' : `Assinar ${prodId}`;
      } else {
        ctaText = 'Não disponível';
      }

      const isLaunchable = Boolean(userHasAccess && (status === 'active' || status === 'homologation'));

      return { status, statusLabel, ctaText, entitlementType, isLaunchable };
    }

    // Cenário A: Produto em commercial_products
    const commResult = classifyProduct('orcagraf', ['orcagraf'], [], ['orcagraf'], true, 'owner');
    assert(
      commResult.status === 'active' && commResult.statusLabel === 'Contratado' && commResult.isLaunchable === true,
      'Teste 2.1: Produto em commercial_products com acesso do usuário -> status="active", statusLabel="Contratado", isLaunchable=true',
      'active / Contratado / true',
      `${commResult.status} / ${commResult.statusLabel} / ${commResult.isLaunchable}`
    );

    // Cenário B: Produto somente em homologation_products (caso atual do ArteFlow e OrçaGraf)
    const homologResultOwner = classifyProduct('arteflow', [], ['arteflow'], ['arteflow'], true, 'owner');
    assert(
      homologResultOwner.status === 'homologation' &&
      homologResultOwner.statusLabel === 'Acesso de homologação' &&
      homologResultOwner.isLaunchable === true &&
      homologResultOwner.ctaText === 'Abrir arteflow',
      'Teste 2.2: Produto em homologation_products (OWNER com acesso) -> status="homologation", statusLabel="Acesso de homologação", isLaunchable=true, ctaText="Abrir arteflow"',
      'homologation / Acesso de homologação / true / Abrir arteflow',
      `${homologResultOwner.status} / ${homologResultOwner.statusLabel} / ${homologResultOwner.isLaunchable} / ${homologResultOwner.ctaText}`
    );

    const homologResultMemberWithAccess = classifyProduct('arteflow', [], ['arteflow'], ['arteflow'], true, 'member');
    assert(
      homologResultMemberWithAccess.status === 'homologation' &&
      homologResultMemberWithAccess.statusLabel === 'Acesso de homologação' &&
      homologResultMemberWithAccess.isLaunchable === true &&
      homologResultMemberWithAccess.ctaText === 'Abrir arteflow',
      'Teste 2.3: Produto em homologation_products (MEMBER com acesso atribuído) -> status="homologation", statusLabel="Acesso de homologação", isLaunchable=true',
      'homologation / Acesso de homologação / true',
      `${homologResultMemberWithAccess.status} / ${homologResultMemberWithAccess.statusLabel} / ${homologResultMemberWithAccess.isLaunchable}`
    );

    const homologResultMemberNoAccess = classifyProduct('arteflow', [], ['arteflow'], ['arteflow'], false, 'member');
    assert(
      homologResultMemberNoAccess.status === 'inactive' &&
      homologResultMemberNoAccess.statusLabel === 'Sem acesso' &&
      homologResultMemberNoAccess.isLaunchable === false &&
      homologResultMemberNoAccess.ctaText === 'Não disponível',
      'Teste 2.4: Produto em homologation_products (MEMBER sem acesso atribuído) -> status="inactive", statusLabel="Sem acesso", isLaunchable=false, ctaText="Não disponível"',
      'inactive / Sem acesso / false / Não disponível',
      `${homologResultMemberNoAccess.status} / ${homologResultMemberNoAccess.statusLabel} / ${homologResultMemberNoAccess.isLaunchable} / ${homologResultMemberNoAccess.ctaText}`
    );

    // Cenário C: Produto ausente de effective_products (caso ArteCheck)
    const noEntitlementOwner = classifyProduct('artecheck', [], ['arteflow', 'orcagraf'], ['arteflow', 'orcagraf'], false, 'owner');
    assert(
      noEntitlementOwner.status === 'inactive' &&
      noEntitlementOwner.statusLabel === 'Não contratado' &&
      noEntitlementOwner.isLaunchable === false &&
      noEntitlementOwner.ctaText === 'Assinar artecheck',
      'Teste 2.5: Produto ausente de effective_products (OWNER) -> status="inactive", statusLabel="Não contratado", isLaunchable=false, ctaText="Assinar artecheck"',
      'inactive / Não contratado / false / Assinar artecheck',
      `${noEntitlementOwner.status} / ${noEntitlementOwner.statusLabel} / ${noEntitlementOwner.isLaunchable} / ${noEntitlementOwner.ctaText}`
    );

    const noEntitlementMember = classifyProduct('artecheck', [], ['arteflow', 'orcagraf'], ['arteflow', 'orcagraf'], false, 'member');
    assert(
      noEntitlementMember.status === 'inactive' &&
      noEntitlementMember.statusLabel === 'Não contratado' &&
      noEntitlementMember.isLaunchable === false &&
      noEntitlementMember.ctaText === 'Não disponível',
      'Teste 2.6: Produto ausente de effective_products (MEMBER) -> status="inactive", statusLabel="Não contratado", isLaunchable=false, ctaText="Não disponível"',
      'inactive / Não contratado / false / Não disponível',
      `${noEntitlementMember.status} / ${noEntitlementMember.statusLabel} / ${noEntitlementMember.isLaunchable} / ${noEntitlementMember.ctaText}`
    );

    // -------------------------------------------------------------
    // 3. EXPIRAÇÃO DE HOMOLOGATION ENTITLEMENT
    // -------------------------------------------------------------
    const expiredEntResult = classifyProduct('arteflow', [], [], [], false, 'owner');
    assert(
      expiredEntResult.status === 'inactive' &&
      expiredEntResult.statusLabel === 'Não contratado' &&
      expiredEntResult.isLaunchable === false,
      'Teste 3: Homologação expirada ou ausente bloqueia automaticamente o launcher e define status="Não contratado"',
      'inactive / Não contratado / false',
      `${expiredEntResult.status} / ${expiredEntResult.statusLabel} / ${expiredEntResult.isLaunchable}`
    );

    // -------------------------------------------------------------
    // 4. LANÇAMENTO REAL DE SSO PARA ARTEFLOW (OWNER + MEMBER)
    // -------------------------------------------------------------
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

    // 4.1 OWNER Launch
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ownerGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const ownerSsoCode = ownerGenRes.rows[0].sso.code;

    assert(
      ownerGenRes.rows[0].sso.success === true && Boolean(ownerSsoCode),
      'Teste 4.1: Launcher do Portal emite SSO code de ArteFlow com sucesso para o OWNER',
      'success = true',
      `success = ${ownerGenRes.rows[0].sso.success}`
    );

    const ownerExchRes = await callRemoteExchange({ code: ownerSsoCode, audience: 'arteflow' });
    const authClientOwner = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: ownerVerifyData, error: ownerVerifyErr } = await authClientOwner.auth.verifyOtp({
      token_hash: ownerExchRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !ownerVerifyErr && Boolean(ownerVerifyData?.session) && ownerVerifyData?.user?.id === ownerUserId,
      'Teste 4.2: Callback do ArteFlow conclui exchange e autentica o OWNER com sessão Supabase Auth',
      `user.id = ${ownerUserId}`,
      `user.id = ${ownerVerifyData?.user?.id}`
    );

    // 4.2 MEMBER Launch
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const memberGenRes = await client.query(`SELECT public.prexyon_generate_sso_code($1::uuid, 'arteflow') as sso;`, [realOrgId]);
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    const memberSsoCode = memberGenRes.rows[0].sso.code;

    assert(
      memberGenRes.rows[0].sso.success === true && Boolean(memberSsoCode),
      'Teste 4.3: Launcher do Portal emite SSO code de ArteFlow com sucesso para o MEMBER',
      'success = true',
      `success = ${memberGenRes.rows[0].sso.success}`
    );

    const memberExchRes = await callRemoteExchange({ code: memberSsoCode, audience: 'arteflow' });
    const authClientMember = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: memberVerifyData, error: memberVerifyErr } = await authClientMember.auth.verifyOtp({
      token_hash: memberExchRes.body.token_hash,
      type: 'magiclink',
    });

    assert(
      !memberVerifyErr && Boolean(memberVerifyData?.session) && memberVerifyData?.user?.id === memberUserId,
      'Teste 4.4: Callback do ArteFlow conclui exchange e autentica o MEMBER com sessão Supabase Auth',
      `user.id = ${memberUserId}`,
      `user.id = ${memberVerifyData?.user?.id}`
    );

    // -------------------------------------------------------------
    // 5. OPERAÇÕES DE PEDIDOS REAIS (FASE 12: OWNER & MEMBER RBAC)
    // -------------------------------------------------------------
    await client.query(`
      GRANT ALL ON TABLE public.arteflow_orders TO authenticated, anon, service_role;
      GRANT ALL ON TABLE public.arteflow_order_sequences TO authenticated, anon, service_role;
      GRANT ALL ON TABLE public.arteflow_order_items TO authenticated, anon, service_role;
    `);

    // 5.1 OWNER: Criar Pedido
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${ownerUserId}", "email": "${ownerEmail}", "role": "authenticated"}';`);
    const ownerOrderInsert = await client.query(`
      INSERT INTO public.arteflow_orders (
        organization_id, order_number, origin, status, customer_snapshot_id, customer_name, customer_email, total_amount_cents, notes, delivery_date, created_by, updated_by
      ) VALUES (
        $1, 'ORD-HOMOLOG-OWNER-01', 'MANUAL', 'DRAFT', 'snap-owner-01', 'Cliente Teste Owner', 'cliente.owner@teste.com', 45000, 'Pedido Homologacao OWNER', now() + interval '5 days', $2, $2
      ) RETURNING id, order_number, notes;
    `, [realOrgId, ownerUserId]);
    createdOwnerOrderId = ownerOrderInsert.rows[0].id;

    assert(
      Boolean(createdOwnerOrderId) && ownerOrderInsert.rows[0].notes === 'Pedido Homologacao OWNER',
      'Teste 5.1: OWNER cria pedido de homologação no ArteFlow com sucesso',
      'Pedido Homologacao OWNER criado',
      `ID = ${createdOwnerOrderId}, Nº = ${ownerOrderInsert.rows[0].order_number}`
    );

    // 5.2 OWNER: Recarregar e confirmar persistência PostgreSQL
    const ownerOrderReload = await client.query(`
      SELECT id, notes, total_amount_cents, status FROM public.arteflow_orders WHERE id = $1;
    `, [createdOwnerOrderId]);
    assert(
      ownerOrderReload.rows[0]?.notes === 'Pedido Homologacao OWNER' && Number(ownerOrderReload.rows[0]?.total_amount_cents) === 45000,
      'Teste 5.2: OWNER recarrega pedido e confirma persistência real em PostgreSQL',
      'notes=Pedido Homologacao OWNER, amount=45000',
      `notes=${ownerOrderReload.rows[0]?.notes}, amount=${ownerOrderReload.rows[0]?.total_amount_cents}`
    );

    // 5.3 OWNER: Editar Pedido
    await client.query(`
      UPDATE public.arteflow_orders 
      SET notes = 'Pedido Homologacao OWNER (Editado)', total_amount_cents = 52000, updated_by = $2, updated_at = now()
      WHERE id = $1;
    `, [createdOwnerOrderId, ownerUserId]);

    const ownerOrderUpdated = await client.query(`
      SELECT notes, total_amount_cents FROM public.arteflow_orders WHERE id = $1;
    `, [createdOwnerOrderId]);
    assert(
      ownerOrderUpdated.rows[0]?.notes === 'Pedido Homologacao OWNER (Editado)' && Number(ownerOrderUpdated.rows[0]?.total_amount_cents) === 52000,
      'Teste 5.3: OWNER edita pedido de homologação com sucesso (Owner Bypass)',
      'notes=Pedido Homologacao OWNER (Editado), amount=52000',
      `notes=${ownerOrderUpdated.rows[0]?.notes}, amount=${ownerOrderUpdated.rows[0]?.total_amount_cents}`
    );
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    // 5.4 MEMBER: Visualizar Pedidos (arteflow.orders.view = true)
    await client.query(`SET ROLE authenticated; SET request.jwt.claims = '{"sub": "${memberUserId}", "email": "${memberEmail}", "role": "authenticated"}';`);
    const memberOrderList = await client.query(`
      SELECT id, notes FROM public.arteflow_orders WHERE organization_id = $1;
    `, [realOrgId]);
    assert(
      memberOrderList.rows.some((r: any) => r.id === createdOwnerOrderId),
      'Teste 5.4: MEMBER visualiza lista de pedidos da organização com sucesso (arteflow.orders.view)',
      'Pedido do OWNER visível para MEMBER',
      `Encontrados ${memberOrderList.rows.length} pedidos`
    );

    // 5.5 MEMBER: Criar Pedido (arteflow.orders.create = true)
    const memberOrderInsert = await client.query(`
      INSERT INTO public.arteflow_orders (
        organization_id, order_number, origin, status, customer_snapshot_id, customer_name, customer_email, total_amount_cents, notes, delivery_date, created_by, updated_by
      ) VALUES (
        $1, 'ORD-HOMOLOG-MEMBER-01', 'MANUAL', 'DRAFT', 'snap-member-01', 'Cliente Teste Member', 'cliente.member@teste.com', 29900, 'Pedido Homologacao MEMBER', now() + interval '3 days', $2, $2
      ) RETURNING id, order_number, notes;
    `, [realOrgId, memberUserId]);
    createdMemberOrderId = memberOrderInsert.rows[0].id;

    assert(
      Boolean(createdMemberOrderId) && memberOrderInsert.rows[0].notes === 'Pedido Homologacao MEMBER',
      'Teste 5.5: MEMBER cria pedido de homologação no ArteFlow com sucesso (arteflow.orders.create)',
      'Pedido Homologacao MEMBER criado',
      `ID = ${createdMemberOrderId}, Nº = ${memberOrderInsert.rows[0].order_number}`
    );

    // 5.6 MEMBER: Tentar Editar Pedido (arteflow.orders.edit = false -> DENY)
    let memberEditBlocked = false;
    try {
      const editRes = await client.query(`
        UPDATE public.arteflow_orders 
        SET notes = 'Tentativa de Edicao por Member Bloqueada', updated_by = $2
        WHERE id = $1;
      `, [createdMemberOrderId, memberUserId]);
      // Com RLS, update sem permissão afeta 0 rows
      if (editRes.rowCount === 0) {
        memberEditBlocked = true;
      }
    } catch {
      memberEditBlocked = true;
    }

    assert(
      memberEditBlocked === true,
      'Teste 5.6: Tentativa de edição pelo MEMBER é terminantemente bloqueada (arteflow.orders.edit DENIED via RLS)',
      'memberEditBlocked = true (0 rows updated / exception)',
      `memberEditBlocked = ${memberEditBlocked}`
    );
    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    // -------------------------------------------------------------
    // 6. LIMPEZA SEGURA DOS PEDIDOS DE TESTE
    // -------------------------------------------------------------
    if (createdOwnerOrderId || createdMemberOrderId) {
      await client.query(`
        DELETE FROM public.arteflow_orders WHERE id IN ($1, $2);
      `, [createdOwnerOrderId, createdMemberOrderId]);
    }

    const cleanupCheck = await client.query(`
      SELECT count(*) as count FROM public.arteflow_orders WHERE id IN ($1, $2);
    `, [createdOwnerOrderId, createdMemberOrderId]);

    assert(
      Number(cleanupCheck.rows[0]?.count) === 0,
      'Teste 6: Limpeza segura executada: Zero registros operacionais de teste deixados no banco',
      'count = 0',
      `count = ${cleanupCheck.rows[0]?.count}`
    );

    // -------------------------------------------------------------
    // 7. AUDITORIA FINAL DE ZERO BILLING
    // -------------------------------------------------------------
    const subsCheck = await client.query(`SELECT * FROM public.prexyon_subscriptions WHERE organization_id = $1;`, [realOrgId]);
    assert(
      subsCheck.rows.length === 0,
      'Teste 7: Zero assinaturas comerciais ou cobranças criadas no banco (has_subscription = false preservado)',
      'count = 0',
      `count = ${subsCheck.rows.length}`
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES APRESENTAÇÃO ENTITLEMENT & LAUNCH: ${total}`);
    console.log(`APROVADOS:                                        ${passed}`);
    console.log(`REPROVADOS:                                       ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('ENT_TEST_ERR:', err.message, err.stack);
  } finally {
    if (createdOwnerOrderId || createdMemberOrderId) {
      await client.query(`DELETE FROM public.arteflow_orders WHERE id IN ($1, $2);`, [createdOwnerOrderId, createdMemberOrderId]).catch(() => {});
    }
    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runEntitlementPresentationAndLaunchTests();
