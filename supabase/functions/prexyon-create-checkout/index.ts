import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ALLOWED_ORIGINS = [
  'https://portal.prexyon.com',
  'https://orcagraf.prexyon.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Autenticação necessária para criar assinatura.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { organization_id, plan_code, billing_interval = 'monthly' } = await req.json();

    if (!organization_id || !plan_code) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id e plan_code são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (billing_interval !== 'monthly' && billing_interval !== 'annual') {
      return new Response(
        JSON.stringify({ success: false, error: 'billing_interval deve ser "monthly" ou "annual".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';
    const billingProdEnabled = Deno.env.get('BILLING_PRODUCTION_ENABLED') === 'true';
    const allowedTestOrgs = (Deno.env.get('BILLING_ALLOWED_ORGS') || '').split(',').map((s) => s.trim());

    // 1. Validar Feature Flag de Produção / Homologação Controlada
    if (!billingProdEnabled && !allowedTestOrgs.includes(organization_id)) {
      // Se produção geral não estiver aberta e a org não estiver na allowlist de homologação interna
      if (Deno.env.get('ENVIRONMENT') === 'production') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'O faturamento de produção está em fase de homologação controlada. Contate o suporte para liberação.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2. Validar Sessão JWT do Usuário
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão de usuário inválida ou expirada.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cliente com Service Role para validação administrativa e operações atômicas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Validação de Autoridade: O usuário deve ser Owner ou Admin da Organização
    const { data: member, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .select('role, is_active, is_locked')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !member || !member.is_active || member.is_locked) {
      return new Response(
        JSON.stringify({ success: false, error: 'Você não possui permissão nesta organização.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (member.role !== 'owner' && member.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Apenas proprietários e administradores podem contratar ou alterar planos.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Buscar Dados Oficiais do Plano no Banco (Preços em centavos no servidor)
    const { data: plan, error: planError } = await supabaseAdmin
      .from('prexyon_plans')
      .select('id, code, name, description, monthly_price_cents, annual_price_cents, is_active')
      .eq('code', plan_code)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plano inválido ou inativo.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const priceCents = billing_interval === 'annual' ? plan.annual_price_cents : plan.monthly_price_cents;
    const priceBrl = priceCents / 100;
    const portalUrl = Deno.env.get('PORTAL_URL') || 'https://portal.prexyon.com';

    // 5. Preservação Transacional em Upgrade: Obter assinatura anterior
    const { data: activePaymentSub } = await supabaseAdmin
      .from('prexyon_payment_subscriptions')
      .select('id, provider_subscription_id, status')
      .eq('organization_id', organization_id)
      .eq('status', 'authorized')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousPreapprovalId = activePaymentSub?.provider_subscription_id || null;

    // 6. Criar Assinatura Recorrente Oficial via API /preapproval do Mercado Pago
    const externalReference = `org_${organization_id}:${plan.code}:${billing_interval}`;
    let checkoutUrl = `${portalUrl}/app/assinatura/sucesso?external_reference=${encodeURIComponent(externalReference)}`;
    let initPoint = checkoutUrl;
    let preapprovalId = `mock_preapproval_${Date.now()}`;

    if (mpAccessToken && !mpAccessToken.includes('mock')) {
      try {
        const mpPayload = {
          reason: `Prexyon — Plano ${plan.name} (${billing_interval === 'annual' ? 'Anual' : 'Mensal'})`,
          external_reference: externalReference,
          payer_email: user.email,
          auto_recurring: {
            frequency: billing_interval === 'annual' ? 12 : 1,
            frequency_type: 'months',
            transaction_amount: priceBrl,
            currency_id: 'BRL',
          },
          back_url: `${portalUrl}/app/assinatura/sucesso`,
          status: 'pending',
        };

        const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mpAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mpPayload),
        });

        const mpData = await mpRes.json();
        if (mpData.init_point) {
          initPoint = mpData.init_point;
          checkoutUrl = mpData.sandbox_init_point || mpData.init_point;
          preapprovalId = mpData.id;
        }
      } catch (mpErr: any) {
        console.error('Erro na chamada /preapproval do Mercado Pago:', mpErr.message);
      }
    }

    // 7. Registrar Vínculo de Assinatura no Gateway com chave de transição
    await supabaseAdmin.from('prexyon_payment_subscriptions').upsert(
      {
        organization_id,
        provider: 'mercadopago',
        provider_subscription_id: preapprovalId,
        provider_plan_reference: plan.code,
        status: 'pending',
        billing_interval,
        amount_cents: priceCents,
        currency: 'BRL',
        metadata: {
          plan_code: plan.code,
          plan_name: plan.name,
          payer_email: user.email,
          pending_upgrade_from: previousPreapprovalId,
        },
      },
      { onConflict: 'provider_subscription_id' }
    );

    // 8. Auditoria
    await supabaseAdmin.from('prexyon_subscription_events').insert({
      organization_id,
      event_type: 'checkout_created',
      new_plan_id: plan.id,
      metadata: {
        billing_interval,
        price_cents: priceCents,
        provider_subscription_id: preapprovalId,
        pending_upgrade_from: previousPreapprovalId,
        actor_email: user.email,
      },
      actor_user_id: user.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        provider_subscription_id: preapprovalId,
        checkout_url: checkoutUrl,
        init_point: initPoint,
        plan_name: plan.name,
        price_cents: priceCents,
        billing_interval,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno ao criar assinatura recorrente.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
