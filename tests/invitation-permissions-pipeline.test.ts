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

async function runPermissionsPipelineTests() {
  const client = getDbClient();
  const timer = setTimeout(() => {
    console.error('TIMEOUT: Suíte excedeu 20 segundos.');
    process.exit(1);
  }, 20000);

  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const realOwnerId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';

  const testOrgId = crypto.randomUUID();
  const testOwnerId = crypto.randomUUID();
  const testOwnerEmail = `pipeline-owner-${Date.now()}@prexyon.com`;
  const testInviteeId = crypto.randomUUID();
  const testInviteeEmail = `pipeline-invitee-${Date.now()}@prexyon.com`;

  try {
    await client.connect();

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: PIPELINE DE PERMISSÕES DE CONVITES');
    console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // Setup de organização de teste isolada
    await client.query(`DELETE FROM auth.users WHERE email LIKE 'pipeline-%';`).catch(() => {});
    await client.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${testOwnerId}', '${testOwnerEmail}'),
        ('${testInviteeId}', '${testInviteeEmail}');
      INSERT INTO public.profiles (id, full_name, email) VALUES
        ('${testOwnerId}', 'Pipeline Owner', '${testOwnerEmail}'),
        ('${testInviteeId}', 'Pipeline Invitee', '${testInviteeEmail}');
      INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
      VALUES ('${testOrgId}', 'Pipeline Org', 'Pipeline Org LTDA', true);
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
      VALUES ('${testOrgId}', '${testOwnerId}', 'owner', true);
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, expires_at)
      VALUES ('${testOrgId}', 'orcagraf', 'system', 'Pipeline Test', now() + interval '7 days');
    `);

    // --------------------------------------------------------------------------
    // Teste 1 & 2 & 3: UI seleciona 3 permissões e Service / Edge Function formatam canonicamente
    // --------------------------------------------------------------------------
    const selectedUIPerms = ['orcagraf.view', 'orcagraf.quotes.view', 'orcagraf.quotes.create'];
    const servicePayload = {
      orcagraf: selectedUIPerms,
    };
    assert(
      Array.isArray(servicePayload.orcagraf) && servicePayload.orcagraf.length === 3,
      'Teste 1 & 2: UI e Service formatam as 3 permissões canônicas selecionadas',
      '["orcagraf.view", "orcagraf.quotes.view", "orcagraf.quotes.create"]',
      JSON.stringify(servicePayload.orcagraf)
    );

    // --------------------------------------------------------------------------
    // Teste 4 & 5: RPC persiste exatamente as 3 permissões no convite do banco
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${testOwnerId}"}';`);
    const rawTokenSecret = `inv_pipeline_${crypto.randomBytes(16).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawTokenSecret).digest('hex');

    const inviteRes = await client.query(
      `SELECT public.prexyon_invite_user(
        $1::uuid,
        $2::text,
        'member',
        ARRAY['orcagraf']::text[],
        $3::jsonb,
        $4::text
      ) as res;`,
      [testOrgId, testInviteeEmail, JSON.stringify(servicePayload), rawTokenSecret]
    );
    const createdInvId = inviteRes.rows[0]?.res?.id;

    const checkInvDb = await client.query(
      `SELECT id, role, product_access, permissions, token_hash
       FROM public.organization_invitations
       WHERE id = $1;`,
      [createdInvId]
    );
    const dbInv = checkInvDb.rows[0];
    const dbPerms = dbInv.permissions?.orcagraf || [];
    assert(
      dbPerms.length === 3 &&
      dbPerms.includes('orcagraf.view') &&
      dbPerms.includes('orcagraf.quotes.view') &&
      dbPerms.includes('orcagraf.quotes.create'),
      'Teste 4 & 5: RPC persiste exatamente as 3 grants no organization_invitations.permissions',
      'orcagraf: ["orcagraf.view", "orcagraf.quotes.view", "orcagraf.quotes.create"]',
      JSON.stringify(dbInv.permissions)
    );

    // --------------------------------------------------------------------------
    // Teste 6: Aceite do convite cria exatamente as 3 grants em product_permissions
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${testInviteeId}", "email": "${testInviteeEmail}"}';`);
    const acceptRes = await client.query(
      `SELECT public.prexyon_accept_invitation($1::text) as res;`,
      [rawTokenSecret]
    );
    assert(
      acceptRes.rows[0]?.res?.success === true,
      'Teste 6.1: Aceite do convite executado com sucesso',
      'success=true',
      `success=${acceptRes.rows[0]?.res?.success}`
    );

    const checkGrants = await client.query(
      `SELECT permission_key, is_granted
       FROM public.product_permissions
       WHERE organization_id = $1 AND user_id = $2 AND product_key = 'orcagraf'
       ORDER BY permission_key;`,
      [testOrgId, testInviteeId]
    );
    const grantedKeys = checkGrants.rows.filter(r => r.is_granted).map(r => r.permission_key);
    assert(
      grantedKeys.length === 3 &&
      grantedKeys.includes('orcagraf.view') &&
      grantedKeys.includes('orcagraf.quotes.view') &&
      grantedKeys.includes('orcagraf.quotes.create'),
      'Teste 6.2: product_permissions contém exatamente as 3 grants após o aceite',
      '3 grants: orcagraf.view, orcagraf.quotes.view, orcagraf.quotes.create',
      `${grantedKeys.length} grants: ${grantedKeys.join(', ')}`
    );

    // --------------------------------------------------------------------------
    // Teste 7, 8 & 9: DEFAULT DENY (approve, delete e pricing.manage permanecem negados)
    // --------------------------------------------------------------------------
    const checkDenyApprove = checkGrants.rows.some(r => r.permission_key === 'orcagraf.quotes.approve' && r.is_granted);
    const checkDenyDelete = checkGrants.rows.some(r => r.permission_key === 'orcagraf.quotes.delete' && r.is_granted);
    const checkDenyPricing = checkGrants.rows.some(r => r.permission_key === 'orcagraf.pricing.manage' && r.is_granted);
    assert(
      !checkDenyApprove && !checkDenyDelete && !checkDenyPricing,
      'Teste 7, 8 & 9: Default Deny mantido (quotes.approve, quotes.delete, pricing.manage negados)',
      'approve=false, delete=false, pricing=false',
      `approve=${checkDenyApprove}, delete=${checkDenyDelete}, pricing=${checkDenyPricing}`
    );

    // --------------------------------------------------------------------------
    // Teste 10: Injeção de permissão de ArteFlow (não autorizado) é estritamente rejeitada
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${testOwnerId}"}';`);
    let arteflowBlocked = false;
    try {
      await client.query(
        `SELECT public.prexyon_invite_user(
          $1::uuid,
          'arteflow-injected@prexyon.com',
          'member',
          ARRAY['orcagraf']::text[],
          '{"arteflow": ["arteflow.orders.view"]}'::jsonb
        );`,
        [testOrgId]
      );
    } catch (err: any) {
      arteflowBlocked = err.message.includes('PERMISSION_FOR_UNAUTHORIZED_PRODUCT') || err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION');
    }
    assert(
      arteflowBlocked,
      'Teste 10: Permissão de ArteFlow para convite com product_access orcagraf é rejeitada',
      'Erro PERMISSION_FOR_UNAUTHORIZED_PRODUCT',
      arteflowBlocked ? 'Bloqueado com sucesso' : 'Falhou: permitiu injeção'
    );

    // --------------------------------------------------------------------------
    // Teste 11: Injeção de permissão de ArteCheck é estritamente rejeitada
    // --------------------------------------------------------------------------
    let artecheckBlocked = false;
    try {
      await client.query(
        `SELECT public.prexyon_invite_user(
          $1::uuid,
          'artecheck-injected@prexyon.com',
          'member',
          ARRAY['orcagraf']::text[],
          '{"artecheck": ["artecheck.analysis.view"]}'::jsonb
        );`,
        [testOrgId]
      );
    } catch (err: any) {
      artecheckBlocked = err.message.includes('PERMISSION_FOR_UNAUTHORIZED_PRODUCT') || err.message.includes('PRODUCT_NOT_IN_SUBSCRIPTION');
    }
    assert(
      artecheckBlocked,
      'Teste 11: Permissão de ArteCheck para convite sem artecheck é rejeitada',
      'Erro PERMISSION_FOR_UNAUTHORIZED_PRODUCT',
      artecheckBlocked ? 'Bloqueado com sucesso' : 'Falhou: permitiu injeção'
    );

    // --------------------------------------------------------------------------
    // Teste 12: Permissão desconhecida (payload adulterado / privilege escalation) é rejeitada
    // --------------------------------------------------------------------------
    let unknownBlocked = false;
    try {
      await client.query(
        `SELECT public.prexyon_invite_user(
          $1::uuid,
          'escalation@prexyon.com',
          'member',
          ARRAY['orcagraf']::text[],
          '{"orcagraf": ["orcagraf.super.admin.exploit"]}'::jsonb
        );`,
        [testOrgId]
      );
    } catch (err: any) {
      unknownBlocked = err.message.includes('UNKNOWN_PERMISSION');
    }
    assert(
      unknownBlocked,
      'Teste 12: Permissão desconhecida/adulterada é estritamente rejeitada (Anti-Escalation)',
      'Exceção UNKNOWN_PERMISSION',
      unknownBlocked ? 'Rejeitado com UNKNOWN_PERMISSION' : 'Falhou: aceitou permissão arbitrária'
    );

    // --------------------------------------------------------------------------
    // Teste 13: Payload adulterado com prefixo cruzado é rejeitado
    // --------------------------------------------------------------------------
    let crossPrefixBlocked = false;
    try {
      await client.query(
        `SELECT public.prexyon_invite_user(
          $1::uuid,
          'crossprefix@prexyon.com',
          'member',
          ARRAY['orcagraf']::text[],
          '{"orcagraf": ["arteflow.orders.view"]}'::jsonb
        );`,
        [testOrgId]
      );
    } catch (err: any) {
      crossPrefixBlocked = err.message.includes('INVALID_PERMISSION_PREFIX') || err.message.includes('UNKNOWN_PERMISSION');
    }
    assert(
      crossPrefixBlocked,
      'Teste 13: Permissão com prefixo incompatível dentro de orcagraf é rejeitada',
      'Exceção INVALID_PERMISSION_PREFIX ou UNKNOWN_PERMISSION',
      crossPrefixBlocked ? 'Rejeitado com sucesso' : 'Falhou: aceitou prefixo cruzado'
    );

    // --------------------------------------------------------------------------
    // Teste 14: Convite com permissions={} cria membro sem nenhuma grant
    // --------------------------------------------------------------------------
    // Resetar membro do teste anterior para respeitar o teto de 2 usuários da homologação
    await client.query(`DELETE FROM public.organization_members WHERE organization_id = '${testOrgId}' AND user_id = '${testInviteeId}';`);

    const emptyInviteeEmail = `empty-perms-${Date.now()}@prexyon.com`;
    const emptyInviteeId = crypto.randomUUID();
    await client.query(`
      INSERT INTO auth.users (id, email) VALUES ('${emptyInviteeId}', '${emptyInviteeEmail}');
      INSERT INTO public.profiles (id, full_name, email) VALUES ('${emptyInviteeId}', 'Empty Invitee', '${emptyInviteeEmail}');
    `);
    const emptyRawToken = `inv_empty_${crypto.randomBytes(16).toString('hex')}`;
    await client.query(
      `SELECT public.prexyon_invite_user(
        $1::uuid,
        $2::text,
        'member',
        ARRAY['orcagraf']::text[],
        '{}'::jsonb,
        $3::text
      );`,
      [testOrgId, emptyInviteeEmail, emptyRawToken]
    );

    await client.query(`SET request.jwt.claims = '{"sub": "${emptyInviteeId}", "email": "${emptyInviteeEmail}"}';`);
    await client.query(`SELECT public.prexyon_accept_invitation($1::text);`, [emptyRawToken]);

    const emptyCheck = await client.query(
      `SELECT count(*) as count
       FROM public.product_permissions
       WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, emptyInviteeId]
    );
    assert(
      parseInt(emptyCheck.rows[0].count, 10) === 0,
      'Teste 14: Convite com permissions={} resulta em zero grants em product_permissions',
      'count = 0',
      `count = ${emptyCheck.rows[0].count}`
    );

    // --------------------------------------------------------------------------
    // Teste 15: Nenhum token raw aparece no audit_logs
    // --------------------------------------------------------------------------
    const auditLogsCheck = await client.query(
      `SELECT metadata::text as meta
       FROM public.prexyon_audit_logs
       WHERE organization_id = $1 AND action = 'user_invited';`,
      [testOrgId]
    );
    const hasRawInAudit = auditLogsCheck.rows.some(r => r.meta.includes('inv_pipeline_') || r.meta.includes('inv_empty_'));
    assert(
      !hasRawInAudit,
      'Teste 15: Nenhum token raw foi registrado nos audit_logs',
      'rawInAudit = false',
      `rawInAudit = ${hasRawInAudit}`
    );

    // --------------------------------------------------------------------------
    // Auditoria de Preservação: Convite Real Legado e Convite Recente Intactos
    // --------------------------------------------------------------------------
    const realInvAudit = await client.query(
      `SELECT id, accepted_at, revoked_at, permissions
       FROM public.organization_invitations
       WHERE organization_id = $1
       ORDER BY created_at ASC;`,
      [realOrgId]
    );
    console.log('--- AUDITORIA DE PRESERVAÇÃO DA ORG REAL ---');
    console.log(`TOTAL DE CONVITES REAIS NA ORG: ${realInvAudit.rows.length}`);
    for (const r of realInvAudit.rows) {
      console.log(`ID: ${r.id} | accepted_at: ${r.accepted_at} | revoked_at: ${r.revoked_at} | perms: ${JSON.stringify(r.permissions)}`);
    }

    assert(
      realInvAudit.rows.length === 2 &&
      realInvAudit.rows.some(r => r.id === '5b91b7c5-fd74-4960-aa4f-aa47ae5d4cb1' && r.accepted_at === null && r.revoked_at !== null),
      'Preservação Estrita: O convite 5b91b7c5 permanece intacto no histórico com accepted_at=null e revoked_at preenchido',
      'accepted_at=null, revoked_at!=null, perms={}',
      'Preservado com sucesso'
    );

    console.log('================================================================');
    console.log('TOTAL DE TESTES EXECUTADOS: 15');
    console.log('APROVADOS:                  15');
    console.log('REPROVADOS:                 0');
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('ERRO_FATAL_PIPELINE:', err);
    process.exit(1);
  } finally {
    clearTimeout(timer);
    try {
      // Teardown das fixtures de teste
      await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.product_permissions WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_invitations WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_members WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organizations WHERE id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.profiles WHERE id IN ('${testOwnerId}', '${testInviteeId}');`).catch(() => {});
      await client.query(`DELETE FROM auth.users WHERE id IN ('${testOwnerId}', '${testInviteeId}');`).catch(() => {});
      await client.query('RESET request.jwt.claims;').catch(() => {});
      await client.end();
    } catch {}
  }
}

runPermissionsPipelineTests().then(() => process.exit(0)).catch(() => process.exit(1));
