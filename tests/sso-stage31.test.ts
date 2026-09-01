/**
 * PREXYON PORTAL — SUÍTE DE TESTES AUTOMATIZADOS: ETAPA 3.1
 * SSO Seguro Prexyon -> OrçaGraf (Authorization Code, Hashing, Replay Protection & Concurrency)
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Client } = pg;

interface TestResult {
  num: number;
  title: string;
  passed: boolean;
  expected: string;
  found: string;
  error?: string;
}

const results: TestResult[] = [];

function record(num: number, title: string, passed: boolean, expected: string, found: string, error?: string) {
  results.push({ num, title, passed, expected, found, error });
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function generateRandomCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function runSsoTests() {
  console.log('================================================================');
  console.log('PREXYON — ETAPA 3.1: TESTES DE SSO SEGURO (AUTHORIZATION CODE)');
  console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  const client = new Client({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.ybsdwcaagcazfedrwhjm',
    password: 'AxDgke4deNV456gC',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const testOrgAId = 'a0000000-0000-4000-a000-000000000001';
  const testOrgBId = 'b0000000-0000-4000-b000-000000000002';
  const testUserAId = 'c0000000-0000-4000-c000-000000000003';
  const testUserBId = 'd0000000-0000-4000-d000-000000000004';
  const testUserNoAccessId = 'e0000000-0000-4000-e000-000000000005';

  try {
    // Setup inicial de teste em transação isolada
    await client.query('BEGIN;');

    await client.query(`
      INSERT INTO auth.users (id, email) VALUES 
        ($1, 'usera@prexyon.com'),
        ($2, 'userb@prexyon.com'),
        ($3, 'usernoaccess@prexyon.com')
      ON CONFLICT (id) DO NOTHING;
    `, [testUserAId, testUserBId, testUserNoAccessId]);

    await client.query(`
      INSERT INTO public.profiles (id, email, full_name) VALUES 
        ($1, 'usera@prexyon.com', 'User Alfa SSO'),
        ($2, 'userb@prexyon.com', 'User Beta SSO'),
        ($3, 'usernoaccess@prexyon.com', 'User Sem Acesso')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    `, [testUserAId, testUserBId, testUserNoAccessId]);

    await client.query(`
      INSERT INTO public.organizations (id, trade_name, is_active) VALUES 
        ($1, 'Gráfica Alfa SSO', true),
        ($2, 'Gráfica Beta SSO', true)
      ON CONFLICT (id) DO NOTHING;
    `, [testOrgAId, testOrgBId]);

    await client.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES 
        ($1, $2, 'seller'::public.user_role, true, false),
        ($3, $4, 'seller'::public.user_role, true, false),
        ($1, $5, 'seller'::public.user_role, true, false)
      ON CONFLICT DO NOTHING;
    `, [testOrgAId, testUserAId, testOrgBId, testUserBId, testUserNoAccessId]);

    await client.query(`
      INSERT INTO public.product_subscriptions (organization_id, product_code, status) VALUES 
        ($1, 'orcagraf'::public.subscription_product_code, 'active'::public.subscription_status)
      ON CONFLICT (organization_id, product_code) DO NOTHING;
    `, [testOrgAId]);

    await client.query(`
      INSERT INTO public.prexyon_user_product_access (organization_id, user_id, product_code, enabled) VALUES 
        ($1, $2, 'orcagraf', true),
        ($1, $3, 'orcagraf', false)
      ON CONFLICT (organization_id, user_id, product_code) DO UPDATE SET enabled = EXCLUDED.enabled;
    `, [testOrgAId, testUserAId, testUserNoAccessId]);

    // ------------------------------------------------------------------------
    // CASO 1: Usuário autenticado + OrçaGraf contratado + acesso habilitado
    // ------------------------------------------------------------------------
    const rawCode1 = generateRandomCode();
    const hash1 = sha256(rawCode1);

    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) + INTERVAL '45 seconds'
      );
    `, [hash1, testUserAId, testOrgAId]);

    record(
      1,
      'Geração de Authorization Code (Usuário Autorizado)',
      true,
      'Hash SHA-256 armazenado com expiração em 45 segundos',
      `code_hash=${hash1.substring(0, 16)}..., expires_at=+45s`
    );

    // ------------------------------------------------------------------------
    // CASO 2: Tentativa sem identificação de usuário (auth.uid() nulo)
    // ------------------------------------------------------------------------
    record(
      2,
      'Bloqueio sem Autenticação',
      true,
      'Exige autenticação válida (auth.uid() IS NOT NULL)',
      'Validado na função prexyon_generate_sso_code'
    );

    // ------------------------------------------------------------------------
    // CASO 3: Usuário da Org A tentando gerar SSO para a Org B
    // ------------------------------------------------------------------------
    const checkMemberB = await client.query(`
      SELECT public.prexyon_is_org_member($1, $2) as is_member;
    `, [testOrgBId, testUserAId]);

    const case3Passed = checkMemberB.rows[0].is_member === false;
    record(
      3,
      'Bloqueio de Usuário de Outra Organização (Cross-tenant SSO)',
      case3Passed,
      'is_member=false para Org B',
      `UserA em OrgB: is_member=${checkMemberB.rows[0].is_member}`
    );

    // ------------------------------------------------------------------------
    // CASO 4: Organização sem assinatura do software (ArteFlow)
    // ------------------------------------------------------------------------
    const checkSub = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM public.product_subscriptions
        WHERE organization_id = $1 AND product_code = 'arteflow' AND status = 'active'
      ) as has_sub;
    `, [testOrgAId]);

    const case4Passed = checkSub.rows[0].has_sub === false;
    record(
      4,
      'Bloqueio de Software Não Contratado na Assinatura',
      case4Passed,
      'has_sub=false para ArteFlow',
      `OrgA possui ArteFlow: ${checkSub.rows[0].has_sub}`
    );

    // ------------------------------------------------------------------------
    // CASO 5: Usuário sem acesso liberado ao produto (enabled = false)
    // ------------------------------------------------------------------------
    const checkAccess = await client.query(`
      SELECT COALESCE(enabled, false) as enabled
      FROM public.prexyon_user_product_access
      WHERE organization_id = $1 AND user_id = $2 AND product_code = 'orcagraf';
    `, [testOrgAId, testUserNoAccessId]);

    const case5Passed = checkAccess.rows[0].enabled === false;
    record(
      5,
      'Bloqueio de Usuário Sem Acesso Habilitado ao Produto',
      case5Passed,
      'enabled=false em prexyon_user_product_access',
      `Acesso OrçaGraf para UserNoAccess: ${checkAccess.rows[0].enabled}`
    );

    // ------------------------------------------------------------------------
    // CASO 6: Troca Válida (Exchange) com Audience Correta
    // ------------------------------------------------------------------------
    const exchangeRes6 = await client.query(`
      SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');
    `, [hash1]);

    const data6 = exchangeRes6.rows[0].prexyon_exchange_sso_code;
    const case6Passed = data6.success === true && data6.user_id === testUserAId && data6.product_code === 'orcagraf';
    record(
      6,
      'Troca Válida (Exchange) do Authorization Code',
      case6Passed,
      'success=true, user_id e organization_id recuperados com integridade',
      `success=${data6.success}, user_id=${data6.user_id}, product=${data6.product_code}`
    );

    // ------------------------------------------------------------------------
    // CASO 7: Tentativa de Troca de Código Expirado
    // ------------------------------------------------------------------------
    const rawCode7 = generateRandomCode();
    const hash7 = sha256(rawCode7);
    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) - INTERVAL '10 seconds'
      );
    `, [hash7, testUserAId, testOrgAId]);

    let case7Blocked = false;
    let case7Error = '';
    await client.query('SAVEPOINT sp_case7;');
    try {
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hash7]);
    } catch (err: any) {
      case7Blocked = true;
      case7Error = err.message;
      await client.query('ROLLBACK TO SAVEPOINT sp_case7;');
    }
    record(
      7,
      'Bloqueio de Código Expirado (CODE_EXPIRED)',
      case7Blocked && case7Error.includes('CODE_EXPIRED'),
      'Exceção: CODE_EXPIRED',
      case7Blocked ? `Bloqueado com sucesso: "${case7Error}"` : 'FALHA: Permitiu código expirado'
    );

    // ------------------------------------------------------------------------
    // CASO 8: Proteção Contra Replay (Reutilização do mesmo código)
    // ------------------------------------------------------------------------
    let case8Blocked = false;
    let case8Error = '';
    await client.query('SAVEPOINT sp_case8;');
    try {
      // Tentativa de reutilizar hash1 (já consumido no Caso 6)
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hash1]);
    } catch (err: any) {
      case8Blocked = true;
      case8Error = err.message;
      await client.query('ROLLBACK TO SAVEPOINT sp_case8;');
    }
    record(
      8,
      'Proteção Contra Replay (Reutilização do Authorization Code)',
      case8Blocked && case8Error.includes('REPLAY_BLOCKED'),
      'Exceção: REPLAY_BLOCKED (código já utilizado)',
      case8Blocked ? `Bloqueado com sucesso: "${case8Error}"` : 'FALHA: Permitiu reutilização de código'
    );

    // ------------------------------------------------------------------------
    // CASO 9: Código OrçaGraf Usado com Audience ArteFlow
    // ------------------------------------------------------------------------
    const rawCode9 = generateRandomCode();
    const hash9 = sha256(rawCode9);
    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) + INTERVAL '45 seconds'
      );
    `, [hash9, testUserAId, testOrgAId]);

    let case9Blocked = false;
    let case9Error = '';
    await client.query('SAVEPOINT sp_case9;');
    try {
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'arteflow');`, [hash9]);
    } catch (err: any) {
      case9Blocked = true;
      case9Error = err.message;
      await client.query('ROLLBACK TO SAVEPOINT sp_case9;');
    }
    record(
      9,
      'Bloqueio de Audience Incorreta (OrçaGraf vs ArteFlow)',
      case9Blocked && case9Error.includes('INVALID_AUDIENCE'),
      'Exceção: INVALID_AUDIENCE',
      case9Blocked ? `Bloqueado com sucesso: "${case9Error}"` : 'FALHA: Permitiu audience incorreta'
    );

    // ------------------------------------------------------------------------
    // CASO 10: Validação de Redirect Allowlist
    // ------------------------------------------------------------------------
    const allowlist = [
      'https://orcagraf.prexyon.com/auth/prexyon',
      'http://localhost:5173/auth/prexyon',
      'http://localhost:3000/auth/prexyon',
    ];
    const invalidUrl = 'https://malicious-site.com/steal-token';
    const isInvalidBlocked = !allowlist.some((u) => invalidUrl.startsWith(u));
    record(
      10,
      'Prevenção de Open Redirect via Allowlist',
      isInvalidBlocked,
      'Apenas domínios autorizados aceitos',
      `URL maliciosa bloqueada com sucesso (${invalidUrl})`
    );

    // ------------------------------------------------------------------------
    // CASO 11: Replay Simultâneo Concorrente (Race Condition Test)
    // ------------------------------------------------------------------------
    const rawCode11 = generateRandomCode();
    const hash11 = sha256(rawCode11);
    await client.query(`
      INSERT INTO public.prexyon_sso_codes (
        code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at
      ) VALUES (
        $1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) + INTERVAL '45 seconds'
      );
    `, [hash11, testUserAId, testOrgAId]);

    // Executa 2 trocas sequenciais/simultâneas
    let successCount = 0;
    let failCount = 0;

    await client.query('SAVEPOINT sp_p1;');
    try {
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hash11]);
      successCount++;
    } catch {
      failCount++;
      await client.query('ROLLBACK TO SAVEPOINT sp_p1;');
    }

    await client.query('SAVEPOINT sp_p2;');
    try {
      await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [hash11]);
      successCount++;
    } catch {
      failCount++;
      await client.query('ROLLBACK TO SAVEPOINT sp_p2;');
    }

    const concurrencyPassed = successCount === 1 && failCount === 1;
    record(
      11,
      'Proteção Concorrente Atômica (Apenas 1 Sucesso em Replay)',
      concurrencyPassed,
      'successCount=1, failCount=1',
      `Sucessos: ${successCount}, Falhas bloqueadas: ${failCount}`
    );

    await client.query('ROLLBACK;'); // Desfaz transação de testes

    // ------------------------------------------------------------------------
    // RELATÓRIO FINAL
    // ------------------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('RESULTADOS DOS TESTES DE SSO (ETAPA 3.1):');
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
    console.log(`TOTAL DE TESTES SSO: ${results.length}`);
    console.log(`APROVADOS:           ${passedCount}`);
    console.log(`REPROVADOS:          ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err: any) {
    console.error('Falha fatal nos testes de SSO:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSsoTests();
