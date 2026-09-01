import pg from 'pg';

const { Client } = pg;

async function updateExchangeRpc() {
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
    console.log('Atualizando prexyon_exchange_sso_code com email 100% autoritativo de auth.users...');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.prexyon_exchange_sso_code(
          p_code_hash TEXT,
          p_audience TEXT
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth
      AS $$
      DECLARE
          v_record RECORD;
          v_user_email TEXT;
          v_user_name TEXT;
      BEGIN
          -- 1. Consumo Atômico com verificação de não utilizado, não expirado e audience correta
          UPDATE public.prexyon_sso_codes
          SET used_at = timezone('utc', now())
          WHERE code_hash = p_code_hash
            AND used_at IS NULL
            AND expires_at > timezone('utc', now())
            AND audience = p_audience
          RETURNING id, user_id, organization_id, product_code, redirect_uri, created_at, expires_at
          INTO v_record;

          IF v_record.id IS NULL THEN
              IF EXISTS (SELECT 1 FROM public.prexyon_sso_codes WHERE code_hash = p_code_hash AND used_at IS NOT NULL) THEN
                  RAISE EXCEPTION 'REPLAY_BLOCKED: este código de autorização já foi utilizado.';
              ELSIF EXISTS (SELECT 1 FROM public.prexyon_sso_codes WHERE code_hash = p_code_hash AND expires_at <= timezone('utc', now())) THEN
                  RAISE EXCEPTION 'CODE_EXPIRED: este código de autorização expirou.';
              ELSIF EXISTS (SELECT 1 FROM public.prexyon_sso_codes WHERE code_hash = p_code_hash AND audience <> p_audience) THEN
                  RAISE EXCEPTION 'INVALID_AUDIENCE: audience do código é inválida para este produto.';
              ELSE
                  RAISE EXCEPTION 'INVALID_CODE: código de autorização não encontrado ou inválido.';
              END IF;
          END IF;

          -- 2. Buscar E-mail de identidade autoritativa diretamente de auth.users
          SELECT email INTO v_user_email
          FROM auth.users
          WHERE id = v_record.user_id;

          -- 3. Buscar Nome no perfil
          SELECT full_name INTO v_user_name
          FROM public.profiles
          WHERE id = v_record.user_id;

          RETURN jsonb_build_object(
              'success', true,
              'user_id', v_record.user_id,
              'email', v_user_email,
              'full_name', COALESCE(v_user_name, 'Usuário Prexyon'),
              'organization_id', v_record.organization_id,
              'product_code', v_record.product_code,
              'redirect_uri', v_record.redirect_uri,
              'authenticated_at', timezone('utc', now())
          );
      END;
      $$;
    `);

    console.log('-> RPC prexyon_exchange_sso_code atualizada com sucesso!');
  } catch (err: any) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateExchangeRpc();
