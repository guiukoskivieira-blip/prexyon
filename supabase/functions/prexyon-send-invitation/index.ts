import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function buildEmailHtml(params: {
  orgName: string;
  role: string;
  products: string[];
  inviteUrl: string;
}): string {
  const roleLabel = params.role === 'admin' ? 'Administrador' : 'Membro';
  const productLabels: Record<string, string> = {
    orcagraf: 'OrçaGraf',
    arteflow: 'ArteFlow',
    artecheck: 'ArteCheck',
  };
  const softwareList = params.products
    .map((p) => productLabels[p] || p)
    .join(', ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Você foi convidado para a Prexyon</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #f1f5f9; text-align: left;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
                PREXYON
              </h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b; font-weight: 500;">
                Ecossistema Gráfico Integrado
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #0f172a;">
                Você foi convidado para a Prexyon
              </h2>
              
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 22px; color: #334155;">
                A organização <strong>${params.orgName}</strong> convidou você para colaborar na plataforma Prexyon.
              </p>

              <!-- Access Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Papel atribuído:</div>
                    <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 12px;">${roleLabel}</div>
                    
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Softwares liberados:</div>
                    <div style="font-size: 14px; font-weight: 600; color: #2563eb;">${softwareList || 'Nenhum software liberado'}</div>
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${params.inviteUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 32px; border-radius: 8px; text-align: center;">
                      Aceitar Convite
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Notice -->
              <p style="margin: 0 0 16px 0; font-size: 12px; line-height: 18px; color: #64748b;">
                ⏱ <strong>Validade:</strong> Este convite é válido por <strong>7 dias</strong>.
              </p>

              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #94a3b8;">
                Se o botão acima não funcionar, copie e cole o link a seguir no seu navegador:<br>
                <a href="${params.inviteUrl}" style="color: #2563eb; word-break: break-all;">${params.inviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; line-height: 16px; color: #94a3b8; text-align: center;">
              Se você não reconhece ou não esperava este convite, pode ignorar esta mensagem com segurança.<br>
              © ${new Date().getFullYear()} Prexyon. Todos os direitos reservados.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'UNAUTHENTICATED: Token de autenticação não fornecido.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      organization_id,
      email,
      role = 'member',
      product_access = ['orcagraf'],
      permissions = {},
    } = await req.json();

    if (!organization_id || !email) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id e email são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 0. Validação e sanitização estrita de permissions (Fail-Closed)
    const sanitizedPermissions: Record<string, string[]> = {};
    if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
      for (const [prodKey, permList] of Object.entries(permissions)) {
        // Validação 1: O produto deve estar em product_access
        if (!product_access.includes(prodKey)) {
          return new Response(
            JSON.stringify({ success: false, error: `PERMISSION_FOR_UNAUTHORIZED_PRODUCT: Cannot grant permissions for product '${prodKey}' which is not in product_access` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Validação 2: permList deve ser um array de strings
        if (!Array.isArray(permList)) {
          return new Response(
            JSON.stringify({ success: false, error: `INVALID_PERMISSIONS_FORMAT: Permissions for '${prodKey}' must be an array of strings` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Validação 3: Cada permissão deve pertencer ao prefixo do produto
        const cleanPerms: string[] = [];
        for (const perm of permList as any[]) {
          if (typeof perm !== 'string' || !perm.startsWith(`${prodKey}.`)) {
            return new Response(
              JSON.stringify({ success: false, error: `INVALID_PERMISSION_KEY: Permission '${perm}' does not belong to product '${prodKey}'` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          cleanPerms.push(perm);
        }
        sanitizedPermissions[prodKey] = cleanPerms;
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Cliente com o JWT do chamador para garantir autorização RLS e security context
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Chamar RPC autoritativa para validação e criação do convite
    const { data: inviteResult, error: inviteError } = await supabase.rpc('prexyon_invite_user', {
      p_organization_id: organization_id,
      p_email: email,
      p_role: role,
      p_product_access: product_access,
      p_permissions: sanitizedPermissions,
    });

    if (inviteError) {
      return new Response(
        JSON.stringify({ success: false, error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Token RAW retornado apenas neste momento e mantido estritamente em memória
    const rawToken = inviteResult.token;
    const invitationId = inviteResult.id;
    const cleanEmail = inviteResult.email;

    // 3. Montar URL oficial do convite
    const appUrl = (Deno.env.get('PREXYON_APP_URL') || 'https://prexyon-production.up.railway.app').replace(/\/$/, '');
    const inviteUrl = `${appUrl}/app/convite?token=${rawToken}`;

    // 4. Buscar nome fantasia da organização
    let orgName = 'sua organização';
    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('trade_name')
        .eq('id', organization_id)
        .maybeSingle();
      if (orgData?.trade_name) {
        orgName = orgData.trade_name;
      }
    } catch {
      // fallback silencioso para orgName padrão
    }

    // 5. Enviar e-mail via Resend API
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFrom = Deno.env.get('RESEND_FROM') || 'Prexyon <onboarding@resend.dev>';

    let emailSent = false;
    let emailError: string | null = null;

    if (!resendApiKey) {
      emailSent = false;
      emailError = 'RESEND_API_KEY não configurada no ambiente server-side.';
    } else {
      try {
        const htmlBody = buildEmailHtml({
          orgName,
          role,
          products: product_access,
          inviteUrl,
        });

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [cleanEmail],
            subject: 'Você foi convidado para a Prexyon',
            html: htmlBody,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
        } else {
          const resendErrData = await resendRes.json().catch(() => ({}));
          emailSent = false;
          emailError = resendErrData?.message || `Falha no envio HTTP ${resendRes.status}`;
        }
      } catch (err: any) {
        emailSent = false;
        emailError = err.message || 'Erro inesperado na chamada ao Resend';
      }
    }

    // 6. Resposta estruturada para a interface (sem expor secrets nem persistir token raw)
    // Se o e-mail foi enviado com sucesso, NÃO expor raw_token ou invite_url ao frontend.
    // Expor temporariamente apenas se o e-mail falhou para permitir "Copiar Link de Convite".
    const responsePayload: Record<string, any> = {
      success: true,
      invitation_created: true,
      email_sent: emailSent,
      email_error: emailError,
      invitation_id: invitationId,
      email: cleanEmail,
    };

    if (!emailSent) {
      responsePayload.raw_token = rawToken;
      responsePayload.invite_url = inviteUrl;
    }

    return new Response(
      JSON.stringify(responsePayload),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno no processamento do convite.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
