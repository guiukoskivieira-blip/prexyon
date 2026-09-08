import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LoginBrandHero } from '../../components/auth/LoginBrandHero';
import { Button } from '../../components/ui/Button';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * PasswordRecoveryPage
 *
 * Rendered ONLY when AuthContext.isPasswordRecovery === true,
 * meaning Supabase fired a real PASSWORD_RECOVERY event.
 * A query param alone (?recovery=true) is NOT sufficient to reach this page.
 *
 * Flow:
 *   Supabase link → PASSWORD_RECOVERY event → this UI
 *   → user sets new password → supabase.auth.updateUser({ password })
 *   → success → signOut → redirect to /login
 */
export const PasswordRecoveryPage: React.FC = () => {
  const { updatePassword, logout } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const navigateToLogin = () => {
    window.location.replace('/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // prevent double submission
    setError(null);

    if (!newPassword) {
      setError('Por favor, informe a nova senha.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    const result = await updatePassword(newPassword);
    setIsSubmitting(false);

    if (result.success) {
      setSuccess(true);
      // Sign out after successful password update to force a clean login
      // with the new credentials, avoiding ambiguous session state.
      try {
        await logout();
      } catch {
        // logout failure is non-critical here — user will be redirected anyway
      }
    } else {
      setError(result.error || 'Não foi possível atualizar a senha. Tente novamente.');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8fafc] text-slate-900 overflow-x-hidden">
        <div className="w-full lg:w-[48%] xl:w-[46%] min-h-[340px] lg:min-h-screen shrink-0">
          <LoginBrandHero />
        </div>
        <div className="w-full lg:w-[52%] xl:w-[54%] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 min-h-[calc(100vh-340px)] lg:min-h-screen bg-[#f8fafc]">
          <div className="w-full max-w-md space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
            <h2 className="text-xl font-semibold text-slate-900">Senha alterada com sucesso</h2>
            <p className="text-sm text-slate-600">
              Sua senha foi atualizada. Entre com sua nova senha para acessar o Portal.
            </p>
            <Button variant="primary" onClick={navigateToLogin} className="w-full mt-2">
              Entrar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8fafc] text-slate-900 overflow-x-hidden">
      <div className="w-full lg:w-[48%] xl:w-[46%] min-h-[340px] lg:min-h-screen shrink-0">
        <LoginBrandHero />
      </div>
      <div className="w-full lg:w-[52%] xl:w-[54%] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 min-h-[calc(100vh-340px)] lg:min-h-screen bg-[#f8fafc]">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-4">
              <Lock className="w-6 h-6 text-[#0066ff]" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Definir nova senha</h2>
            <p className="text-sm text-slate-500 mt-1">Escolha uma senha forte para a sua conta.</p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nova Senha
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3.5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Confirmar Nova Senha
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3.5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                className="w-full bg-[#0066ff] hover:bg-[#0052cc] py-3 text-sm font-semibold rounded-xl"
              >
                Definir nova senha
              </Button>
            </div>
          </form>

          <div className="mt-4 text-center text-xs">
            <button
              type="button"
              onClick={navigateToLogin}
              className="text-slate-400 hover:text-slate-600 underline"
            >
              Voltar para o login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
