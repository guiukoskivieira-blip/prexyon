import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ProductId } from '../types/product';

const ORCAGRAF_PROD_URL = import.meta.env.VITE_ORCAGRAF_APP_URL || 'https://or-agraf-bete-20-production.up.railway.app';

const ALLOWLIST_REDIRECTS = [
  'https://or-agraf-bete-20-production.up.railway.app/auth/prexyon',
  'http://localhost:5173/auth/prexyon',
  'http://localhost:3000/auth/prexyon',
  'http://localhost:5174/auth/prexyon',
  'https://orcagraf.prexyon.com/auth/prexyon',
  ...(ORCAGRAF_PROD_URL ? [`${ORCAGRAF_PROD_URL}/auth/prexyon`] : []),
];


export interface SsoStartResult {
  success: boolean;
  redirectUrl?: string;
  expiresAt?: string;
  error?: string;
}

export const ssoService = {
  getOrçaGrafRedirectUri(): string {
    const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
    if (isDev && typeof window !== 'undefined') {
      // In local dev, allow localhost target if configured
      return `${ORCAGRAF_PROD_URL}/auth/prexyon`;
    }
    return `${ORCAGRAF_PROD_URL}/auth/prexyon`;
  },

  async startSso(
    organizationId: string,
    productCode: ProductId = 'orcagraf'
  ): Promise<SsoStartResult> {
    if (productCode !== 'orcagraf') {
      return {
        success: false,
        error: `A integração de login único (SSO) para ${productCode} estará disponível em breve.`,
      };
    }

    const redirectUri = this.getOrçaGrafRedirectUri();

    // Validação de Allowlist (Prevenção contra Open Redirect)
    const isAllowed = ALLOWLIST_REDIRECTS.some((url) => redirectUri.startsWith(url)) ||
                      (import.meta.env.DEV && redirectUri.includes('localhost'));

    if (!isAllowed) {
      return {
        success: false,
        error: 'URL de redirecionamento não autorizada pela política de segurança.',
      };
    }

    if (!isSupabaseConfigured()) {
      // Fallback de desenvolvimento local simulado
      const mockCode = `demo_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const destination = new URL(redirectUri);
      destination.searchParams.set('code', mockCode);
      destination.searchParams.set('org', organizationId);
      return {
        success: true,
        redirectUrl: destination.toString(),
        expiresAt: new Date(Date.now() + 45000).toISOString(),
      };
    }

    try {
      // 1. Chamar RPC segura no Supabase (executa com SECURITY DEFINER, vincula identidade a auth.uid())
      const { data, error } = await (supabase.rpc as any)('prexyon_generate_sso_code', {
        p_organization_id: organizationId,
        p_product_code: productCode,
      });

      if (error) {
        let userFriendlyMsg = 'Não foi possível iniciar o acesso ao software. Tente novamente.';
        if (error.message.includes('PRODUCT_NOT_SUBSCRIBED') || error.message.includes('assinatura')) {
          userFriendlyMsg = 'Sua organização não possui acesso contratado a este software.';
        } else if (error.message.includes('USER_PRODUCT_ACCESS_DENIED') || error.message.includes('USER_PRODUCT_PERMISSION_DENIED') || error.message.includes('acesso')) {
          userFriendlyMsg = 'Seu acesso a este software não está habilitado pela administração.';
        } else if (error.message.includes('ORGANIZATION_INACTIVE')) {
          userFriendlyMsg = 'A organização está inativa ou suspensa.';
        } else if (error.message.includes('MEMBERSHIP_INACTIVE')) {
          userFriendlyMsg = 'Seu usuário está inativo ou bloqueado nesta organização.';
        }

        return {
          success: false,
          error: userFriendlyMsg,
        };
      }

      // 2. Construir URL autorizada transmitindo SOMENTE o Authorization Code gerado pelo backend
      const destination = new URL(redirectUri);
      destination.searchParams.set('code', (data as any)?.code);
      destination.searchParams.set('org', organizationId);

      return {
        success: true,
        redirectUrl: destination.toString(),
        expiresAt: (data as any)?.expires_at,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro inesperado ao gerar autorização de login único.',
      };
    }
  },
};
