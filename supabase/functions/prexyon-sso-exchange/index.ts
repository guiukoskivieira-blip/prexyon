import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROD_ALLOWED_REDIRECT_ORIGINS = [
  'https://or-agraf-bete-20-production.up.railway.app',
  'https://orcagraf.prexyon.com',
  'https://arteflow.prexyon.com',
  'https://artecheck.prexyon.com',
];

const DEV_ALLOWED_REDIRECT_ORIGINS = [
  ...PROD_ALLOWED_REDIRECT_ORIGINS,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
];

function getAllowedOrigins(): string[] {
  const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('DENO_ENV') || 'production';
  return env === 'development' || env === 'local'
    ? DEV_ALLOWED_REDIRECT_ORIGINS
    : PROD_ALLOWED_REDIRECT_ORIGINS;
}

function sanitizeRedirectUri(uri: string | null | undefined, productCode: string): string {
  if (!uri || typeof uri !== 'string') {
    return `/${productCode}`;
  }

  const trimmed = uri.trim();
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const allowed = getAllowedOrigins();
    if (allowed.includes(parsed.origin)) {
      return trimmed;
    }
  } catch {
    // URL inválida, fallback seguro
  }

  return `/${productCode}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método não permitido.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { code, audience } = body;

    // 1. Validação de Payload (Ignora estritamente user_id, organization_id, etc. enviados pelo caller)
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Código de autorização SSO não fornecido ou inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!audience || typeof audience !== 'string' || !['orcagraf', 'arteflow', 'artecheck'].includes(audience.trim())) {
      return new Response(
        JSON.stringify({ success: false, error: 'Audience não fornecida ou inválida para os produtos Prexyon.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanCode = code.trim();
    const cleanAudience = audience.trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração de infraestrutura Supabase ausente.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cliente Admin com Service Role executando estritamente server-side
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 2. Consumo Atômico via RPC interna protegida
    const { data, error } = await supabaseAdmin.rpc('prexyon_exchange_sso_code', {
      p_code_hash: cleanCode,
      p_audience: cleanAudience,
    });

    if (error || !data || !data.success) {
      const errMsg = error?.message || data?.error || 'Erro na troca de autorização SSO.';
      let statusCode = 400;

      if (errMsg.includes('REPLAY_BLOCKED')) statusCode = 409;
      else if (errMsg.includes('CODE_EXPIRED')) statusCode = 410;
      else if (errMsg.includes('INVALID_AUDIENCE')) statusCode = 403;
      else if (errMsg.includes('USER_NOT_FOUND')) statusCode = 404;

      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Geração Server-Side de Artefato Supabase Auth One-Time (Sem envio de e-mail ao usuário)
    const sanitizedRedirect = sanitizeRedirectUri(data.redirect_uri, data.product_code);

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: data.email,
      options: {
        redirectTo: sanitizedRedirect,
      },
    });

    const tokenHash = linkData?.properties?.hashed_token;
    const verificationType = linkData?.properties?.verification_type || 'magiclink';

    // 4. Tratamento de Falha Intermediária com Compensação Atômica (Zero lockout em falha Auth)
    if (linkError || !tokenHash) {
      // Reverter o estado used_at para permitir nova tentativa dentro da janela de TTL
      try {
        await supabaseAdmin.rpc('prexyon_rollback_sso_code', {
          p_code_hash: cleanCode,
        });
      } catch {
        // Ignora erro de rollback
      }

      const reason = linkError?.message ? `: ${linkError.message}` : '';
      return new Response(
        JSON.stringify({
          success: false,
          error: `FALHA_GERACAO_TOKEN_AUTH: Não foi possível emitir o token seguro de autenticação${reason}.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Retorno Mínimo Seguro (Sem expor chaves de serviço ou JWT secreto)
    return new Response(
      JSON.stringify({
        success: true,
        token_hash: tokenHash,
        verification_type: verificationType,
        user_id: data.user_id,
        email: data.email,
        full_name: data.full_name,
        organization_id: data.organization_id,
        product_code: data.product_code,
        redirect_uri: sanitizedRedirect,
        authenticated_at: data.authenticated_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno inesperado no processamento SSO.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
