export type ProductId = 'orcagraf' | 'arteflow' | 'artecheck';

export type ProductStatus = 'active' | 'trial' | 'inactive' | 'coming_soon' | 'suspended';

export interface ProductTheme {
  primary: string;
  light: string;
  dark: string;
  bgLight: string;
  borderLight: string;
  accent: string;
  cardBorderHover: string;
  buttonClass: string;
}

export interface ProductInfo {
  id: ProductId;
  name: string;
  tagline: string;
  description: string;
  longDescription: string;
  logoSrc: string;
  symbolSrc: string;
  status: ProductStatus;
  statusLabel: string;
  ctaText: string;
  url?: string;
  theme: ProductTheme;
  features: string[];
  isSubscribed: boolean;
}

export interface UserProductAccess {
  productId: ProductId;
  hasAccess: boolean;
  status: ProductStatus;
  roleInProduct?: string;
  expiresAt?: string;
}
