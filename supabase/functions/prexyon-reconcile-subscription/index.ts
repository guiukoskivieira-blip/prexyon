import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Autenticação necessária.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Validar permissão de Owner/Admin
    const { data: member } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .single();

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Apenas administradores podem reconciliar assinaturas.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Buscar assinatura no gateway cadastrada para a organização
    const { data: paySub } = await supabaseAdmin
      .from('prexyon_payment_subscriptions')
      .select('*')
      .eq('organization_id', organization_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!paySub) {
      return new Response(
        JSON.stringify({ success: true, reconciled: false, message: 'Nenhuma assinatura no gateway vinculada a esta organização.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let remoteStatus = paySub.status;
    let nextPaymentDate: string | null = paySub.next_payment_at;

    // 2. Consultar API oficial do Mercado Pago para conferência autoritativa
    if (mpAccessToken && paySub.provider_subscription_id && !paySub.provider_subscription_id.startsWith('mock_')) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${paySub.provider_subscription_id}`, {
          headers: { 'Authorization': `Bearer ${mpAccessToken}` },
        });

        if (mpRes.ok) {
          const mpData = await mpRes.json();
          remoteStatus = mpData.status; // 'authorized', 'paused', 'cancelled', 'pending'
          nextPaymentDate = mpData.next_payment_date || mpData.auto_recurring?.end_date || null;
        }
      } catch (mpErr: any) {
        console.error('Falha na consulta de reconciliação no Mercado Pago:', mpErr.message);
      }
    }

    // 3. Mapear status remoto para status interno Prexyon
    let prexyonStatus = 'active';
    if (remoteStatus === 'authorized') {
      prexyonStatus = 'active';
    } else if (remoteStatus === 'paused' || remoteStatus === 'pending') {
      prexyonStatus = 'past_due';
    } else if (remoteStatus === 'cancelled') {
      prexyonStatus = 'canceled';
    }

    // 4. Atualizar registro local
    const updatePayload: any = {
      status: prexyonStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextPaymentDate) {
      updatePayload.current_period_end = nextPaymentDate;
    }

    await supabaseAdmin
      .from('prexyon_subscriptions')
      .update(updatePayload)
      .eq('organization_id', organization_id);

    await supabaseAdmin
      .from('prexyon_payment_subscriptions')
      .update({
        status: remoteStatus,
        next_payment_at: nextPaymentDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paySub.id);

    // 5. Auditoria de Reconciliação
    await supabaseAdmin.from('prexyon_subscription_events').insert({
      organization_id,
      event_type: 'subscription_reconciled',
      metadata: {
        provider: 'mercadopago',
        provider_subscription_id: paySub.provider_subscription_id,
        remote_status: remoteStatus,
        resolved_status: prexyonStatus,
        next_payment_date: nextPaymentDate,
      },
      actor_user_id: user.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        reconciled: true,
        organization_id,
        status: prexyonStatus,
        remote_status: remoteStatus,
        next_payment_date: nextPaymentDate,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno na reconciliação.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
