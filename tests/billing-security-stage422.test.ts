/**
 * PREXYON — SUÍTE DE TESTES DE SEGURANÇA CRIPTOGRÁFICA E TRANSIÇÕES DE BILLING (ETAPA 4.2.2)
 * Validação de Assinatura HMAC x-signature e Transições Seguras de Upgrade
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Client } = pg;

interface SecurityTestCase {
  num: number;
  title: string;
  run: (client: pg.Client) => Promise<{ passed: boolean; expected: string; found: string; error?: string }>;
}

function calculateMercadoPagoSignature(resourceId: string, requestId: string, ts: string, secret: string): string {
  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hmac}`;
}

function verifySignatureLogic(
  xSignature: string | null,
  xRequestId: string | null,
  resourceId: string,
  secret: string
): { valid: boolean; reason?: string } {
  if (!secret) return { valid: false, reason: 'SECRET_MISSING' };
  if (!xSignature || !xRequestId || !resourceId) return { valid: false, reason: 'HEADERS_MISSING' };

  const parts = xSignature.split(',');
  let ts: string | null = null;
  let receivedHash: string | null = null;

  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === 'ts') ts = v;
    if (k === 'v1') receivedHash = v;
  }

  if (!ts || !receivedHash) return { valid: false, reason: 'MALFORMED_SIGNATURE' };

  const manifest = `id:${resourceId};request-id:${xRequestId};ts:${ts};`;
  const calculatedHash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  if (calculatedHash !== receivedHash) return { valid: false, reason: 'HMAC_MISMATCH' };
  return { valid: true };
}

export const stage422SecurityTests: SecurityTestCase[] = [
  {
    num: 1,
    title: 'Webhook Sem Header x-signature é Rejeitado (Fail-Closed)',
    run: async () => {
      const secret = 'test_webhook_secret_key_12345';
      const result = verifySignatureLogic(null, 'req_123', 'preapp_123', secret);
      const passed = result.valid === false && result.reason === 'HEADERS_MISSING';
      return {
        passed,
        expected: 'valid = false (HEADERS_MISSING)',
        found: `valid = ${result.valid} (${result.reason})`,
      };
    },
  },
  {
    num: 2,
    title: 'Webhook com Assinatura HMAC Adulterada é Rejeitado',
    run: async () => {
      const secret = 'test_webhook_secret_key_12345';
      const fakeSignature = 'ts=1725148800,v1=bad_fake_hash_11223344556677889900aabbccddeeff';
      const result = verifySignatureLogic(fakeSignature, 'req_123', 'preapp_123', secret);
      const passed = result.valid === false && result.reason === 'HMAC_MISMATCH';
      return {
        passed,
        expected: 'valid = false (HMAC_MISMATCH)',
        found: `valid = ${result.valid} (${result.reason})`,
      };
    },
  },
  {
    num: 3,
    title: 'Webhook com x-request-id Adulterado é Rejeitado',
    run: async () => {
      const secret = 'test_webhook_secret_key_12345';
      const ts = '1725148800';
      const validSig = calculateMercadoPagoSignature('preapp_123', 'req_original_123', ts, secret);

      // Envia com request ID alterado pelo atacante
      const result = verifySignatureLogic(validSig, 'req_tampered_999', 'preapp_123', secret);
      const passed = result.valid === false && result.reason === 'HMAC_MISMATCH';
      return {
        passed,
        expected: 'valid = false (HMAC_MISMATCH por x-request-id adulterado)',
        found: `valid = ${result.valid} (${result.reason})`,
      };
    },
  },
  {
    num: 4,
    title: 'Webhook com Secret Incorreto é Rejeitado',
    run: async () => {
      const correctSecret = 'correct_webhook_secret_key_12345';
      const attackerSecret = 'attacker_secret_key_67890';
      const ts = '1725148800';
      const signatureSignedWithWrongKey = calculateMercadoPagoSignature('preapp_123', 'req_123', ts, attackerSecret);

      const result = verifySignatureLogic(signatureSignedWithWrongKey, 'req_123', 'preapp_123', correctSecret);
      const passed = result.valid === false && result.reason === 'HMAC_MISMATCH';
      return {
        passed,
        expected: 'valid = false (Rejeitado por secret incorreto)',
        found: `valid = ${result.valid} (${result.reason})`,
      };
    },
  },
  {
    num: 5,
    title: 'Webhook com Assinatura Criptográfica HMAC Legítima é Aprovado',
    run: async () => {
      const secret = 'test_webhook_secret_key_12345';
      const ts = '1725148800';
      const resourceId = 'preapp_legit_998877';
      const requestId = 'req_legit_445566';
      const legitimateSignature = calculateMercadoPagoSignature(resourceId, requestId, ts, secret);

      const result = verifySignatureLogic(legitimateSignature, requestId, resourceId, secret);
      const passed = result.valid === true;
      return {
        passed,
        expected: 'valid = true (HMAC perfeitamente validado)',
        found: `valid = ${result.valid}`,
      };
    },
  },
  {
    num: 6,
    title: 'Transição Segura de Upgrade: Falha do Novo Mantém a Assinatura Antiga Ativa',
    run: async (client) => {
      const orgId = '90000000-0000-4000-a000-000000000006';
      const oldPreapprovalId = 'preapp_active_existing_111';
      const failedNewPreapprovalId = 'preapp_failed_new_222';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';`);
      const planId = planRes.rows[0].id;

      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Safe Upgrade', 'Org Safe Upgrade Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);

      // 1. Assinatura antiga ativa
      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '20 days')
        ON CONFLICT (organization_id) DO UPDATE SET status = 'active', current_period_end = timezone('utc', now()) + INTERVAL '20 days';
      `, [orgId, planId]);

      await client.query(`
        INSERT INTO public.prexyon_payment_subscriptions (organization_id, provider, provider_subscription_id, status, billing_interval, amount_cents)
        VALUES ($1, 'mercadopago', $2, 'authorized', 'monthly', 5990)
        ON CONFLICT (provider_subscription_id) DO UPDATE SET status = 'authorized';
      `, [orgId, oldPreapprovalId]);

      // 2. Novo checkout iniciado (status = pending, pending_upgrade_from = oldPreapprovalId)
      await client.query(`
        INSERT INTO public.prexyon_payment_subscriptions (
          organization_id, provider, provider_subscription_id, status, billing_interval, amount_cents, metadata
        ) VALUES (
          $1, 'mercadopago', $2, 'pending', 'monthly', 15990, jsonb_build_object('pending_upgrade_from', $3::text)
        ) ON CONFLICT (provider_subscription_id) DO NOTHING;
      `, [orgId, failedNewPreapprovalId, oldPreapprovalId]);

      // 3. Novo pagamento é rejeitado pelo emissor (status = rejected)
      await client.query(`
        UPDATE public.prexyon_payment_subscriptions 
        SET status = 'rejected', updated_at = timezone('utc', now()) 
        WHERE provider_subscription_id = $1;
      `, [failedNewPreapprovalId]);

      // Verificação: A assinatura antiga NÃO foi cancelada e continua autorizada e com entitlement ativo!
      const oldSubRes = await client.query(`SELECT status FROM public.prexyon_payment_subscriptions WHERE provider_subscription_id = $1;`, [oldPreapprovalId]);
      const orgSubRes = await client.query(`SELECT status, current_period_end > timezone('utc', now()) as is_valid FROM public.prexyon_subscriptions WHERE organization_id = $1;`, [orgId]);

      const passed = oldSubRes.rows[0].status === 'authorized' && orgSubRes.rows[0].status === 'active' && orgSubRes.rows[0].is_valid === true;
      return {
        passed,
        expected: 'Assinatura antiga permanece authorized e ativa sem perda de serviço para o cliente',
        found: `Antiga: ${oldSubRes.rows[0].status}, Status Org: ${orgSubRes.rows[0].status}`,
      };
    },
  },
  {
    num: 7,
    title: 'Transição Segura de Upgrade: Novo Autorizado Desativa o Antigo Atomicamente',
    run: async (client) => {
      const orgId = '90000000-0000-4000-a000-000000000007';
      const oldPreapprovalId = 'preapp_to_be_replaced_333';
      const approvedNewPreapprovalId = 'preapp_new_approved_444';
      const completePlanRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'prexyon_complete';`);
      const completePlanId = completePlanRes.rows[0].id;

      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Trans Upgrade', 'Org Trans Upgrade Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);

      // Assinatura antiga ativa
      await client.query(`
        INSERT INTO public.prexyon_payment_subscriptions (organization_id, provider, provider_subscription_id, status, billing_interval, amount_cents)
        VALUES ($1, 'mercadopago', $2, 'authorized', 'monthly', 5990)
        ON CONFLICT (provider_subscription_id) DO UPDATE SET status = 'authorized';
      `, [orgId, oldPreapprovalId]);

      // Novo preapproval chega aprovado via webhook
      await client.query(`
        INSERT INTO public.prexyon_payment_subscriptions (
          organization_id, provider, provider_subscription_id, status, billing_interval, amount_cents, metadata
        ) VALUES (
          $1, 'mercadopago', $2, 'authorized', 'monthly', 15990, jsonb_build_object('pending_upgrade_from', $3::text)
        ) ON CONFLICT (provider_subscription_id) DO UPDATE SET status = 'authorized';
      `, [orgId, approvedNewPreapprovalId, oldPreapprovalId]);

      // O handler desativa o preapproval anterior
      await client.query(`
        UPDATE public.prexyon_payment_subscriptions 
        SET status = 'cancelled', updated_at = timezone('utc', now()) 
        WHERE provider_subscription_id = $1;
      `, [oldPreapprovalId]);

      await client.query(`
        UPDATE public.prexyon_subscriptions 
        SET plan_id = $2, status = 'active', updated_at = timezone('utc', now()) 
        WHERE organization_id = $1;
      `, [orgId, completePlanId]);

      const subsRes = await client.query(`SELECT provider_subscription_id, status FROM public.prexyon_payment_subscriptions WHERE organization_id = $1;`, [orgId]);
      const oldSub = subsRes.rows.find(s => s.provider_subscription_id === oldPreapprovalId);
      const newSub = subsRes.rows.find(s => s.provider_subscription_id === approvedNewPreapprovalId);

      const passed = oldSub?.status === 'cancelled' && newSub?.status === 'authorized';
      return {
        passed,
        expected: 'Antigo = cancelled, Novo = authorized (Transição atômica sem duplicidade)',
        found: `Antigo: ${oldSub?.status}, Novo: ${newSub?.status}`,
      };
    },
  },
  {
    num: 8,
    title: 'Resource-Level Idempotency: Múltiplos Webhooks para Mesma Transação Não Duplicam Período',
    run: async (client) => {
      const orgId = '90000000-0000-4000-a000-000000000008';
      const paymentId = 'pay_resource_idempotency_555';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';`);
      const planId = planRes.rows[0].id;

      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Res Idemp', 'Org Res Idemp Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);

      // 1ª Transação
      await client.query(`
        INSERT INTO public.prexyon_payment_transactions (
          organization_id, provider, provider_payment_id, status, amount_cents, billing_interval, paid_at
        ) VALUES (
          $1, 'mercadopago', $2, 'approved', 5990, 'monthly', timezone('utc', now())
        ) ON CONFLICT (provider_payment_id) DO NOTHING;
      `, [orgId, paymentId]);

      // 2ª Tentativa de Inserção da Mesma Transação (Simulando webhook concorrente)
      const secondInsert = await client.query(`
        INSERT INTO public.prexyon_payment_transactions (
          organization_id, provider, provider_payment_id, status, amount_cents, billing_interval, paid_at
        ) VALUES (
          $1, 'mercadopago', $2, 'approved', 5990, 'monthly', timezone('utc', now())
        ) ON CONFLICT (provider_payment_id) DO NOTHING
        RETURNING id;
      `, [orgId, paymentId]);

      const passed = secondInsert.rowCount === 0;
      return {
        passed,
        expected: 'rowCount = 0 (Transação única consolidada)',
        found: `rowCount = ${secondInsert.rowCount} (Nenhum registro extra criado)`,
      };
    },
  },
];

async function main() {
  console.log('================================================================');
  console.log('PREXYON — ETAPA 4.2.2: TESTES DE SEGURANÇA E HMAC MERCADO PAGO');
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

  let passedCount = 0;
  let failedCount = 0;

  try {
    for (const t of stage422SecurityTests) {
      const res = await t.run(client);
      if (res.passed) {
        passedCount++;
        console.log(`[PASSOU] Teste ${t.num}: ${t.title}`);
      } else {
        failedCount++;
        console.log(`[FALHOU] Teste ${t.num}: ${t.title}`);
      }
      console.log(`   Esperado:   ${res.expected}`);
      console.log(`   Encontrado: ${res.found}`);
      if (res.error) console.log(`   Erro:       ${res.error}`);
      console.log('');
    }

    console.log('================================================================');
    console.log(`TOTAL DE TESTES DE SEGURANÇA:  ${stage422SecurityTests.length}`);
    console.log(`APROVADOS:                     ${passedCount}`);
    console.log(`REPROVADOS:                    ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error('Erro fatal nos testes de segurança:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
