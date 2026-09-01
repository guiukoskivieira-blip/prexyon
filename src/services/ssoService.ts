import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { ProductId } from '../types/product';

const ORCAGRAF_PROD_URL = import.meta.env.VITE_ORCAGRAF_APP_URL || 'https://orcagraf.prexyon.com';

const ALLOWLIST_REDIRECTS = [
  'https://orcagraf.prexyon.com/auth/prexyon',
  'http://localhost:5173/auth/prexyon',
  'http://localhost:3000/auth/prexyon',
  'http://localhost:5174/auth/prexyon',
  ...(ORCAGRAF_PROD_URL ? [`${ORCAGRAF_PROD_URL}/auth/prexyon`] : []),
];

async function computeSha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomCode(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
      // 1. Gerar Authorization Code criptograficamente seguro (32 bytes / 256 bits de entropia)
      const rawCode = generateRandomCode();
      const codeHash = await computeSha256(rawCode);

      // 2. Chamar RPC segura no Supabase (executa com SECURITY DEFINER e validação de entitlement)
      const { data, error } = await (supabase.rpc as any)('prexyon_generate_sso_code', {
        p_organization_id: organizationId,
        p_product_code: productCode,
        p_code_hash: codeHash,
        p_redirect_uri: redirectUri,
        p_ttl_seconds: 45,
      });

      if (error) {
        let userFriendlyMsg = 'Não foi possível iniciar o acesso ao software. Tente novamente.';
        if (error.message.includes('assinatura')) {
          userFriendlyMsg = 'Sua organização não possui uma assinatura ativa do OrçaGraf.';
        } else if (error.message.includes('acesso')) {
          userFriendlyMsg = 'Seu acesso ao OrçaGraf não está habilitado.';
        } else if (error.message.includes('limite')) {
          userFriendlyMsg = 'Muitas tentativas em sequência. Aguarde alguns segundos.';
        }

        return {
          success: false,
          error: userFriendlyMsg,
        };
      }

      // 3. Construir URL autorizada transmitindo SOMENTE o Authorization Code (sem tokens ou dados sensíveis na URL)
      const destination = new URL(redirectUri);
      destination.searchParams.set('code', rawCode);
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
