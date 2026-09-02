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

async function runInvitationFkProfileTests() {
  const watchdog = setTimeout(() => {
    console.error('TIMEOUT: Suíte excedeu 20 segundos.');
    process.exit(1);
  }, 20000);

  const client = getDbClient();

  const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
  const realInvId = '92c40a8e-ffd0-48a5-ae53-5ad3d6f28b0b';

  // Fixtures de teste
  const testOrgId = crypto.randomUUID();
  const testOwnerId = crypto.randomUUID();
  const testInviteeId = crypto.randomUUID();
  const testInviteeEmail = `fk-test-invitee-${Date.now()}@prexyon.com`;

  try {
    await client.connect();
    await client.query("SET statement_timeout = '4000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: REGRESSÃO REAL FK PROFILE & ACEITE');
    console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
    console.log('================================================================\n');

    // 1. Criar organização de teste e Owner com profile
    await client.query(`
      INSERT INTO auth.users (id, email) VALUES ('${testOwnerId}', 'owner-fk-${Date.now()}@prexyon.com');
      INSERT INTO public.profiles (id, full_name, email) VALUES ('${testOwnerId}', 'Owner FK Test', 'owner-fk-${Date.now()}@prexyon.com');
      INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
      VALUES ('${testOrgId}', 'Gráfica FK Test', 'Gráfica FK Test LTDA', true);
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
      VALUES ('${testOrgId}', '${testOwnerId}', 'owner', true);
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, expires_at)
      VALUES ('${testOrgId}', 'orcagraf', 'system', 'FK Entitlement Test', now() + interval '7 days');
    `);

    // 2. Criar Convidado EXCLUSIVAMENTE em auth.users (SEM PROFILE EM public.profiles)
    await client.query(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (
        '${testInviteeId}',
        '${testInviteeEmail}',
        '{"full_name": "Convidado Sem Profile Inicial"}'::jsonb
      );
    `);

    // Validação 1, 2 & 3: Convidado em auth.users, sem membership, e profile ausente
    const profileBefore = await client.query(`SELECT * FROM public.profiles WHERE id = $1;`, [testInviteeId]);
    assert(
      profileBefore.rows.length === 0,
      'Passo 1, 2 & 3: Convidado existe em auth.users mas NÃO possui registro prévio em public.profiles',
      '0 profiles',
      `${profileBefore.rows.length} profiles`
    );

    // 4. Criar convite válido para o usuário
    const rawToken = `inv_fk_${crypto.randomBytes(16).toString('hex')}`;
    await client.query(`SET request.jwt.claims = '{"sub": "${testOwnerId}"}';`);
    const invRes = await client.query(
      `SELECT public.prexyon_invite_user(
        $1::uuid,
        $2::text,
        'member',
        ARRAY['orcagraf']::text[],
        '{"orcagraf": ["orcagraf.view", "orcagraf.quotes.view", "orcagraf.quotes.create"]}'::jsonb,
        $3::text
      ) as res;`,
      [testOrgId, testInviteeEmail, rawToken]
    );
    const createdInvId = invRes.rows[0]?.res?.id;
    assert(
      Boolean(createdInvId),
      'Passo 4: Convite válido criado com token raw temporário',
      'Convite gerado',
      `id=${createdInvId}`
    );

    // 5 & 6. Usuário aceita o convite com sua identidade autenticada -> FK não deve falhar
    await client.query(`SET request.jwt.claims = '{"sub": "${testInviteeId}", "email": "${testInviteeEmail}"}';`);
    const acceptRes = await client.query(
      `SELECT public.prexyon_accept_invitation($1::text) as res;`,
      [rawToken]
    );
    assert(
      acceptRes.rows[0]?.res?.success === true,
      'Passo 5 & 6: Aceite é executado com sucesso e FK organization_members_user_id_fkey NÃO falha',
      'success=true',
      `success=${acceptRes.rows[0]?.res?.success}`
    );

    // 7. Registro canônico em public.profiles foi criado/sincronizado automaticamente
    const profileAfter = await client.query(`SELECT * FROM public.profiles WHERE id = $1;`, [testInviteeId]);
    const prof = profileAfter.rows[0];
    assert(
      prof && prof.email === testInviteeEmail && prof.full_name === 'Convidado Sem Profile Inicial',
      'Passo 7: Registro canônico em public.profiles foi criado de forma atômica com os dados do usuário',
      `email=${testInviteeEmail}, full_name=Convidado Sem Profile Inicial`,
      `email=${prof?.email}, full_name=${prof?.full_name}`
    );

    // 8, 9 & 10. organization_members criado com role member e status active
    const memberCheck = await client.query(
      `SELECT organization_id, role, is_active FROM public.organization_members WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, testInviteeId]
    );
    const member = memberCheck.rows[0];
    assert(
      member && member.role === 'member' && member.is_active === true,
      'Passo 8, 9 & 10: organization_members criado na organização com role=member e is_active=true',
      'role=member, is_active=true',
      `role=${member?.role}, is_active=${member?.is_active}`
    );

    // 11, 13 & 14. OrçaGraf habilitado; ArteFlow e ArteCheck bloqueados
    const prodAccessCheck = await client.query(
      `SELECT product_key, is_enabled FROM public.organization_member_product_access WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, testInviteeId]
    );
    const activeProds = prodAccessCheck.rows.filter(r => r.is_enabled).map(r => r.product_key);
    assert(
      activeProds.length === 1 && activeProds.includes('orcagraf'),
      'Passo 11, 13 & 14: OrçaGraf habilitado; ArteFlow e ArteCheck estritamente ausentes/bloqueados',
      '["orcagraf"]',
      JSON.stringify(activeProds)
    );

    // 12. Exatamente as 3 permissões granulares registradas
    const permsCheck = await client.query(
      `SELECT permission_key, is_granted FROM public.product_permissions WHERE organization_id = $1 AND user_id = $2;`,
      [testOrgId, testInviteeId]
    );
    const grantedPerms = permsCheck.rows.filter(r => r.is_granted).map(r => r.permission_key);
    assert(
      grantedPerms.length === 3 &&
      grantedPerms.includes('orcagraf.view') &&
      grantedPerms.includes('orcagraf.quotes.view') &&
      grantedPerms.includes('orcagraf.quotes.create'),
      'Passo 12: Exatamente as 3 permissões canônicas foram gravadas em product_permissions',
      '3 grants: orcagraf.view, orcagraf.quotes.view, orcagraf.quotes.create',
      `${grantedPerms.length} grants: ${grantedPerms.join(', ')}`
    );

    // 15. accepted_at preenchido
    const invCheck = await client.query(`SELECT accepted_at, revoked_at FROM public.organization_invitations WHERE id = $1;`, [createdInvId]);
    assert(
      invCheck.rows[0]?.accepted_at !== null && invCheck.rows[0]?.revoked_at === null,
      'Passo 15: Convite de teste teve accepted_at preenchido com timestamp de aceite',
      'accepted_at IS NOT NULL',
      `accepted_at=${invCheck.rows[0]?.accepted_at}`
    );

    // 16. Nenhuma organização nova foi criada para o convidado
    const orgsOfInvitee = await client.query(
      `SELECT organization_id FROM public.organization_members WHERE user_id = $1;`,
      [testInviteeId]
    );
    assert(
      orgsOfInvitee.rows.length === 1 && orgsOfInvitee.rows[0].organization_id === testOrgId,
      'Passo 16: Convidado pertence exclusivamente à organização convidada (nenhuma organização nova criada)',
      `1 vínculo: ${testOrgId}`,
      `${orgsOfInvitee.rows.length} vínculos: ${orgsOfInvitee.rows.map(r => r.organization_id).join(', ')}`
    );

    // 17. Segunda tentativa bloqueada por anti-replay
    let replayBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation($1::text);`, [rawToken]);
    } catch (err: any) {
      replayBlocked = err.message.includes('INVITATION_ALREADY_USED');
    }
    assert(
      replayBlocked,
      'Passo 17: Segunda tentativa de aceite é bloqueada por Anti-Replay (INVITATION_ALREADY_USED)',
      'Exceção INVITATION_ALREADY_USED',
      replayBlocked ? 'Bloqueado com sucesso' : 'Falhou: permitiu reuso'
    );

    // Auditoria do convite real
    const realInvAudit = await client.query(
      `SELECT id, accepted_at, revoked_at FROM public.organization_invitations WHERE id = $1;`,
      [realInvId]
    );
    const realInv = realInvAudit.rows[0];
    assert(
      realInv && realInv.accepted_at === null && realInv.revoked_at === null,
      'Auditoria de Preservação: Convite real 92c40a8e permanece intocado (accepted_at=NULL, revoked_at=NULL)',
      'accepted_at=null, revoked_at=null',
      `accepted_at=${realInv?.accepted_at}, revoked_at=${realInv?.revoked_at}`
    );

    console.log('================================================================');
    console.log('TOTAL DE TESTES DA SUÍTE FK PROFILE: 9');
    console.log('APROVADOS:                           9');
    console.log('REPROVADOS:                          0');
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('ERRO FATAL NA SUÍTE FK PROFILE:', err);
    process.exit(1);
  } finally {
    try {
      await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.product_permissions WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_invitations WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organization_members WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.organizations WHERE id = '${testOrgId}';`).catch(() => {});
      await client.query(`DELETE FROM public.profiles WHERE id IN ('${testOwnerId}', '${testInviteeId}');`).catch(() => {});
      await client.query(`DELETE FROM auth.users WHERE id IN ('${testOwnerId}', '${testInviteeId}');`).catch(() => {});
      await client.query('RESET request.jwt.claims;').catch(() => {});
    } catch {}

    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(0);
  }
}

runInvitationFkProfileTests();
