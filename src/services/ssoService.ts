import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ProductId } from '../types/product';

const getEnvVar = (name: string, fallback: string = ''): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
      return import.meta.env[name];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return process.env[name] as string;
    }
  } catch {}
  return fallback;
};

// Fonte canônica da URL do ArteFlow: preferência por VITE_ARTEFLOW_APP_URL, com fallback seguro para Railway
const resolveArteflowProdUrl = (): string => {
  const envUrl = getEnvVar('VITE_ARTEFLOW_APP_URL');
  if (envUrl && !envUrl.includes('arteflow.prexyon.com')) {
    return envUrl;
  }
  return 'https://arteflow-10-production.up.railway.app';
};

const ORCAGRAF_PROD_URL = getEnvVar('VITE_ORCAGRAF_APP_URL', 'https://or-agraf-bete-20-production.up.railway.app');
const ARTEFLOW_PROD_URL = resolveArteflowProdUrl();
const ARTECHECK_PROD_URL = getEnvVar('VITE_ARTECHECK_APP_URL', '');

const ALLOWLIST_REDIRECTS = [
  'https://or-agraf-bete-20-production.up.railway.app/auth/prexyon',
  'https://arteflow-10-production.up.railway.app/auth/prexyon',
  'https://orcagraf.prexyon.com/auth/prexyon',
  'https://arteflow.prexyon.com/auth/prexyon', // Futuro custom domain documentado
  'https://artecheck.prexyon.com/auth/prexyon',
  ...(ORCAGRAF_PROD_URL ? [`${ORCAGRAF_PROD_URL}/auth/prexyon`] : []),
  ...(ARTEFLOW_PROD_URL ? [`${ARTEFLOW_PROD_URL}/auth/prexyon`] : []),
  ...(ARTECHECK_PROD_URL ? [`${ARTECHECK_PROD_URL}/auth/prexyon`] : []),
];

export interface SsoStartResult {
  success: boolean;
  redirectUrl?: string;
  expiresAt?: string;
  error?: string;
}

export const ssoService = {
  getRedirectUri(productCode: ProductId): string | null {
    if (productCode === 'orcagraf') {
      return `${ORCAGRAF_PROD_URL}/auth/prexyon`;
    }
    if (productCode === 'arteflow') {
      return ARTEFLOW_PROD_URL ? `${ARTEFLOW_PROD_URL}/auth/prexyon` : null;
    }
    if (productCode === 'artecheck') {
      return ARTECHECK_PROD_URL ? `${ARTECHECK_PROD_URL}/auth/prexyon` : null;
    }
    return null;
  },

  async startSso(
    organizationId: string,
    productCode: ProductId = 'orcagraf'
  ): Promise<SsoStartResult> {
    const redirectUri = this.getRedirectUri(productCode);

    if (!redirectUri) {
      return {
        success: false,
        error: `O endereço de destino do software ${productCode} não está configurado no ambiente.`,
      };
    }

    const isDev = Boolean((typeof import.meta !== 'undefined' && import.meta.env?.DEV) || process.env.NODE_ENV === 'development');
    const isAllowed = ALLOWLIST_REDIRECTS.some((url) => redirectUri.startsWith(url)) ||
                      (isDev && (redirectUri.includes('localhost') || redirectUri.includes('127.0.0.1')));

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
