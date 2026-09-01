import React, { useState } from 'react';
import { ArrowLeft, User, Building2, Mail, Save, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface ProfilePageProps {
  onBack: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ onBack }) => {
  const { user, organization, updateUserProfile, setOrganizationName } = useAuth();
  const [userName, setUserName] = useState(user?.name || 'Guilherme Vieira');
  const [userEmail] = useState(user?.email || 'gui@exemplo.com');
  const [orgName, setOrgName] = useState(organization.name);
  const [orgDoc, setOrgDoc] = useState(organization.document || '12.345.678/0001-90');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const pRes = await updateUserProfile(userName);
      const oRes = await setOrganizationName(orgName);

      setIsSaving(false);

      if (!pRes.success || !oRes.success) {
        setErrorMessage(pRes.error || oRes.error || 'Erro ao salvar alterações.');
        return;
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      setIsSaving(false);
      setErrorMessage(err.message || 'Erro ao conectar ao servidor.');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
            aria-label="Voltar para Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Perfil & Organização
            </h1>
            <p className="text-sm text-slate-500">
              Dados do titular da assinatura e informações cadastrais da conta Prexyon.
            </p>
          </div>
        </div>

        {savedSuccess && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Informações atualizadas com sucesso!
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: User Profile Card */}
        <div className="bg-white rounded-3xl border border-[#e2e8f0] p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
            <div className="p-2 rounded-xl bg-blue-50 text-[#0066ff]">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Dados Pessoais do Assinante</h2>
              <p className="text-xs text-slate-500">Identificação e login de acesso ao Portal</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xl flex items-center justify-center shrink-0 shadow-2xs">
              {user?.initials || 'GS'}
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-xs font-semibold text-[#0066ff] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                {user?.role === 'owner' ? 'Proprietário da Conta' : 'Membro Autorizado'}
              </span>
              <p className="text-xs text-slate-500 pt-1">
                Nome exibido no cabeçalho e nas assinaturas dos relatórios operacionais.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nome Completo"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
            <Input
              label="E-mail de Acesso"
              value={userEmail}
              disabled
              helperText="O e-mail principal é gerenciado pelo painel de segurança."
              type="email"
              leftIcon={<Mail className="w-4 h-4" />}
            />
          </div>
        </div>

        {/* Section 2: Organization / Account Card */}
        <div className="bg-white rounded-3xl border border-[#e2e8f0] p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
            <div className="p-2 rounded-xl bg-blue-50 text-[#0066ff]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Organização & Empresa</h2>
              <p className="text-xs text-slate-500">Dados corporativos da conta Prexyon</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nome da Organização / Empresa"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
            <Input
              label="CNPJ / Documento Fiscal"
              value={orgDoc}
              onChange={(e) => setOrgDoc(e.target.value)}
            />
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            isLoading={isSaving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Salvar Dados
          </Button>
        </div>
      </form>
    </div>
  );
};
