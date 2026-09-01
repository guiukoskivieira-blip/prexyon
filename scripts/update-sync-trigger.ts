import pg from 'pg';

const { Client } = pg;

async function updateTrigger() {
  const client = new Client({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.ybsdwcaagcazfedrwhjm',
    password: 'AxDgke4deNV456gC',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    console.log('Atualizando função trigger prexyon_sync_subscription_projections...');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.prexyon_sync_subscription_projections()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
          v_prod RECORD;
          v_is_active BOOLEAN;
      BEGIN
          -- Determina se a assinatura é considerada ativa para entitlements
          v_is_active := (NEW.status IN ('active', 'trialing') OR (NEW.status = 'canceled' AND NEW.current_period_end > timezone('utc', now())));

          -- Sincroniza cada produto do plano em public.product_subscriptions
          FOR v_prod IN 
              SELECT product_code FROM public.prexyon_plan_products WHERE plan_id = NEW.plan_id
          LOOP
              INSERT INTO public.product_subscriptions (
                  organization_id,
                  product_code,
                  status,
                  current_period_end,
                  updated_at
              ) VALUES (
                  NEW.organization_id,
                  v_prod.product_code::public.subscription_product_code,
                  CASE WHEN v_is_active THEN 'active'::public.subscription_status ELSE 'canceled'::public.subscription_status END,
                  NEW.current_period_end,
                  timezone('utc', now())
              )
              ON CONFLICT (organization_id, product_code) DO UPDATE SET
                  status = EXCLUDED.status,
                  current_period_end = EXCLUDED.current_period_end,
                  updated_at = timezone('utc', now());
          END LOOP;

          RETURN NEW;
      END;
      $$;
    `);

    console.log('-> Trigger atualizada com sucesso!');
  } catch (err: any) {
    console.error('Erro ao atualizar trigger:', err.message);
  } finally {
    await client.end();
  }
}

updateTrigger();
