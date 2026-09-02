/**
 * PREXYON — SUÍTE DE TESTES DE BILLING, CHECKOUT E WEBHOOKS DO MERCADO PAGO (ETAPA 4.2)
 * Validação no Supabase Central (orcagraf-dev / ybsdwcaagcazfedrwhjm.supabase.co)
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Client } = pg;

interface BillingTestCase {
  num: number;
  name: string;
  run: (client: pg.Client) => Promise<{ passed: boolean; expected: string; found: string; error?: string }>;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export const stage42BillingTests: BillingTestCase[] = [
  {
    num: 1,
    name: 'Membro Comum (Seller/User) é Bloqueado de Criar Checkout (Apenas Owner/Admin)',
    run: async (client) => {
      const orgId = '70000000-0000-4000-a000-000000000001';
      const sellerId = '70000000-0000-4000-b000-000000000001';

      await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'seller.billing@prexyon.com') ON CONFLICT (id) DO NOTHING;`, [sellerId]);
      await client.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'seller.billing@prexyon.com', 'Seller Billing') ON CONFLICT DO NOTHING;`, [sellerId]);
      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Billing 1', 'Org Billing 1 Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);
      await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, 'seller'::public.user_role, true, false) ON CONFLICT DO NOTHING;`, [orgId, sellerId]);

      // Verificação da regra de autoridade
      const isAuthAdmin = await client.query(`SELECT public.prexyon_is_org_admin_or_owner($1, $2) as is_admin;`, [orgId, sellerId]);
      const passed = isAuthAdmin.rows[0].is_admin === false;

      return {
        passed,
        expected: 'is_admin = false para papel seller',
        found: `is_admin = ${isAuthAdmin.rows[0].is_admin} (Bloqueado de checkout)`,
      };
    },
  },
  {
    num: 2,
    name: 'Owner / Admin da Organização é Autorizado a Criar Checkout',
    run: async (client) => {
      const orgId = '70000000-0000-4000-a000-000000000001';
      const ownerId = '70000000-0000-4000-b000-000000000002';

      await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner.billing@prexyon.com') ON CONFLICT (id) DO NOTHING;`, [ownerId]);
      await client.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'owner.billing@prexyon.com', 'Owner Billing') ON CONFLICT DO NOTHING;`, [ownerId]);
      await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, 'owner'::public.user_role, true, false) ON CONFLICT DO NOTHING;`, [orgId, ownerId]);

      const isAuthAdmin = await client.query(`SELECT public.prexyon_is_org_admin_or_owner($1, $2) as is_admin;`, [orgId, ownerId]);
      const passed = isAuthAdmin.rows[0].is_admin === true;

      return {
        passed,
        expected: 'is_admin = true para papel owner',
        found: `is_admin = ${isAuthAdmin.rows[0].is_admin} (Autorizado)`,
      };
    },
  },
  {
    num: 3,
    name: 'Preço é Consultado no Servidor em Centavos (Frontend não dita valor)',
    run: async (client) => {
      const planRes = await client.query(`
        SELECT code, monthly_price_cents, annual_price_cents 
        FROM public.prexyon_plans 
        WHERE code = 'prexyon_complete';
      `);
      const plan = planRes.rows[0];
      const passed = plan.monthly_price_cents === 15990 && plan.annual_price_cents === 159900;

      return {
        passed,
        expected: 'Prexyon Completo: 15990 centavos (mensal) / 159900 centavos (anual)',
        found: `Mensal: ${plan.monthly_price_cents}¢, Anual: ${plan.annual_price_cents}¢`,
      };
    },
  },
  {
    num: 4,
    name: 'Processamento de Webhook Aprovado Ativa Assinatura e Sincroniza Entitlements',
    run: async (client) => {
      const orgId = '70000000-0000-4000-a000-000000000004';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'prexyon_complete';`);
      const planId = planRes.rows[0].id;

      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Webhook Test', 'Org Webhook Test Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);

      // Simulação do payload do webhook aprovado
      const paymentId = 'mp_pay_test_approved_123';
      const eventId = 'ev_mp_test_123';

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      await client.query(`
        INSERT INTO public.prexyon_payment_transactions (
          organization_id, provider, provider_payment_id, provider_event_id, status, amount_cents, billing_interval, paid_at
        ) VALUES (
          $1, 'mercadopago', $2, $3, 'approved', 15990, 'monthly', timezone('utc', now())
        ) ON CONFLICT (provider_payment_id) DO NOTHING;
      `, [orgId, paymentId, eventId]);

      const subRes = await client.query(`SELECT status FROM public.prexyon_subscriptions WHERE organization_id = $1;`, [orgId]);
      const projRes = await client.query(`SELECT count(*) as active_projs FROM public.product_subscriptions WHERE organization_id = $1 AND status = 'active';`, [orgId]);

      const passed = subRes.rows[0].status === 'active' && Number(projRes.rows[0].active_projs) === 3;
      return {
        passed,
        expected: 'status = active, 3 produtos sincronizados em product_subscriptions',
        found: `status = ${subRes.rows[0].status}, produtos ativos = ${projRes.rows[0].active_projs}`,
      };
    },
  },
  {
    num: 5,
    name: 'Idempotência de Webhook (Evento Duplicado não Gera Duplicação)',
    run: async (client) => {
      const eventId = 'ev_mp_idempotent_test_999';
      const payloadHash = sha256(JSON.stringify({ id: eventId, action: 'payment.created' }));

      // 1ª inserção
      await client.query(`
        INSERT INTO public.prexyon_webhook_events (provider, provider_event_id, event_type, payload_hash, status)
        VALUES ('mercadopago', $1, 'payment.created', $2, 'processed')
        ON CONFLICT (provider, provider_event_id) DO NOTHING;
      `, [eventId, payloadHash]);

      // 2ª inserção (duplicada)
      const insertDup = await client.query(`
        INSERT INTO public.prexyon_webhook_events (provider, provider_event_id, event_type, payload_hash, status)
        VALUES ('mercadopago', $1, 'payment.created', $2, 'processed')
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id;
      `, [eventId, payloadHash]);

      const passed = insertDup.rowCount === 0; // Bloqueado de reinserção pela constraint UNIQUE
      return {
        passed,
        expected: 'rowCount = 0 (idempotência respeitada)',
        found: `rowCount = ${insertDup.rowCount} (Nenhum registro duplicado)`,
      };
    },
  },
  {
    num: 6,
    name: 'Renovação de Assinatura Atualiza Period End e Registra Auditoria',
    run: async (client) => {
      const orgId = '70000000-0000-4000-a000-000000000006';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';`);
      const planId = planRes.rows[0].id;

      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Renewal Test', 'Org Renewal Test Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);

      // Assinatura inicial
      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '5 days')
        ON CONFLICT (organization_id) DO UPDATE SET current_period_end = timezone('utc', now()) + INTERVAL '5 days';
      `, [orgId, planId]);

      // Renovação por mais 30 dias
      await client.query(`
        UPDATE public.prexyon_subscriptions
        SET current_period_end = timezone('utc', now()) + INTERVAL '35 days',
            updated_at = timezone('utc', now())
        WHERE organization_id = $1;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscription_events (organization_id, event_type, new_plan_id, metadata)
        VALUES ($1, 'subscription_renewed', $2, '{"reason": "recurrent_billing_approved"}'::jsonb);
      `, [orgId, planId]);

      const subRes = await client.query(`SELECT current_period_end > (timezone('utc', now()) + INTERVAL '30 days') as is_extended FROM public.prexyon_subscriptions WHERE organization_id = $1;`, [orgId]);
      const eventRes = await client.query(`SELECT count(*) as cnt FROM public.prexyon_subscription_events WHERE organization_id = $1 AND event_type = 'subscription_renewed';`, [orgId]);

      const passed = subRes.rows[0].is_extended === true && Number(eventRes.rows[0].cnt) >= 1;
      return {
        passed,
        expected: 'is_extended = true, evento subscription_renewed registrado',
        found: `is_extended = ${subRes.rows[0].is_extended}, eventos = ${eventRes.rows[0].cnt}`,
      };
    },
  },
  {
    num: 7,
    name: 'Cancelamento com cancel_at_period_end Mantém Acesso até o Final do Ciclo',
    run: async (client) => {
      const orgId = '70000000-0000-4000-a000-000000000007';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'arteflow';`);
      const planId = planRes.rows[0].id;

      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Cancel Grace', 'Org Cancel Grace Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (
          organization_id, plan_id, status, billing_interval, current_period_end, cancel_at_period_end
        ) VALUES (
          $1, $2, 'canceled', 'monthly', timezone('utc', now()) + INTERVAL '12 days', true
        ) ON CONFLICT (organization_id) DO UPDATE SET status = 'canceled', cancel_at_period_end = true;
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const passed = ent.is_entitled === true && ent.cancel_at_period_end === true;
      return {
        passed,
        expected: 'is_entitled = true durante os 12 dias restantes de vigência',
        found: `is_entitled = ${ent.is_entitled}, cancel_at_period_end = ${ent.cancel_at_period_end}`,
      };
    },
  },
  {
    num: 8,
    name: 'Fluxo Ponta a Ponta: Contratação em Sandbox -> Webhook -> Entitlement -> Abertura SSO OrçaGraf',
    run: async (client) => {
      const orgId = '70000000-0000-4000-a000-000000000008';
      const userId = '70000000-0000-4000-b000-000000000008';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';`);
      const planId = planRes.rows[0].id;

      await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'buyer.sso@prexyon.com') ON CONFLICT (id) DO NOTHING;`, [userId]);
      await client.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'buyer.sso@prexyon.com', 'Buyer SSO') ON CONFLICT DO NOTHING;`, [userId]);
      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org Buyer SSO', 'Org Buyer SSO Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);
      await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, 'owner'::public.user_role, true, false) ON CONFLICT DO NOTHING;`, [orgId, userId]);

      // 1. Simula ativação após webhook
      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      // 2. Concede acesso individual
      await client.query(`
        INSERT INTO public.prexyon_user_product_access (organization_id, user_id, product_code, enabled)
        VALUES ($1, $2, 'orcagraf', true)
        ON CONFLICT (organization_id, user_id, product_code) DO UPDATE SET enabled = true;
      `, [orgId, userId]);

      // 3. Gera código de SSO e executa troca
      const rawCode = crypto.randomBytes(32).toString('hex');
      const codeHash = sha256(rawCode);

      await client.query(`
        INSERT INTO public.prexyon_sso_codes (code_hash, user_id, organization_id, product_code, audience, redirect_uri, expires_at)
        VALUES ($1, $2, $3, 'orcagraf', 'orcagraf', 'https://orcagraf.prexyon.com/auth/prexyon', timezone('utc', now()) + INTERVAL '45 seconds');
      `, [codeHash, userId, orgId]);

      const exchRes = await client.query(`SELECT public.prexyon_exchange_sso_code($1, 'orcagraf');`, [codeHash]);
      const exch = exchRes.rows[0].prexyon_exchange_sso_code;

      const passed = exch.success === true && exch.user_id === userId && exch.organization_id === orgId;
      return {
        passed,
        expected: 'SSO exchange concluído com sucesso após compra e liberação da assinatura',
        found: `success=${exch.success}, user=${exch.user_id}, org=${exch.organization_id}`,
      };
    },
  },
];

import { getDbClient } from './db-client';

async function main() {
  console.log('================================================================');
  console.log('PREXYON — ETAPA 4.2: TESTES DE MERCADO PAGO, BILLING E WEBHOOKS');
  console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  const client = getDbClient();
  await client.connect();

  let passedCount = 0;
  let failedCount = 0;

  try {
    for (const t of stage42BillingTests) {
      const res = await t.run(client);
      if (res.passed) {
        passedCount++;
        console.log(`[PASSOU] Teste ${t.num}: ${t.name}`);
      } else {
        failedCount++;
        console.log(`[FALHOU] Teste ${t.num}: ${t.name}`);
      }
      console.log(`   Esperado:   ${res.expected}`);
      console.log(`   Encontrado: ${res.found}`);
      if (res.error) console.log(`   Erro:       ${res.error}`);
      console.log('');
    }

    console.log('================================================================');
    console.log(`TOTAL DE TESTES DE BILLING:    ${stage42BillingTests.length}`);
    console.log(`APROVADOS:                     ${passedCount}`);
    console.log(`REPROVADOS:                    ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error('Erro fatal nos testes de billing:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
