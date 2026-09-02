import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, ExternalLink, ShieldCheck, Info, Loader2, AlertCircle } from 'lucide-react';
import { ProductInfo } from '../../types/product';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { ssoService } from '../../services/ssoService';
import { canManagePermissions, canManageSubscription } from '../../security/routeAuthorization';

interface ProductCardProps {
  product: ProductInfo;
  onNavigateToPermissions?: (productId: string) => void;
  onNavigateToSubscription?: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onNavigateToPermissions,
  onNavigateToSubscription
}) => {
  const { user, organization, checkPermission } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLaunchingSso, setIsLaunchingSso] = useState(false);
  const [ssoErrorMessage, setSsoErrorMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLaunchProduct = async () => {
    setSsoErrorMessage(null);

    // Se o produto não estiver contratado/ativo, direciona para a página de contratação (se tiver permissão)
    if (!product.isSubscribed || product.status !== 'active') {
      if (canManageSubscription(user?.role) && onNavigateToSubscription) {
        onNavigateToSubscription();
      } else {
        setIsDetailsOpen(true);
      }
      return;
    }

    // Verificação rigorosa de permissão antes de emitir SSO
    const permCheck = checkPermission(product.id);
    if (!permCheck.allowed) {
      setSsoErrorMessage(permCheck.details || 'Acesso não autorizado ao software.');
      return;
    }

    if (product.id === 'orcagraf') {
      setIsLaunchingSso(true);
      try {
        const ssoResult = await ssoService.startSso(organization.id, 'orcagraf');
        if (ssoResult.success && ssoResult.redirectUrl) {
          // Redirecionamento seguro para OrçaGraf com Authorization Code
          window.location.href = ssoResult.redirectUrl;
        } else {
          setIsLaunchingSso(false);
          setSsoErrorMessage(ssoResult.error || 'Não foi possível iniciar o acesso ao OrçaGraf.');
        }
      } catch (err: any) {
        setIsLaunchingSso(false);
        setSsoErrorMessage(err.message || 'Erro de comunicação ao iniciar login único.');
      }
    } else {
      // Outros produtos (ArteFlow / ArteCheck)
      setIsDetailsOpen(true);
    }
  };

  // Border and accent styling based on product
  const getProductAccent = () => {
    if (!product.isSubscribed || product.status !== 'active') {
      return {
        topBorder: 'border-t-4 border-t-slate-300',
        btnClass: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs hover:border-[#0066ff] hover:text-[#0066ff]',
        symbolBg: 'bg-slate-50 border-slate-200',
      };
    }

    switch (product.id) {
      case 'orcagraf':
        return {
          topBorder: 'border-t-4 border-t-[#16a34a]',
          btnClass: 'bg-[#15803d] hover:bg-[#166534] text-white focus:ring-emerald-500 shadow-sm',
          symbolBg: 'bg-emerald-50/60 border-emerald-100',
        };
      case 'arteflow':
        return {
          topBorder: 'border-t-4 border-t-[#0066ff]',
          btnClass: 'bg-[#0066ff] hover:bg-[#0052cc] text-white focus:ring-blue-500 shadow-sm',
          symbolBg: 'bg-sky-50/60 border-sky-100',
        };
      case 'artecheck':
      default:
        return {
          topBorder: 'border-t-4 border-t-[#7c3aed]',
          btnClass: 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-sm',
          symbolBg: 'bg-purple-50/60 border-purple-100',
        };
    }
  };

  const accent = getProductAccent();

  return (
    <>
      <div
        className={`bg-white rounded-2xl border border-[#e2e8f0] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-5 sm:p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-[0_12px_28px_rgba(0,0,0,0.06)] hover:border-slate-300 ${accent.topBorder}`}
      >
        <div>
          {/* Card Top: Symbol + Badge */}
          <div className="flex items-start justify-between">
            <div className={`w-13 h-13 rounded-2xl flex items-center justify-center p-2.5 border ${accent.symbolBg}`}>
              <img
                src={product.symbolSrc}
                alt={`${product.name} símbolo`}
                className="w-full h-full object-contain"
              />
            </div>
            <Badge status={product.status} label={product.statusLabel} />
          </div>

          {/* Product Identification */}
          <div className="mt-4">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              {product.name}
            </h3>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              {product.tagline}
            </p>
            <p className="mt-2.5 text-xs text-slate-500 leading-relaxed line-clamp-2">
              {product.longDescription}
            </p>
          </div>

          {/* SSO Error Banner if Launch Fails */}
          {ssoErrorMessage && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Acesso negado:</span>
                <span>{ssoErrorMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Card Footer: Main CTA & Options Menu */}
        <div className="mt-6 pt-2 flex items-center gap-2.5">
          <button
            onClick={handleLaunchProduct}
            disabled={isLaunchingSso}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-1 ${accent.btnClass} ${
              isLaunchingSso ? 'opacity-80 cursor-wait' : ''
            }`}
          >
            {isLaunchingSso ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Abrindo {product.name}...</span>
              </>
            ) : (
              <span>{product.ctaText}</span>
            )}
          </button>

          {/* Quick Menu ("...") */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2.5 rounded-xl border border-[#cbd5e1] hover:bg-slate-50 hover:border-slate-400 text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label="Mais opções"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-56 rounded-2xl bg-white shadow-[0_15px_35px_-5px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.06)] border border-slate-100 py-2 z-30 animate-in fade-in-50 zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {product.name}
                </div>
                
                <button
                  onClick={() => {
                    setIsDetailsOpen(true);
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 gap-2.5"
                >
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ver detalhes do módulo</span>
                </button>

                {canManagePermissions(user?.role) && (
                  <button
                    onClick={() => {
                      if (onNavigateToPermissions) onNavigateToPermissions(product.id);
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 gap-2.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Permissões de usuários</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Module Overview / Modal */}
      <Modal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title={product.name}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center p-2 border ${accent.symbolBg}`}>
              <img
                src={product.symbolSrc}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">{product.name}</h4>
              <p className="text-xs text-slate-500">{product.tagline}</p>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            {product.longDescription}
          </p>

          <div>
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Principais recursos inclusos
            </h5>
            <ul className="space-y-2">
              {product.features.map((feat, idx) => (
                <li key={idx} className="flex items-center text-xs text-slate-600 gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0066ff]"></div>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <Badge status={product.status} label={product.statusLabel} />
            <Button
              variant={product.isSubscribed && product.status === 'active' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                setIsDetailsOpen(false);
                if (product.isSubscribed && product.status === 'active') {
                  handleLaunchProduct();
                } else if (onNavigateToSubscription) {
                  onNavigateToSubscription();
                }
              }}
              rightIcon={product.isSubscribed && product.status === 'active' ? <ExternalLink className="w-3.5 h-3.5" /> : undefined}
            >
              {product.isSubscribed && product.status === 'active' ? `Abrir ${product.name}` : `Contratar plano`}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
