import { ProductInfo } from '../types/product';
import orcagrafLogo from '../assets/branding/orcagraf-logo.png';
import orcagrafSymbol from '../assets/branding/orcagraf-symbol.png';
import arteflowLogo from '../assets/branding/arteflow-logo.png';
import arteflowSymbol from '../assets/branding/arteflow-symbol.png';
import artecheckLogo from '../assets/branding/artecheck-logo.png';
import artecheckSymbol from '../assets/branding/artecheck-symbol.png';

export const mockProducts: ProductInfo[] = [
  {
    id: 'orcagraf',
    name: 'OrçaGraf',
    tagline: 'Orçamentos e gestão comercial',
    description: 'Orçamentos e gestão comercial',
    longDescription: 'Sistema completo para cálculo dinâmico de custos, formulação precisa de orçamentos gráficos, propostas comerciais e pedidos de venda.',
    logoSrc: orcagrafLogo,
    symbolSrc: orcagrafSymbol,
    status: 'active',
    statusLabel: 'Ativo',
    ctaText: 'Abrir OrçaGraf',
    url: import.meta.env.VITE_ORCAGRAF_APP_URL || 'https://orcagraf.prexyon.com',
    theme: {
      primary: '#16a34a',
      light: '#22c55e',
      dark: '#15803d',
      bgLight: '#f0fdf4',
      borderLight: '#bbf7d0',
      accent: '#22c55e',
      cardBorderHover: 'hover:border-emerald-500',
      buttonClass: 'bg-[#15803d] hover:bg-[#166534] text-white focus:ring-emerald-500',
    },
    features: [
      'Cálculos automáticos de papel e tintas',
      'Orçamentos com margem configurável',
      'Impressão e envio de PDF profissional',
      'Histórico de clientes e orçamentos'
    ],
    isSubscribed: true
  },
  {
    id: 'arteflow',
    name: 'ArteFlow',
    tagline: 'Produção, pedidos e financeiro',
    description: 'Produção, pedidos e financeiro',
    longDescription: 'Gestão visual do fluxo produtivo da fábrica com controle de etapas (Kanban), roteiros de acabamento, controle de entregas e financeiro integrado.',
    logoSrc: arteflowLogo,
    symbolSrc: arteflowSymbol,
    status: 'active',
    statusLabel: 'Ativo',
    ctaText: 'Abrir ArteFlow',
    url: 'https://arteflow.prexyon.com',
    theme: {
      primary: '#0284c7',
      light: '#38bdf8',
      dark: '#0369a1',
      bgLight: '#f0f9ff',
      borderLight: '#bae6fd',
      accent: '#0284c7',
      cardBorderHover: 'hover:border-sky-500',
      buttonClass: 'bg-[#0066ff] hover:bg-[#0052cc] text-white focus:ring-blue-500',
    },
    features: [
      'Controle de produção Kanban em tempo real',
      'Fila de máquinas e etapas de acabamento',
      'Emissão de ordens de serviço (OS)',
      'Contas a pagar e receber'
    ],
    isSubscribed: true
  },
  {
    id: 'artecheck',
    name: 'ArteCheck',
    tagline: 'Pré-impressão e análise técnica',
    description: 'Pré-impressão e análise técnica',
    longDescription: 'Módulo inteligente de validação técnica de artes finais, detecção de erros de sangria, resolução de imagens, fontes em curvas e separação de cores.',
    logoSrc: artecheckLogo,
    symbolSrc: artecheckSymbol,
    status: 'coming_soon',
    statusLabel: 'Em breve',
    ctaText: 'Conhecer produto',
    url: 'https://artecheck.prexyon.com',
    theme: {
      primary: '#7c3aed',
      light: '#a855f7',
      dark: '#6d28d9',
      bgLight: '#faf5ff',
      borderLight: '#e9d5ff',
      accent: '#7c3aed',
      cardBorderHover: 'hover:border-purple-500',
      buttonClass: 'bg-white hover:bg-purple-50 text-[#7c3aed] border border-[#d8b4fe] focus:ring-purple-500',
    },
    features: [
      'Validação automática de PDF para impressão',
      'Inspeção de cores (CMYK, Pantone, RGB)',
      'Detecção de resolução e sangria insuficiente',
      'Relatórios técnicos de conformidade'
    ],
    isSubscribed: false
  }
];
