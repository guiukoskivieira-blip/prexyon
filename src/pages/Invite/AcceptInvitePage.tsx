import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { memberManagementService } from '../../services/memberManagementService';
import { PrexyonLogo } from '../../components/ui/PrexyonLogo';
import { Button } from '../../components/ui/Button';
import {
  Building2,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  UserCheck,
  Package,
  Layers,
  LogOut,
  AlertCircle
} from 'lucide-react';
import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';

interface AcceptInvitePageProps {
  token: string;
  onAccepted: () => void;
  onCancel: () => void;
}

interface InvitationPreviewData {
  id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  role: string;
  product_access: string[];
  permissions: Record<string, string[]>;
  expires_at: string;
}

const PERM_LABELS: Record<string, string> = {
  'orcagraf.view': 'Visualização do sistema OrçaGraf',
  'orcagraf.quotes.view': 'Visualização de orçamentos',
  'orcagraf.quotes.create': 'Criação de novos orçamentos',
  'orcagraf.quotes.approve': 'Aprovação de orçamentos',
  'orcagraf.quotes.delete': 'Exclusão de orçamentos',
  'orcagraf.pricing.manage': 'Gestão de tabelas de preços',
};

export const AcceptInvitePage: React.FC<AcceptInvitePageProps> = ({
  token,
  onAccepted,
  onCancel,
}) => {
  const { user, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [previewData, setPreviewData] = useState<InvitationPreviewData | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [invitationEmail, setInvitationEmail] = useState<string | null>(null);
  const [callerEmail, setCallerEmail] = useState<string | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadPreview() {
      if (!token) {
        setIsLoading(false);
        setErrorCode('INVALID_TOKEN');
        setErrorMessage('Token de convite ausente ou inválido.');
        return;
      }

      setIsLoading(true);
      const res = await memberManagementService.getInvitationPreview(token);

      if (!mounted) return;
      setIsLoading(false);

      if (res.success && res.data) {
        setPreviewData(res.data);
      } else {
        setErrorCode(res.error || 'UNKNOWN_ERROR');
        setInvitationEmail(res.invitation_email || null);
        setCallerEmail(res.caller_email || null);

        if (res.error === 'INVITATION_EMAIL_MISMATCH') {
          setErrorMessage('Este convite foi destinado a outro endereço de e-mail.');
        } else if (res.error === 'INVITATION_REVOKED') {
          setErrorMessage('Este convite foi cancelado e não pode mais ser utilizado.');
        } else if (res.error === 'INVITATION_ALREADY_USED') {
          setErrorMessage('Este convite já foi aceito anteriormente.');
        } else if (res.error === 'INVITATION_EXPIRED') {
          setErrorMessage('O prazo de validade deste convite expirou.');
        } else {
          setErrorMessage(res.error || 'Não foi possível carregar os dados do convite.');
        }
      }
    }

    loadPreview();

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleAccept = async () => {
    if (!token || isAccepting) return;

    setIsAccepting(true);
    setErrorMessage(null);

    const res = await memberManagementService.acceptInvitation(token);
    setIsAccepting(false);

    if (res.success) {
      setAcceptSuccess(true);
      setTimeout(() => {
        onAccepted();
      }, 1200);
    } else {
      setErrorMessage(res.error || 'Falha ao aceitar o convite.');
    }
  };

  const handleSwitchAccount = async () => {
    await logout();
    onCancel();
  };

  // 1. Estado de Carregamento
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4">
        <PrexyonLogo variant="dark" className="h-8 w-auto animate-pulse mb-4" />
        <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-[#0066ff]" />
          <span>Validando convite seguro...</span>
        </div>
      </div>
    );
  }

  // 2. Estado de Sucesso Imediato
  if (acceptSuccess) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-emerald-100 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Convite Aceito com Sucesso!</h3>
          <p className="text-xs text-slate-500">
            Você agora faz parte da organização. Redirecionando para o Portal...
          </p>
          <div className="pt-2 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#0066ff]" />
          </div>
        </div>
      </div>
    );
  }

  // 3. Estado de Erro (Email Mismatch, Revogado, Expirado, Replay)
  if (errorCode || !previewData) {
    const isMismatch = errorCode === 'INVITATION_EMAIL_MISMATCH';

    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xl space-y-6">
          <div className="flex justify-center">
            <PrexyonLogo variant="light" className="h-8 w-auto" />
          </div>

          <div className="text-center space-y-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${isMismatch ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
              <ShieldAlert className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-slate-900">
              {isMismatch ? 'E-mail Incompatível com o Convite' : 'Convite Indisponível'}
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              {errorMessage}
            </p>
          </div>

          {isMismatch && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/60 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Destinatário do convite:</span>
                <span className="font-semibold text-slate-900">{invitationEmail}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="font-medium">Conta conectada atualmente:</span>
                <span className="font-semibold text-amber-900">{callerEmail || user?.email}</span>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {isMismatch ? (
              <Button
                variant="primary"
                onClick={handleSwitchAccount}
                className="w-full bg-[#0066ff] hover:bg-[#0052cc] py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Fazer login com a conta correta
              </Button>
            ) : errorCode === 'INVITATION_ALREADY_USED' ? (
              <Button
                variant="primary"
                onClick={onAccepted}
                className="w-full bg-[#0066ff] hover:bg-[#0052cc] py-2.5 text-xs font-semibold rounded-xl"
              >
                Ir para o Portal
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={onCancel}
                className="w-full py-2.5 text-xs font-medium rounded-xl"
              >
                Voltar ao Início
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. Tela Oficial de Aceite do Convite
  const permsList = previewData.permissions?.orcagraf || [];

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <PrexyonLogo variant="light" className="h-8 w-auto" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0066ff] text-[11px] font-semibold tracking-wide uppercase">
            <UserCheck className="w-3.5 h-3.5" />
            Convite para Membro
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Participe de {previewData.organization_name}
          </h2>
          <p className="text-xs text-slate-500 max-w-sm">
            Você foi convidado como membro com acesso definido aos softwares abaixo.
          </p>
        </div>

        {/* Error alert se falhar no clique */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Card de Detalhes da Organização e Acesso */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200/60">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Organização</div>
              <div className="text-sm font-bold text-slate-900">{previewData.organization_name}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-slate-500 font-medium">Papel</div>
              <div className="font-semibold text-slate-900 capitalize">{previewData.role === 'member' ? 'Membro' : previewData.role}</div>
            </div>
            <div>
              <div className="text-slate-500 font-medium">E-mail Convidado</div>
              <div className="font-semibold text-slate-900 truncate" title={previewData.email}>{previewData.email}</div>
            </div>
          </div>

          {/* Softwares Autorizados */}
          <div className="pt-2 border-t border-slate-200/60 space-y-2">
            <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-slate-500" />
              Software Autorizado
            </div>
            <div className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-xl">
              <img src={orcagrafSymbol} alt="OrçaGraf" className="w-6 h-6 object-contain" />
              <div>
                <div className="text-xs font-bold text-slate-900">OrçaGraf</div>
                <div className="text-[11px] text-slate-500">Orçamentos e Produção Gráfica</div>
              </div>
            </div>
          </div>

          {/* Permissões Granulares */}
          {permsList.length > 0 && (
            <div className="pt-2 border-t border-slate-200/60 space-y-2">
              <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                Permissões de Acesso ({permsList.length})
              </div>
              <div className="space-y-1.5">
                {permsList.map((permKey) => (
                  <div key={permKey} className="flex items-center gap-2 text-xs text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{PERM_LABELS[permKey] || permKey}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="space-y-3 pt-2">
          <Button
            variant="primary"
            size="lg"
            isLoading={isAccepting}
            onClick={handleAccept}
            className="w-full bg-[#0066ff] hover:bg-[#0052cc] py-3 text-sm font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            <UserCheck className="w-4 h-4" />
            Aceitar Convite e Acessar
          </Button>

          <button
            type="button"
            onClick={onCancel}
            disabled={isAccepting}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-700 transition-colors py-1"
          >
            Decidir mais tarde
          </button>
        </div>
      </div>
    </div>
  );
};
