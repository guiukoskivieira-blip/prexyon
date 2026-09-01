import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://portal.prexyon.com',
  'https://orcagraf.prexyon.com',
];

const ORCAGRAF_ALLOWLIST_REDIRECTS = [
  'http://localhost:5173/auth/prexyon',
  'http://localhost:3000/auth/prexyon',
  'https://orcagraf.prexyon.com/auth/prexyon',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token de autenticação não fornecido.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { organization_id, product_code = 'orcagraf', redirect_uri } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar allowlist de redirect para evitar Open Redirect
    const isRedirectAllowed = ORCAGRAF_ALLOWLIST_REDIRECTS.some(
      (allowed) => redirect_uri && redirect_uri.startsWith(allowed)
    ) || (req.headers.get('origin')?.includes('localhost') && redirect_uri?.includes('/auth/prexyon'));

    if (!isRedirectAllowed && redirect_uri) {
      return new Response(
        JSON.stringify({ success: false, error: 'redirect_uri não permitido pela política de segurança.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Cliente com o JWT do usuário para garantir identificação segura
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Gerar Authorization Code criptográfico de alta entropia (32 bytes / 256 bits)
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const rawCode = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const codeHash = await sha256(rawCode);
    const targetRedirectUri = redirect_uri || 'https://orcagraf.prexyon.com/auth/prexyon';

    // 2. Chamar RPC segura no banco que valida membership, assinatura, produto e armazena o hash com TTL
    const { data, error } = await supabase.rpc('prexyon_generate_sso_code', {
      p_organization_id: organization_id,
      p_product_code: product_code,
      p_code_hash: codeHash,
      p_redirect_uri: targetRedirectUri,
      p_ttl_seconds: 45,
    });

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Montar URL de redirect segura (passando SOMENTE o authorization code temporário)
    const destinationUrl = new URL(targetRedirectUri);
    destinationUrl.searchParams.set('code', rawCode);
    destinationUrl.searchParams.set('org', organization_id);

    return new Response(
      JSON.stringify({
        success: true,
        redirect_url: destinationUrl.toString(),
        expires_at: data?.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno no servidor de SSO.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
