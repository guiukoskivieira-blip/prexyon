/**
 * PREXYON — SUÍTE DE TESTES DE PLANOS, ASSINATURAS E ENTITLEMENTS (ETAPA 4.1)
 * Validação no Supabase Central (orcagraf-dev / ybsdwcaagcazfedrwhjm.supabase.co)
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Client } = pg;

interface SubTestCase {
  num: number;
  name: string;
  run: (client: pg.Client) => Promise<{ passed: boolean; expected: string; found: string; error?: string }>;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export const stage41SubscriptionTests: SubTestCase[] = [
  {
    num: 1,
    name: 'Plano OrçaGraf concede entitlement exclusivamente ao OrçaGraf',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000001';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Plano OrçaGraf', 'Org Plano OrçaGraf Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const prods: string[] = ent.included_products;
      const passed = prods.includes('orcagraf') && !prods.includes('arteflow') && !prods.includes('artecheck');
      return {
        passed,
        expected: "included_products = ['orcagraf']",
        found: `included_products = [${prods.join(', ')}]`,
      };
    },
  },
  {
    num: 2,
    name: 'Plano ArteFlow concede entitlement exclusivamente ao ArteFlow',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000002';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'arteflow';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Plano ArteFlow', 'Org Plano ArteFlow Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const prods: string[] = ent.included_products;
      const passed = !prods.includes('orcagraf') && prods.includes('arteflow') && !prods.includes('artecheck');
      return {
        passed,
        expected: "included_products = ['arteflow']",
        found: `included_products = [${prods.join(', ')}]`,
      };
    },
  },
  {
    num: 3,
    name: 'Plano ArteCheck concede entitlement exclusivamente ao ArteCheck',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000003';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'artecheck';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Plano ArteCheck', 'Org Plano ArteCheck Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const prods: string[] = ent.included_products;
      const passed = !prods.includes('orcagraf') && !prods.includes('arteflow') && prods.includes('artecheck');
      return {
        passed,
        expected: "included_products = ['artecheck']",
        found: `included_products = [${prods.join(', ')}]`,
      };
    },
  },
  {
    num: 4,
    name: 'Plano OrçaGraf + ArteFlow concede entitlement a ambos os produtos',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000004';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf_arteflow';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Combo 2 Softwares', 'Org Combo 2 Softwares Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const prods: string[] = ent.included_products;
      const passed = prods.includes('orcagraf') && prods.includes('arteflow') && !prods.includes('artecheck');
      return {
        passed,
        expected: "included_products = ['orcagraf', 'arteflow']",
        found: `included_products = [${prods.join(', ')}]`,
      };
    },
  },
  {
    num: 5,
    name: 'Plano Prexyon Completo concede entitlement aos 3 softwares',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000005';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'prexyon_complete';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Prexyon Completo', 'Org Prexyon Completo Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const prods: string[] = ent.included_products;
      const passed = prods.includes('orcagraf') && prods.includes('arteflow') && prods.includes('artecheck');
      return {
        passed,
        expected: "included_products = ['orcagraf', 'arteflow', 'artecheck']",
        found: `included_products = [${prods.join(', ')}]`,
      };
    },
  },
  {
    num: 6,
    name: 'Assinatura Cancelada mas dentro do Período mantém entitlement ativo',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000006';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'prexyon_complete';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Cancelada Ativa', 'Org Cancelada Ativa Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (
          organization_id, plan_id, status, billing_interval, current_period_end, cancel_at_period_end
        ) VALUES (
          $1, $2, 'canceled', 'monthly', timezone('utc', now()) + INTERVAL '10 days', true
        )
        ON CONFLICT (organization_id) DO UPDATE SET 
          status = 'canceled',
          current_period_end = timezone('utc', now()) + INTERVAL '10 days',
          cancel_at_period_end = true;
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const passed = ent.is_entitled === true && ent.cancel_at_period_end === true;
      return {
        passed,
        expected: 'is_entitled = true (dentro dos 10 dias restantes)',
        found: `is_entitled = ${ent.is_entitled}, cancel_at_period_end = ${ent.cancel_at_period_end}`,
      };
    },
  },
  {
    num: 7,
    name: 'Assinatura Expirada (current_period_end no passado) revoga entitlement',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000007';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'prexyon_complete';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Expirada', 'Org Expirada Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (
          organization_id, plan_id, status, billing_interval, current_period_end, cancel_at_period_end
        ) VALUES (
          $1, $2, 'expired', 'monthly', timezone('utc', now()) - INTERVAL '2 days', false
        )
        ON CONFLICT (organization_id) DO UPDATE SET 
          status = 'expired',
          current_period_end = timezone('utc', now()) - INTERVAL '2 days';
      `, [orgId, planId]);

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const passed = ent.is_entitled === false;
      return {
        passed,
        expected: 'is_entitled = false para assinatura expirada',
        found: `is_entitled = ${ent.is_entitled}`,
      };
    },
  },
  {
    num: 8,
    name: 'Cálculo de Usuários Extras e Limites de Assentos',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000008';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org 5 Usuarios', 'Org 5 Usuarios Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2;
      `, [orgId, planId]);

      // Insere 5 membros ativos com profiles (limite do plano é 3)
      for (let i = 1; i <= 5; i++) {
        const uId = `50000000-0000-4000-a000-00000000000${i}`;
        await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING;`, [uId, `extra.user.${i}@prexyon.com`]);
        await client.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING;`, [uId, `extra.user.${i}@prexyon.com`, `User Extra ${i}`]);
        await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, 'seller'::public.user_role, true, false) ON CONFLICT DO NOTHING;`, [orgId, uId]);
      }

      const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1);`, [orgId]);
      const ent = entRes.rows[0].prexyon_get_organization_entitlements;

      const passed = ent.active_members_count === 5 && ent.included_users === 3 && ent.extra_users === 2;
      return {
        passed,
        expected: 'active_members_count = 5, included_users = 3, extra_users = 2',
        found: `active = ${ent.active_members_count}, included = ${ent.included_users}, extra = ${ent.extra_users}`,
      };
    },
  },
  {
    num: 9,
    name: 'Sincronização Automática com Projeção product_subscriptions (Compatibilidade OrçaGraf)',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000009';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf_arteflow';`);
      const planId = planRes.rows[0].id;

      await client.query(`
        INSERT INTO public.organizations (id, trade_name, corporate_name, is_active)
        VALUES ($1, 'Org Sync Proj', 'Org Sync Proj Ltda', true)
        ON CONFLICT (id) DO NOTHING;
      `, [orgId]);

      await client.query(`
        INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end)
        VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days')
        ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';
      `, [orgId, planId]);

      const projRes = await client.query(`
        SELECT product_code, status 
        FROM public.product_subscriptions 
        WHERE organization_id = $1 
        ORDER BY product_code;
      `, [orgId]);

      const syncedCodes = projRes.rows.map(r => r.product_code);
      const passed = syncedCodes.includes('orcagraf') && syncedCodes.includes('arteflow');
      return {
        passed,
        expected: "product_subscriptions sincronizada com ['arteflow', 'orcagraf']",
        found: `product_subscriptions possui: [${syncedCodes.join(', ')}]`,
      };
    },
  },
  {
    num: 10,
    name: 'Validação de Regressão SSO Prexyon -> OrçaGraf com Novo Modelo de Planos',
    run: async (client) => {
      const orgId = '40000000-0000-4000-a000-000000000010';
      const userId = '60000000-0000-4000-a000-000000000001';
      const planRes = await client.query(`SELECT id FROM public.prexyon_plans WHERE code = 'prexyon_complete';`);
      const planId = planRes.rows[0].id;

      await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'sso.sub.test@prexyon.com') ON CONFLICT (id) DO NOTHING;`, [userId]);
      await client.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'sso.sub.test@prexyon.com', 'SSO Plan Test') ON CONFLICT DO NOTHING;`, [userId]);
      await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ($1, 'Org SSO Plan', 'Org SSO Plan Ltda', true) ON CONFLICT DO NOTHING;`, [orgId]);
      await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES ($1, $2, 'seller'::public.user_role, true, false) ON CONFLICT DO NOTHING;`, [orgId, userId]);
      await client.query(`INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, billing_interval, current_period_end) VALUES ($1, $2, 'active', 'monthly', timezone('utc', now()) + INTERVAL '30 days') ON CONFLICT (organization_id) DO UPDATE SET plan_id = $2, status = 'active';`, [orgId, planId]);
      await client.query(`INSERT INTO public.prexyon_user_product_access (organization_id, user_id, product_code, enabled) VALUES ($1, $2, 'orcagraf', true) ON CONFLICT (organization_id, user_id, product_code) DO UPDATE SET enabled = true;`, [orgId, userId]);

      // Gera código SSO e troca
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
        expected: 'SSO exchange bem-sucedido com a organização e usuário configurados sob o novo plano',
        found: `success=${exch.success}, user=${exch.user_id}, org=${exch.organization_id}`,
      };
    },
  },
];

async function main() {
  console.log('================================================================');
  console.log('PREXYON — ETAPA 4.1: TESTES DE PLANOS, ASSINATURAS E ENTITLEMENTS');
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
    for (const t of stage41SubscriptionTests) {
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
    console.log(`TOTAL DE TESTES DE ASSINATURA: ${stage41SubscriptionTests.length}`);
    console.log(`APROVADOS:                     ${passedCount}`);
    console.log(`REPROVADOS:                    ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error('Erro fatal nos testes de assinatura:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
