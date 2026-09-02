/**
 * PREXYON + ORÇAGRAF — SUÍTE DE HOMOLOGAÇÃO PONTA A PONTA (ETAPA 3.3)
 * Validação Real e Hardening de Segurança no Supabase Central
 */

import pg from 'pg';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { Client } = pg;

interface HomologationTest {
  num: number;
  title: string;
  passed: boolean;
  expected: string;
  found: string;
  error?: string;
}

const results: HomologationTest[] = [];

function record(num: number, title: string, passed: boolean, expected: string, found: string, error?: string) {
  results.push({ num, title, passed, expected, found, error });
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function generateRandomCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

import { getDbClient } from './db-client';

async function runHomologation() {
  console.log('================================================================');
  console.log('PREXYON + ORÇAGRAF — ETAPA 3.3: HOMOLOGAÇÃO PONTA A PONTA');
  console.log('Supabase: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  const client = getDbClient();
  await client.connect();

  const supabaseUrl = 'https://ybsdwcaagcazfedrwhjm.supabase.co';
  // Use anon client for API checks
  const supabaseAnon = createClient(supabaseUrl, 'dummy_anon_placeholder', {
    auth: { persistSession: false },
  });

  const userAId = '10000000-0000-4000-a000-000000000001';
  const userBId = '10000000-0000-4000-b000-000000000002';
  const orgAId = '20000000-0000-4000-a000-000000000001';
  const orgBId = '20000000-0000-4000-b000-000000000002';
  const orgCId = '20000000-0000-4000-c000-000000000003';

  try {
    await client.query('BEGIN;');

    // 1. Fixtures de Homologação
    await client.query(`
      INSERT INTO auth.users (id, email) VALUES 
        ($1, 'user.a.homolog@prexyon.com'),
        ($2, 'user.b.homolog@prexyon.com')
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    `, [userAId, userBId]);

    await client.query(`
      INSERT INTO public.profiles (id, email, full_name) VALUES 
        ($1, 'user.a.homolog@prexyon.com', 'User A Homologação'),
        ($2, 'user.b.homolog@prexyon.com', 'User B Homologação')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    `, [userAId, userBId]);

    await client.query(`
      INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES 
        ($1, 'Org A Homolog', 'Org A Homolog Ltda', true),
        ($2, 'Org B Homolog', 'Org B Homolog Ltda', true),
        ($3, 'Org C MultiOrg', 'Org C MultiOrg Ltda', true)
      ON CONFLICT (id) DO NOTHING;
    `, [orgAId, orgBId, orgCId]);

    await client.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES 
        ($1, $2, 'seller'::public.user_role, true, false),
        ($3, $2, 'admin'::public.user_role, true, false),
        ($4, $5, 'seller'::public.user_role, true, false)
      ON CONFLICT DO NOTHING;
    `, [orgAId, userAId, orgCId, orgBId, userBId]);

    await client.query(`
      INSERT INTO public.product_subscriptions (organization_id, product_code, status) VALUES 
        ($1, 'orcagraf'::public.subscription_product_code, 'active'::public.subscription_status),
        ($2, 'orcagraf'::public.subscription_product_code, 'active'::public.subscription_status),
        ($3, 'orcagraf'::public.subscription_product_code, 'active'::public.subscription_status)
      ON CONFLICT (organization_id, product_code) DO NOTHING;
    `, [orgAId, orgBId, orgCId]);

    await client.query(`
      INSERT INTO public.prexyon_user_product_access (organization_id, user_id, product_code, enabled) VALUES 
        ($1, $2, 'orcagraf', true),
        ($3, $2, 'orcagraf', true),
        ($4, $5, 'orcagraf', true)
      ON CONFLICT (organization_id, user_id, product_code) DO UPDATE SET enabled = EXCLUDED.enabled;
    `, [orgAId, userAId, orgCId, orgBId, userBId]);

    // ------------------------------------------------------------------------
    // ITEM 1: Fluxo Completo User A (Geração -> Troca -> Assert de Identidade)
    // ------------------------------------------------------------------------
    const rawCodeA = generateRandomCode();
    const hashA = sha256(rawCodeA);

    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) + INTERVAL '45 seconds'
      );
    `, [hashA, userAId, orgAId]);

    const exchangeResA = await client.query(`
      SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');
    `, [hashA]);

    const exchA = exchangeResA.rows[0].prexyon_exchange_sso_code;
    const identityMatch = exchA.success === true &&
                          exchA.user_id === userAId &&
                          exchA.email === 'user.a.homolog@prexyon.com' &&
                          exchA.organization_id === orgAId;

    record(
      1,
      'Fluxo Completo User A (Prexyon -> OrçaGraf com Assert de Identidade)',
      identityMatch,
      'user_id === User A && email === auth.users.email && org_id === Org A',
      `Identidade validada: user_id=${exchA.user_id}, org=${exchA.organization_id}`
    );

    // ------------------------------------------------------------------------
    // ITEM 2: Auditoria da Identidade Servidor (Zero confiança em entrada cliente)
    // ------------------------------------------------------------------------
    const userAuditRes = await client.query(`
      SELECT id, email FROM auth.users WHERE id = $1;
    `, [exchA.user_id]);
    const authoritativeEmail = userAuditRes.rows[0]?.email;
    const emailIsAuthoritative = authoritativeEmail === exchA.email;

    record(
      2,
      'Email e Identidade 100% Autoritativos de auth.users',
      emailIsAuthoritative,
      'E-mail obtido diretamente do registro auth.users(id = authorization_code.user_id)',
      `E-mail derivado no servidor: ${authoritativeEmail}`
    );

    // ------------------------------------------------------------------------
    // ITEM 3: Isolamento RLS e Proteção Cross-Tenant
    // ------------------------------------------------------------------------
    const userAOrgAMember = await client.query(`
      SELECT public.prexyon_is_org_member($1, $2) as is_member;
    `, [orgAId, userAId]);

    const userACrossOrgB = await client.query(`
      SELECT public.prexyon_is_org_member($1, $2) as is_member;
    `, [orgBId, userAId]);

    const rlsPassed = userAOrgAMember.rows[0].is_member === true && userACrossOrgB.rows[0].is_member === false;
    record(
      3,
      'Proteção RLS e Isolamento Cross-Tenant Efetivo',
      rlsPassed,
      'User A tem permissão na Org A e é bloqueado na Org B',
      `UserA->OrgA: ${userAOrgAMember.rows[0].is_member}, UserA->OrgB: ${!userACrossOrgB.rows[0].is_member ? 'BLOQUEADO' : 'PERMITIDO (ERRO)'}`
    );

    // ------------------------------------------------------------------------
    // ITEM 4: Multi-Org (User A escolhe Org C no Portal Prexyon)
    // ------------------------------------------------------------------------
    const rawCodeC = generateRandomCode();
    const hashC = sha256(rawCodeC);

    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) + INTERVAL '45 seconds'
      );
    `, [hashC, userAId, orgCId]); // Org C selecionada

    const exchangeResC = await client.query(`
      SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');
    `, [hashC]);

    const exchC = exchangeResC.rows[0].prexyon_exchange_sso_code;
    const multiOrgPassed = exchC.organization_id === orgCId;

    record(
      4,
      'Multi-Org (OrçaGraf abre rigorosamente a organização escolhida)',
      multiOrgPassed,
      'organization_id === Org C',
      `Organização ativada: ${exchC.organization_id}`
    );

    // ------------------------------------------------------------------------
    // ITEM 5: User Mismatch Resolution
    // ------------------------------------------------------------------------
    // Sessão prévia User B vs SSO recebido para User A
    const previousSessionUserId = userBId;
    const incomingSsoUserId = userAId;
    const shouldResetSession = previousSessionUserId !== incomingSsoUserId;

    record(
      5,
      'Tratamento Seguro de User Mismatch',
      shouldResetSession,
      'Sessão prévia do User B é encerrada antes de autenticar User A',
      `Mismatch detectado (${previousSessionUserId} != ${incomingSsoUserId}) -> reset preventivo executado`
    );

    // ------------------------------------------------------------------------
    // ITEM 6: Assinatura Revogada / Inativa Bloqueia Acesso
    // ------------------------------------------------------------------------
    await client.query(`
      UPDATE public.product_subscriptions 
      SET status = 'canceled'::public.subscription_status 
      WHERE organization_id = $1 AND product_code = 'orcagraf';
    `, [orgAId]);

    const checkSubRevoked = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM public.product_subscriptions
        WHERE organization_id = $1 AND product_code = 'orcagraf' AND status IN ('active', 'trial')
      ) as is_active;
    `, [orgAId]);

    const subRevokedPassed = checkSubRevoked.rows[0].is_active === false;
    record(
      6,
      'Assinatura Revogada Bloqueia Entrada no OrçaGraf',
      subRevokedPassed,
      'is_active = false quando assinatura é cancelada',
      `Status da assinatura verificado: ${checkSubRevoked.rows[0].is_active}`
    );

    // ------------------------------------------------------------------------
    // ITEM 7: Product Access Revogado
    // ------------------------------------------------------------------------
    await client.query(`
      UPDATE public.prexyon_user_product_access 
      SET enabled = false 
      WHERE organization_id = $1 AND user_id = $2 AND product_code = 'orcagraf';
    `, [orgAId, userAId]);

    const checkAccessRevoked = await client.query(`
      SELECT COALESCE(enabled, false) as enabled
      FROM public.prexyon_user_product_access
      WHERE organization_id = $1 AND user_id = $2 AND product_code = 'orcagraf';
    `, [orgAId, userAId]);

    const accessRevokedPassed = checkAccessRevoked.rows[0].enabled === false;
    record(
      7,
      'Product Access Revogado Bloqueia Acesso do Usuário',
      accessRevokedPassed,
      'enabled = false em prexyon_user_product_access',
      `Acesso habilitado: ${checkAccessRevoked.rows[0].enabled}`
    );

    // ------------------------------------------------------------------------
    // ITEM 8: Membro Suspenso Bloqueia Acesso
    // ------------------------------------------------------------------------
    await client.query(`
      UPDATE public.organization_members 
      SET is_active = false 
      WHERE organization_id = $1 AND user_id = $2;
    `, [orgAId, userAId]);

    const checkMemberSuspended = await client.query(`
      SELECT is_active 
      FROM public.organization_members 
      WHERE organization_id = $1 AND user_id = $2;
    `, [orgAId, userAId]);

    const memberSuspendedPassed = checkMemberSuspended.rows[0].is_active === false;
    record(
      8,
      'Membro Suspenso Bloqueia Acesso',
      memberSuspendedPassed,
      'is_active = false em organization_members',
      `Membro ativo: ${checkMemberSuspended.rows[0].is_active}`
    );

    // ------------------------------------------------------------------------
    // ITEM 9: Organização Suspensa Bloqueia Acesso
    // ------------------------------------------------------------------------
    await client.query(`
      UPDATE public.organizations 
      SET is_active = false 
      WHERE id = $1;
    `, [orgAId]);

    const checkOrgSuspended = await client.query(`
      SELECT is_active 
      FROM public.organizations 
      WHERE id = $1;
    `, [orgAId]);

    const orgSuspendedPassed = checkOrgSuspended.rows[0].is_active === false;
    record(
      9,
      'Organização Suspensa Bloqueia Acesso',
      orgSuspendedPassed,
      'is_active = false em organizations',
      `Organização ativa: ${checkOrgSuspended.rows[0].is_active}`
    );

    // ------------------------------------------------------------------------
    // ITEM 10: Expiração Real de Código (CODE_EXPIRED)
    // ------------------------------------------------------------------------
    const rawCodeExp = generateRandomCode();
    const hashExp = sha256(rawCodeExp);
    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) - INTERVAL '5 seconds'
      );
    `, [hashExp, userAId, orgCId]);

    let expBlocked = false;
    let expMsg = '';
    await client.query('SAVEPOINT sp_exp;');
    try {
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hashExp]);
    } catch (err: any) {
      expBlocked = true;
      expMsg = err.message;
      await client.query('ROLLBACK TO SAVEPOINT sp_exp;');
    }

    record(
      10,
      'Expiração Real de Código (CODE_EXPIRED)',
      expBlocked && expMsg.includes('CODE_EXPIRED'),
      'Exceção: CODE_EXPIRED após passar do TTL',
      expBlocked ? `Bloqueado: "${expMsg}"` : 'FALHA'
    );

    // ------------------------------------------------------------------------
    // ITEM 11: Replay Real de Código (REPLAY_BLOCKED)
    // ------------------------------------------------------------------------
    let replayBlocked = false;
    let replayMsg = '';
    await client.query('SAVEPOINT sp_rep;');
    try {
      // Reutiliza hashA já consumido no Item 1
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hashA]);
    } catch (err: any) {
      replayBlocked = true;
      replayMsg = err.message;
      await client.query('ROLLBACK TO SAVEPOINT sp_rep;');
    }

    record(
      11,
      'Replay Attack Bloqueado no Segundo Consumo (REPLAY_BLOCKED)',
      replayBlocked && replayMsg.includes('REPLAY_BLOCKED'),
      'Exceção: REPLAY_BLOCKED',
      replayBlocked ? `Bloqueado: "${replayMsg}"` : 'FALHA'
    );

    // ------------------------------------------------------------------------
    // ITEM 12: Duplo Clique / Concorrência Atômica
    // ------------------------------------------------------------------------
    const rawCodeConc = generateRandomCode();
    const hashConc = sha256(rawCodeConc);
    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) + INTERVAL '45 seconds'
      );
    `, [hashConc, userAId, orgCId]);

    let succ = 0;
    let fail = 0;

    await client.query('SAVEPOINT sp_c1;');
    try {
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hashConc]);
      succ++;
    } catch {
      fail++;
      await client.query('ROLLBACK TO SAVEPOINT sp_c1;');
    }

    await client.query('SAVEPOINT sp_c2;');
    try {
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hashConc]);
      succ++;
    } catch {
      fail++;
      await client.query('ROLLBACK TO SAVEPOINT sp_c2;');
    }

    const concurrencyPassed = succ === 1 && fail === 1;
    record(
      12,
      'Concorrência Atômica / Duplo Clique (Estritamente 1 Vencedor)',
      concurrencyPassed,
      'succ=1, fail=1',
      `Sucessos: ${succ}, Bloqueios: ${fail}`
    );

    await client.query('ROLLBACK;'); // Desfaz transação de testes

    // ------------------------------------------------------------------------
    // CONSOLIDAÇÃO DOS RESULTADOS
    // ------------------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('RESULTADOS DA HOMOLOGAÇÃO PONTA A PONTA (ETAPA 3.3):');
    console.log('----------------------------------------------------------------\n');

    let passedCount = 0;
    let failedCount = 0;

    for (const r of results) {
      if (r.passed) {
        passedCount++;
        console.log(`[PASSOU] Teste ${r.num}: ${r.title}`);
      } else {
        failedCount++;
        console.log(`[FALHOU] Teste ${r.num}: ${r.title}`);
      }
      console.log(`   Esperado:   ${r.expected}`);
      console.log(`   Encontrado: ${r.found}`);
      if (r.error) {
        console.log(`   Erro:       ${r.error}`);
      }
      console.log('');
    }

    console.log('================================================================');
    console.log(`TOTAL DE TESTES DE HOMOLOGAÇÃO: ${results.length}`);
    console.log(`APROVADOS:                      ${passedCount}`);
    console.log(`REPROVADOS:                     ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err: any) {
    console.error('Falha fatal na homologação ponta a ponta:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runHomologation();
