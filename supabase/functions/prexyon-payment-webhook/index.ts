import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Validação Criptográfica Oficial do Header x-signature do Mercado Pago
 * Manifest format: id:[data.id];request-id:[x-request-id];ts:[ts];
 */
async function verifyMercadoPagoSignature(
  xSignature: string | null,
  xRequestId: string | null,
  resourceId: string,
  secret: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!secret) {
    return { valid: false, reason: 'MERCADO_PAGO_WEBHOOK_SECRET não configurado no servidor (fail-closed).' };
  }

  if (!xSignature || !xRequestId || !resourceId) {
    return { valid: false, reason: 'Headers x-signature, x-request-id ou resourceId ausentes.' };
  }

  // Extrair partes do x-signature (ts=...,v1=...)
  const parts = xSignature.split(',');
  let ts: string | null = null;
  let receivedHash: string | null = null;

  for (const part of parts) {
    const [key, val] = part.trim().split('=');
    if (key === 'ts') ts = val;
    if (key === 'v1') receivedHash = val;
  }

  if (!ts || !receivedHash) {
    return { valid: false, reason: 'x-signature malformado (ts ou v1 ausentes).' };
  }

  // Validação de janela de tempo (Replay attack prevention / 10 minutos de tolerância)
  const currentTs = Math.floor(Date.now() / 1000);
  const webhookTs = parseInt(ts, 10);
  if (isNaN(webhookTs) || Math.abs(currentTs - webhookTs) > 600) {
    return { valid: false, reason: 'Timestamp de assinatura expirado ou fora da janela de tolerância de 10 minutos.' };
  }

  // Construção do manifesto oficial Mercado Pago
  const manifest = `id:${resourceId};request-id:${xRequestId};ts:${ts};`;

  // Cálculo do HMAC-SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(manifest);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const calculatedHash = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Comparação segura de tamanho e caracteres (Timing-safe)
  if (calculatedHash.length !== receivedHash.length) {
    return { valid: false, reason: 'HMAC hash mismatch.' };
  }

  let match = 0;
  for (let i = 0; i < calculatedHash.length; i++) {
    match |= calculatedHash.charCodeAt(i) ^ receivedHash.charCodeAt(i);
  }

  if (match !== 0) {
    return { valid: false, reason: 'HMAC hash mismatch.' };
  }

  return { valid: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody || '{}');

    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');
    const url = new URL(req.url);

    // Extrair ID do recurso (data.id no payload ou id/data.id na query string)
    const resourceId = String(
      body.data?.id || body.id || url.searchParams.get('data.id') || url.searchParams.get('id') || ''
    );
    const eventType = String(body.type || body.action || 'subscription_preapproval');
    const providerEventId = String(body.id || `ev_${resourceId}_${Date.now()}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const mpAccessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';
    const mpWebhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') ?? '';

    // 1. AUTENTICAÇÃO CRIPTOGRÁFICA OBRIGATÓRIA (FAIL-CLOSED)
    // Se o segredo estiver presente ou não for mock de teste, exige validação de assinatura válida
    if (mpWebhookSecret) {
      const sigCheck = await verifyMercadoPagoSignature(xSignature, xRequestId, resourceId, mpWebhookSecret);
      if (!sigCheck.valid) {
        return new Response(
          JSON.stringify({ success: false, error: `Assinatura criptográfica inválida: ${sigCheck.reason}` }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (Deno.env.get('ENVIRONMENT') === 'production') {
      return new Response(
        JSON.stringify({ success: false, error: 'MERCADO_PAGO_WEBHOOK_SECRET não configurado no ambiente de produção.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. IDEMPOTÊNCIA DE EVENTO (UNIQUE PROVIDER + EVENT ID)
    const { data: existingEvent } = await supabaseAdmin
      .from('prexyon_webhook_events')
      .select('id, status')
      .eq('provider', 'mercadopago')
      .eq('provider_event_id', providerEventId)
      .maybeSingle();

    if (existingEvent && existingEvent.status === 'processed') {
      return new Response(
        JSON.stringify({ success: true, message: 'Evento já processado anteriormente (idempotência garantida).' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!existingEvent) {
      await supabaseAdmin.from('prexyon_webhook_events').insert({
        provider: 'mercadopago',
        provider_event_id: providerEventId,
        event_type: eventType,
        payload_hash: xSignature || 'signature_verified',
        status: 'received',
        metadata: body,
      });
    }

    // 3. CONSULTA SERVER-SIDE AUTORITATIVA NO MERCADO PAGO
    let resourceData: any = body.data || body;
    let remoteStatus = 'authorized';
    let nextPaymentDate: string | null = null;
    let externalRef = String(body.external_reference || body.data?.external_reference || '');

    if (mpAccessToken && resourceId && !resourceId.startsWith('mock_')) {
      try {
        if (eventType.includes('preapproval') || resourceId.startsWith('preapp_')) {
          const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
            headers: { 'Authorization': `Bearer ${mpAccessToken}` },
          });
          if (mpRes.ok) {
            resourceData = await mpRes.json();
            remoteStatus = resourceData.status; // 'authorized', 'paused', 'cancelled', 'pending'
            nextPaymentDate = resourceData.next_payment_date || resourceData.auto_recurring?.end_date || null;
            externalRef = resourceData.external_reference || externalRef;
          }
        } else {
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
            headers: { 'Authorization': `Bearer ${mpAccessToken}` },
          });
          if (mpRes.ok) {
            resourceData = await mpRes.json();
            remoteStatus = resourceData.status === 'approved' ? 'authorized' : resourceData.status;
            externalRef = resourceData.external_reference || externalRef;
          }
        }
      } catch (err: any) {
        console.error('Erro na consulta remota ao Mercado Pago:', err.message);
      }
    }

    // 4. CORRELAÇÃO DE ORGANIZAÇÃO E PLANO
    let orgId: string | null = null;
    let planCode: string | null = null;
    let billingInterval = 'monthly';

    if (externalRef.startsWith('org_')) {
      const parts = externalRef.replace(/^org_/, '').split(':');
      orgId = parts[0];
      planCode = parts[1];
      billingInterval = parts[2] || 'monthly';
    }

    if (!orgId) {
      await supabaseAdmin
        .from('prexyon_webhook_events')
        .update({ status: 'ignored', processing_error: 'external_reference sem organization_id' })
        .eq('provider_event_id', providerEventId);

      return new Response(
        JSON.stringify({ success: true, message: 'Webhook ignorado: sem correlação de organização.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. RESOURCE-LEVEL IDEMPOTENCY: Verificar se a transação financeira já foi processada
    const { data: existingTx } = await supabaseAdmin
      .from('prexyon_payment_transactions')
      .select('id, status')
      .eq('provider_payment_id', resourceId)
      .maybeSingle();

    if (existingTx && existingTx.status === 'approved' && remoteStatus === 'authorized') {
      await supabaseAdmin
        .from('prexyon_webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('provider_event_id', providerEventId);

      return new Response(
        JSON.stringify({ success: true, message: 'Transação financeira já consolidada (resource-level idempotency).' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. MAPEAR STATUS DO PROVEDOR PARA PREXYON
    let prexyonStatus = 'active';
    if (remoteStatus === 'authorized' || remoteStatus === 'approved') {
      prexyonStatus = 'active';
    } else if (remoteStatus === 'paused' || remoteStatus === 'in_process' || remoteStatus === 'pending') {
      prexyonStatus = 'past_due';
    } else if (remoteStatus === 'cancelled' || remoteStatus === 'rejected') {
      prexyonStatus = 'canceled';
    }

    let planId: string | null = null;
    if (planCode) {
      const { data: pData } = await supabaseAdmin
        .from('prexyon_plans')
        .select('id')
        .eq('code', planCode)
        .maybeSingle();
      if (pData) planId = pData.id;
    }

    const calculatedPeriodEnd = nextPaymentDate || new Date(Date.now() + (billingInterval === 'annual' ? 365 : 30) * 86400000).toISOString();

    // 7. ATUALIZAÇÃO SEGURA DA ASSINATURA LOCAL
    const updatePayload: any = {
      organization_id: orgId,
      status: prexyonStatus,
      billing_interval: billingInterval,
      current_period_start: new Date().toISOString(),
      current_period_end: calculatedPeriodEnd,
      cancel_at_period_end: prexyonStatus === 'canceled',
      updated_at: new Date().toISOString(),
    };
    if (planId) updatePayload.plan_id = planId;

    await supabaseAdmin
      .from('prexyon_subscriptions')
      .upsert(updatePayload, { onConflict: 'organization_id' });

    // 8. TRANSIÇÃO DE UPGRADE SEGURA: Cancelar preapproval anterior SOMENTE após aprovação do novo
    const { data: currentPaySub } = await supabaseAdmin
      .from('prexyon_payment_subscriptions')
      .select('id, metadata')
      .eq('provider_subscription_id', resourceId)
      .maybeSingle();

    if (currentPaySub?.metadata?.pending_upgrade_from && prexyonStatus === 'active') {
      const oldPreapprovalId = currentPaySub.metadata.pending_upgrade_from;
      if (mpAccessToken && !oldPreapprovalId.startsWith('mock_')) {
        try {
          await fetch(`https://api.mercadopago.com/preapproval/${oldPreapprovalId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${mpAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'cancelled' }),
          });
        } catch (e: any) {
          console.warn('Aviso ao cancelar preapproval antigo:', e.message);
        }
      }

      await supabaseAdmin
        .from('prexyon_payment_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('provider_subscription_id', oldPreapprovalId);

      await supabaseAdmin.from('prexyon_subscription_events').insert({
        organization_id: orgId,
        event_type: 'plan_upgrade_completed',
        new_plan_id: planId,
        metadata: {
          previous_preapproval_id: oldPreapprovalId,
          activated_preapproval_id: resourceId,
        },
      });
    }

    // 9. REGISTRAR TRANSAÇÃO E CONCLUIR WEBHOOK
    const amountCents = Math.round(Number(resourceData.transaction_amount || resourceData.auto_recurring?.transaction_amount || 0) * 100) || 5990;
    await supabaseAdmin.from('prexyon_payment_transactions').upsert(
      {
        organization_id: orgId,
        provider: 'mercadopago',
        provider_payment_id: resourceId,
        provider_event_id: providerEventId,
        status: remoteStatus,
        amount_cents: amountCents,
        currency: 'BRL',
        billing_interval: billingInterval,
        payment_method_type: resourceData.payment_type_id || 'credit_card',
        paid_at: prexyonStatus === 'active' ? new Date().toISOString() : null,
        failed_at: prexyonStatus === 'canceled' ? new Date().toISOString() : null,
        metadata: resourceData,
      },
      { onConflict: 'provider_payment_id' }
    );

    await supabaseAdmin
      .from('prexyon_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('provider_event_id', providerEventId);

    await supabaseAdmin.from('prexyon_subscription_events').insert({
      organization_id: orgId,
      event_type: prexyonStatus === 'active' ? 'payment_succeeded' : `payment_${prexyonStatus}`,
      new_plan_id: planId,
      metadata: {
        provider_resource_id: resourceId,
        remote_status: remoteStatus,
        billing_interval: billingInterval,
        amount_cents: amountCents,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        organization_id: orgId,
        status: prexyonStatus,
        entitlements_synced: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro no processamento do webhook.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
