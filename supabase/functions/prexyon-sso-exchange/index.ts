import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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
    const { code, audience = 'orcagraf' } = await req.json();

    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Código de autorização não fornecido ou inválido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const codeHash = await sha256(code.trim());

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Cliente com Service Role para execução privilegiada da troca e geração de sessão oficial
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey || supabaseAnonKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Chama a RPC atômica que consome o código com proteção estrita contra replay
    const { data, error } = await supabaseAdmin.rpc('prexyon_exchange_sso_code', {
      p_code_hash: codeHash,
      p_audience: audience,
    });

    if (error) {
      let statusCode = 400;
      if (error.message.includes('REPLAY_BLOCKED')) statusCode = 409;
      if (error.message.includes('CODE_EXPIRED')) statusCode = 410;
      if (error.message.includes('INVALID_AUDIENCE')) statusCode = 403;

      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Gerar token oficial de autenticação Supabase via generateLink (Server-Side)
    let tokenHash: string | null = null;
    if (data.email && supabaseServiceKey) {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: data.email,
      });

      if (!linkError && linkData?.properties?.hashed_token) {
        tokenHash = linkData.properties.hashed_token;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: data.user_id,
        email: data.email,
        full_name: data.full_name,
        organization_id: data.organization_id,
        product_code: data.product_code,
        redirect_uri: data.redirect_uri,
        token_hash: tokenHash,
        authenticated_at: data.authenticated_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno na troca de autorização SSO.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
