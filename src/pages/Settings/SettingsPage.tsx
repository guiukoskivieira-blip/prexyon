import React, { useState } from 'react';
import { ArrowLeft, Bell, Lock, Key, Check } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface SettingsPageProps {
  onBack: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword === confirmPassword) {
      setSavedSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Header */}
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
            Configurações & Segurança
          </h1>
          <p className="text-sm text-slate-500">
            Preferências de segurança da conta, autenticação em duas etapas e notificações.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Security Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Password Update Card */}
          <div className="bg-white rounded-3xl border border-[#e2e8f0] p-6 sm:p-8 shadow-sm">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100 mb-6">
              <div className="p-2 rounded-xl bg-blue-50 text-[#0066ff]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Alterar Senha de Acesso</h2>
                <p className="text-xs text-slate-500">Mantenha sua senha forte com letras, números e símbolos</p>
              </div>
            </div>

            {savedSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4" /> Senha atualizada com sucesso!
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <Input
                label="Senha Atual"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nova Senha"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
                <Input
                  label="Confirmar Nova Senha"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary">
                  Atualizar Senha
                </Button>
              </div>
            </form>
          </div>

          {/* Two-Factor Authentication Card */}
          <div className="bg-white rounded-3xl border border-[#e2e8f0] p-6 sm:p-8 shadow-sm">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100 mb-4">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Autenticação de Dois Fatores (2FA)</h2>
                <p className="text-xs text-slate-500">Camada adicional de proteção para todos os softwares Prexyon</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-semibold text-slate-800 block">Exigir 2FA no login</span>
                <span className="text-xs text-slate-500">Códigos temporários via app autenticador (Google Authenticator, Authy)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={twoFactorEnabled}
                  onChange={(e) => setTwoFactorEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0066ff]"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Col: Notification Preferences */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-[#e2e8f0] p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Notificações</h3>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" defaultChecked className="mt-0.5 rounded text-[#0066ff]" />
                <span>Avisos de renovação de fatura por e-mail</span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" defaultChecked className="mt-0.5 rounded text-[#0066ff]" />
                <span>Novidades e lançamentos de novos produtos</span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" defaultChecked className="mt-0.5 rounded text-[#0066ff]" />
                <span>Relatórios semanais de uso dos softwares</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
