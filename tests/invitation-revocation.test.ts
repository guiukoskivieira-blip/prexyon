import crypto from 'crypto';
import { getDbClient } from './db-client';

function assert(condition: boolean, testName: string, expected: string, found: any) {
  if (!condition) {
    console.error(`\n[FALHOU] ${testName}`);
    console.error(`   Esperado:   ${expected}`);
    console.error(`   Encontrado: ${JSON.stringify(found)}`);
    throw new Error(`FALHA_ASSERT: ${testName}`);
  }
  console.log(`\n[PASSOU] ${testName}`);
  console.log(`   Esperado:   ${expected}`);
  console.log(`   Encontrado: ${typeof found === 'object' ? JSON.stringify(found) : found}`);
}

async function runInvitationRevocationTests() {
  console.log('================================================================');
  console.log('PREXYON — SUÍTE DE TESTES: REVOGAÇÃO SEGURA DE CONVITES');
  console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  const client = getDbClient();
  await client.connect();

  const ts = Date.now();
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();

  const ownerAId = crypto.randomUUID();
  const adminAId = crypto.randomUUID();
  const memberAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();

  const invitee1Id = crypto.randomUUID();
  const invitee1Email = `invitee1-${ts}@prexyon.com`;

  const invitee2Id = crypto.randomUUID();
  const invitee2Email = `invitee2-${ts}@prexyon.com`;

  let passed = 0;

  try {
    // Limpeza defensiva de testes anteriores
    await client.query(`DELETE FROM public.organizations WHERE id IN ('a0000000-0000-4000-a000-000000000099', 'b0000000-0000-4000-b000-000000000099');`).catch(() => {});
    await client.query(`DELETE FROM auth.users WHERE id LIKE '%0000-4000-%00000000009%';`).catch(() => {});
    // --------------------------------------------------------------------------
    // SETUP FIXTURES DE TESTE
    // --------------------------------------------------------------------------
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgAId}', 'Gráfica Revoke A', 'Gráfica Revoke LTDA', true);`);
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgBId}', 'Gráfica Revoke B', 'Gráfica Revoke B LTDA', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerAId}', 'owner-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerAId}', 'Owner Org A', 'owner-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${ownerAId}', 'owner', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${adminAId}', 'admin-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${adminAId}', 'Admin Org A', 'admin-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${adminAId}', 'admin', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${memberAId}', 'member-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${memberAId}', 'Member Org A', 'member-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${memberAId}', 'member', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerBId}', 'ownerb-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerBId}', 'Owner Org B', 'ownerb-rev-${ts}@prexyon.com');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgBId}', '${ownerBId}', 'owner', true);`);

    // Criar dois convites manuais diretamente em Org A
    const rawToken1 = 'inv_tok1_' + crypto.randomBytes(16).toString('hex');
    const tokenHash1 = crypto.createHash('sha256').update(rawToken1).digest('hex');
    const inv1Res = await client.query(`
      INSERT INTO public.organization_invitations (organization_id, email, role, token_hash, invited_by, product_access, permissions, expires_at)
      VALUES ('${orgAId}', '${invitee1Email}', 'member', '${tokenHash1}', '${ownerAId}', '["orcagraf"]'::jsonb, '{}'::jsonb, now() + interval '7 days')
      RETURNING id;
    `);
    const inv1Id = inv1Res.rows[0].id;

    const rawToken2 = 'inv_tok2_' + crypto.randomBytes(16).toString('hex');
    const tokenHash2 = crypto.createHash('sha256').update(rawToken2).digest('hex');
    const inv2Res = await client.query(`
      INSERT INTO public.organization_invitations (organization_id, email, role, token_hash, invited_by, product_access, permissions, expires_at)
      VALUES ('${orgAId}', '${invitee2Email}', 'member', '${tokenHash2}', '${ownerAId}', '["orcagraf"]'::jsonb, '{}'::jsonb, now() + interval '7 days')
      RETURNING id;
    `);
    const inv2Id = inv2Res.rows[0].id;

    // --------------------------------------------------------------------------
    // TESTE 1: MEMBER não consegue revogar convite (42501 UNAUTHORIZED)
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${memberAId}"}';`);
    let memberErr: any = null;
    try {
      await client.query(`SELECT public.prexyon_revoke_invitation($1::uuid, 'Tentativa member') as res;`, [inv1Id]);
    } catch (err: any) {
      memberErr = err;
    }
    assert(
      memberErr && memberErr.message.includes('UNAUTHORIZED'),
      'Teste 1: MEMBER é impedido de revogar convite (UNAUTHORIZED)',
      'UNAUTHORIZED: Only owners and admins can revoke invitations',
      memberErr?.message
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 2: Chamada anônima (sem JWT) é rejeitada com UNAUTHENTICATED
    // --------------------------------------------------------------------------
    await client.query(`RESET request.jwt.claims;`);
    let anonErr: any = null;
    try {
      await client.query(`SELECT public.prexyon_revoke_invitation($1::uuid, 'Tentativa anon') as res;`, [inv1Id]);
    } catch (err: any) {
      anonErr = err;
    }
    assert(
      anonErr && (anonErr.message.includes('UNAUTHENTICATED') || anonErr.code === '42501'),
      'Teste 2: Chamada anônima é estritamente rejeitada com UNAUTHENTICATED',
      'UNAUTHENTICATED',
      anonErr?.message
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 3: Usuário de outra organização (Cross-Tenant) é bloqueado
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerBId}"}';`);
    let crossErr: any = null;
    try {
      await client.query(`SELECT public.prexyon_revoke_invitation($1::uuid, 'Tentativa cross tenant') as res;`, [inv1Id]);
    } catch (err: any) {
      crossErr = err;
    }
    assert(
      crossErr && crossErr.message.includes('UNAUTHORIZED'),
      'Teste 3: OWNER de outra organização é impedido de revogar convite (Isolamento Cross-Tenant)',
      'UNAUTHORIZED',
      crossErr?.message
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 4: ADMIN revoga convite com sucesso
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${adminAId}"}';`);
    const adminRevokeRes = await client.query(
      `SELECT public.prexyon_revoke_invitation($1::uuid, 'Cancelado pelo Administrador') as res;`,
      [inv1Id]
    );
    const adminRevData = adminRevokeRes.rows[0]?.res;

    assert(
      adminRevData && adminRevData.success === true && adminRevData.revoked_by === adminAId,
      'Teste 4: ADMIN revoga convite pendente com sucesso',
      `success=true, revoked_by=${adminAId}`,
      `success=${adminRevData?.success}, revoked_by=${adminRevData?.revoked_by}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 5: Convite revogado NÃO pode ser aceito (INVITATION_REVOKED)
    // --------------------------------------------------------------------------
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${invitee1Id}', '${invitee1Email}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${invitee1Id}', 'Invitee 1', '${invitee1Email}');`);

    await client.query(`SET request.jwt.claims = '{"sub": "${invitee1Id}", "email": "${invitee1Email}"}';`);
    let acceptErr: any = null;
    try {
      await client.query(`SELECT public.prexyon_accept_invitation($1::text) as res;`, [rawToken1]);
    } catch (err: any) {
      acceptErr = err;
    }

    assert(
      acceptErr && (acceptErr.message.includes('INVITATION_REVOKED') || acceptErr.code === 'P0005'),
      'Teste 5: Tentativa de aceitar convite revogado é bloqueada (INVITATION_REVOKED)',
      'INVITATION_REVOKED (P0005)',
      acceptErr?.message
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 6: Segundo revoke é seguro e idempotente (already_revoked = true)
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}"}';`);
    const secondRevokeRes = await client.query(
      `SELECT public.prexyon_revoke_invitation($1::uuid, 'Segunda tentativa') as res;`,
      [inv1Id]
    );
    const secondRevData = secondRevokeRes.rows[0]?.res;

    assert(
      secondRevData && secondRevData.success === true && secondRevData.already_revoked === true,
      'Teste 6: Segunda revogação do mesmo convite é segura e idempotente',
      'success=true, already_revoked=true',
      `success=${secondRevData?.success}, already_revoked=${secondRevData?.already_revoked}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 7: Convite aceito NÃO pode ser revogado
    // --------------------------------------------------------------------------
    // Marcar convite 2 como já aceito
    await client.query(`UPDATE public.organization_invitations SET accepted_at = now() WHERE id = '${inv2Id}';`);

    // Tentar revogar convite 2 já aceito como OWNER
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}"}';`);
    let revokeAcceptedErr: any = null;
    try {
      await client.query(`SELECT public.prexyon_revoke_invitation($1::uuid, 'Tentando revogar aceito') as res;`, [inv2Id]);
    } catch (err: any) {
      revokeAcceptedErr = err;
    }

    assert(
      revokeAcceptedErr &&
      (revokeAcceptedErr.message.includes('CANNOT_REVOKE_ACCEPTED_INVITATION') || revokeAcceptedErr.code === 'P0003'),
      'Teste 7: Convite que já foi aceito não pode ser revogado (CANNOT_REVOKE_ACCEPTED_INVITATION)',
      'CANNOT_REVOKE_ACCEPTED_INVITATION',
      revokeAcceptedErr?.message
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 8: OWNER revoga convite pendente, persiste revoked_by e gera audit log
    // --------------------------------------------------------------------------
    const rawToken3 = 'inv_tok3_' + crypto.randomBytes(16).toString('hex');
    const tokenHash3 = crypto.createHash('sha256').update(rawToken3).digest('hex');
    const inv3Res = await client.query(`
      INSERT INTO public.organization_invitations (organization_id, email, role, token_hash, invited_by, product_access, permissions, expires_at)
      VALUES ('${orgAId}', 'invitee3-${ts}@prexyon.com', 'member', '${tokenHash3}', '${ownerAId}', '["orcagraf"]'::jsonb, '{}'::jsonb, now() + interval '7 days')
      RETURNING id;
    `);
    const inv3Id = inv3Res.rows[0].id;

    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}"}';`);
    const ownerRevokeRes = await client.query(
      `SELECT public.prexyon_revoke_invitation($1::uuid, 'Revogado pelo Owner em teste') as res;`,
      [inv3Id]
    );
    const ownerRevData = ownerRevokeRes.rows[0]?.res;

    // Inspecionar persistência no banco
    const dbInv3Res = await client.query(
      `SELECT revoked_at, revoked_by, revocation_reason, accepted_at FROM public.organization_invitations WHERE id = $1;`,
      [inv3Id]
    );
    const dbInv3 = dbInv3Res.rows[0];

    // Inspecionar audit log
    const auditRes = await client.query(
      `SELECT actor_user_id, action, metadata FROM public.prexyon_audit_logs WHERE entity_id = $1;`,
      [inv3Id]
    );
    const auditRow = auditRes.rows[0];

    assert(
      ownerRevData?.success === true &&
      dbInv3.revoked_at !== null &&
      dbInv3.accepted_at === null &&
      dbInv3.revoked_by === ownerAId &&
      dbInv3.revocation_reason === 'Revogado pelo Owner em teste' &&
      auditRow?.actor_user_id === ownerAId &&
      auditRow?.action === 'invitation_revoked',
      'Teste 8: OWNER revoga convite pendente, registrando revoked_by e audit log autêntico',
      `revoked_by=${ownerAId}, action=invitation_revoked`,
      `dbRevokedBy=${dbInv3.revoked_by}, auditAction=${auditRow?.action}`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 9: Nenhuma deleção física ocorre (todos os registros permanecem no banco)
    // --------------------------------------------------------------------------
    const countRes = await client.query(
      `SELECT count(*) as count FROM public.organization_invitations WHERE id IN ('${inv1Id}', '${inv2Id}', '${inv3Id}');`
    );
    const retainedCount = parseInt(countRes.rows[0].count, 10);

    assert(
      retainedCount === 3,
      'Teste 9: Nenhuma deleção física ocorre; registros são estritamente preservados no histórico',
      '3 convites retidos fisicamente',
      `${retainedCount} convites encontrados`
    );
    passed++;

    // --------------------------------------------------------------------------
    // TESTE 10: Preservação estrita do convite legado real da organização de homologação
    // --------------------------------------------------------------------------
    const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
    const legacyInvId = 'be86e0a0-f89c-4e4f-a5fc-efa7f433d34b';

    const realInvRes = await client.query(
      `SELECT id, accepted_at, revoked_at FROM public.organization_invitations WHERE organization_id = $1;`,
      [realOrgId]
    );

    assert(
      realInvRes.rows.length === 3 &&
      realInvRes.rows.some(r => r.id === legacyInvId && r.revoked_at !== null) &&
      realInvRes.rows.some(r => r.id === '5b91b7c5-fd74-4960-aa4f-aa47ae5d4cb1' && r.revoked_at !== null) &&
      realInvRes.rows.some(r => r.id === '92c40a8e-ffd0-48a5-ae53-5ad3d6f28b0b' && r.accepted_at === null && r.revoked_at === null),
      'Teste 10: Organização real possui exatamente os convites reais esperados, sem fixtures vazadas',
      '3 convites reais preservados no histórico',
      `${realInvRes.rows.length} convites na org real`
    );
    passed++;

  } finally {
    // TEARDOWN COMPLETO DAS FIXTURES DE TESTE
    await client.query(`RESET request.jwt.claims;`);
    await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.product_permissions WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organization_member_product_access WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organization_invitations WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organizations WHERE id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.profiles WHERE id IN ('${ownerAId}', '${adminAId}', '${memberAId}', '${ownerBId}', '${invitee1Id}', '${invitee2Id}');`);
    await client.query(`DELETE FROM auth.users WHERE id IN ('${ownerAId}', '${adminAId}', '${memberAId}', '${ownerBId}', '${invitee1Id}', '${invitee2Id}');`);

    await client.end();
  }

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${passed}`);
  console.log(`APROVADOS:                  ${passed}`);
  console.log(`REPROVADOS:                 0`);
  console.log('================================================================\n');
}

runInvitationRevocationTests().catch((err) => {
  console.error('\nERRO FATAL NA SUÍTE DE TESTES:', err);
  process.exit(1);
});
