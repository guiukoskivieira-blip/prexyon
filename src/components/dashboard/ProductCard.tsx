import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, ExternalLink, ShieldCheck, Info, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { ProductInfo, ProductStatus } from '../../types/product';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { ssoService } from '../../services/ssoService';

interface ProductCardProps {
  product: ProductInfo;
  onNavigateToPermissions?: (productId: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onNavigateToPermissions
}) => {
  const { updateProductStatus, organization, checkPermission } = useAuth();
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

    // Verificação de permissão antes de iniciar
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
          btnClass: product.status === 'active'
            ? 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-sm'
            : 'bg-white hover:bg-purple-50/80 text-[#7c3aed] border border-[#d8b4fe] shadow-2xs',
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
        {/* Top Product Header */}
        <div>
          <div className="flex items-start justify-between gap-3">
            {/* Logo Symbol + Info */}
            <div className="flex items-center space-x-3.5">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center p-2 border ${accent.symbolBg} shrink-0`}>
                <img
                  src={product.symbolSrc}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  {product.name}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5 leading-snug">
                  {product.description}
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div className="shrink-0">
              <Badge status={product.status} label={product.statusLabel} />
            </div>
          </div>

          {/* Inline SSO Error Notification */}
          {ssoErrorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{ssoErrorMessage}</span>
            </div>
          )}
        </div>

        {/* Action Button Row */}
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

                {/* State switcher for demo reviewers */}
                <div className="mt-1 pt-1 border-t border-slate-100 px-3 py-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Simular Estado:</span>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {(['active', 'coming_soon', 'trial', 'suspended'] as ProductStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => {
                          updateProductStatus(product.id, st);
                          setIsMenuOpen(false);
                        }}
                        className={`text-[10px] px-1.5 py-1 rounded text-left transition-colors ${
                          product.status === st ? 'bg-blue-100 text-blue-800 font-bold' : 'hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Details Modal */}
      <Modal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title={`${product.name} — Ecossistema Prexyon`}
        maxWidth="lg"
      >
        <div className="space-y-5">
          <div className="flex items-center space-x-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center p-2.5 border ${accent.symbolBg} shrink-0`}>
              <img
                src={product.symbolSrc}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-lg font-bold text-slate-900">{product.name}</h4>
                <Badge status={product.status} label={product.statusLabel} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{product.tagline}</p>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Sobre o Software</h5>
            <p className="text-sm text-slate-600 leading-relaxed">
              {product.longDescription}
            </p>
          </div>

          <div>
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Principais Recursos</h5>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
              {product.features.map((feat, idx) => (
                <li key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <Sparkles className="w-3.5 h-3.5 text-[#0066ff] shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsDetailsOpen(false)}>
              Fechar
            </Button>
            {product.status === 'active' || product.status === 'trial' ? (
              <Button
                variant={product.id as any}
                onClick={handleLaunchProduct}
                isLoading={isLaunchingSso}
                rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
              >
                {product.ctaText}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  alert(`Abertura de interesse no ${product.name} registrada para sua conta.`);
                  setIsDetailsOpen(false);
                }}
              >
                Solicitar Demonstração
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};
