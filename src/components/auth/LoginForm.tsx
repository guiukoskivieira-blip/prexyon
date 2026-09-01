import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import prexyonSymbol from '../../assets/branding/prexyon-symbol-circle.png';

interface LoginFormProps {
  onSuccess?: () => void;
  onForgotPasswordClick?: () => void;
  onContactClick?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onForgotPasswordClick,
  onContactClick
}) => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('gui@exemplo.com');
  const [password, setPassword] = useState('••••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socialAuthNotice, setSocialAuthNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSocialAuthNotice(null);

    if (!email.trim()) {
      setErrorMessage('Por favor, digite seu e-mail cadastrado.');
      return;
    }

    const result = await login({ email, password, rememberMe });
    if (result.success) {
      if (onSuccess) onSuccess();
    } else {
      setErrorMessage(result.error || 'Erro ao autenticar. Verifique suas credenciais.');
    }
  };

  const handleGoogleLogin = () => {
    setSocialAuthNotice('A autenticação com Google está preparada na arquitetura e será ativada com as chaves OAuth do Supabase/Google Cloud na Etapa 2.');
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      {/* Main Authentication Card */}
      <div className="w-full bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100/80">
        {/* Header with Prexyon Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center space-x-2.5 mb-5">
            <img
              src={prexyonSymbol}
              alt="Prexyon"
              className="w-9 h-9 object-contain"
            />
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              prexyon
            </span>
          </div>

          <h2 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight">
            Acesse sua conta
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 font-normal">
            Entre para continuar no ecossistema Prexyon.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Social Auth Notice */}
        {socialAuthNotice && (
          <div className="mt-5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
            <span>{socialAuthNotice}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Email Input */}
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              E-mail
            </label>
            <div className="relative rounded-xl">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="block w-full pl-10 pr-3.5 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <div className="relative rounded-xl">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="block w-full pl-10 pr-11 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember me & Forgot password */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-[#0066ff] border-slate-300 focus:ring-[#0066ff] focus:ring-offset-0 transition-colors"
              />
              <span className="text-xs text-slate-600 font-medium">Manter conectado</span>
            </label>

            <button
              type="button"
              onClick={onForgotPasswordClick}
              className="text-xs font-semibold text-[#0066ff] hover:text-[#0052cc] hover:underline transition-colors focus:outline-none"
            >
              Esqueci minha senha
            </button>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full bg-[#0066ff] hover:bg-[#0052cc] py-3 text-sm font-semibold rounded-xl shadow-[0_4px_12px_rgba(0,102,255,0.25)] transition-all"
            >
              Entrar
            </Button>
          </div>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-400 font-medium">ou</span>
            </div>
          </div>

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center space-x-3 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-xl transition-all shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continuar com Google</span>
          </button>
        </form>

        {/* Register / Contact Link */}
        <div className="mt-6 text-center text-xs text-slate-500">
          Ainda não tem uma conta?{' '}
          <button
            type="button"
            onClick={onContactClick}
            className="font-semibold text-[#0066ff] hover:text-[#0052cc] hover:underline focus:outline-none"
          >
            Fale com a Prexyon
          </button>
        </div>
      </div>

      {/* Bottom Security Badge */}
      <div className="mt-6 flex items-center space-x-2 text-xs text-slate-500 bg-white/70 px-4 py-2 rounded-full border border-slate-200/60 shadow-2xs backdrop-blur-xs">
        <div className="p-1 rounded-full bg-blue-50 text-[#0066ff]">
          <ShieldCheck className="w-3.5 h-3.5" />
        </div>
        <span className="font-medium">Acesso seguro para sua empresa</span>
      </div>
    </div>
  );
};
