import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LoginBrandHero } from '../../components/auth/LoginBrandHero';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { signUp, isLoading } = useAuth();
  const navigate = (path: string) => {
    window.location.pathname = path;
  };

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailConfirmationNeeded, setEmailConfirmationNeeded] = useState(false);

  const normalizeEmail = (e: string) => e.trim().toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return; // prevent double submit
    setError(null);
    const normEmail = normalizeEmail(email);
    if (!name.trim()) {
      setError('Por favor, informe seu nome.');
      return;
    }
    if (!normEmail) {
      setError('Por favor, informe seu e‑mail.');
      return;
    }
    if (!password) {
      setError('Por favor, informe sua senha.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Senhas não coincidem.');
      return;
    }
    const result = await signUp({ name: name.trim(), email: normEmail, password });
    if (result.success) {
      if (result.session) {
        // immediate login – redirect to app (onboarding will handle missing org)
        navigate('/app');
      } else {
        // email confirmation flow
        setEmailConfirmationNeeded(true);
        setSuccess(true);
      }
    } else {
      setError(result.error || 'Falha ao criar a conta.');
    }
  };

  if (success && emailConfirmationNeeded) {
    return (
      <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8fafc] text-slate-900 overflow-x-hidden">
        <div className="w-full lg:w-[48%] xl:w-[46%] min-h-[340px] lg:min-h-screen shrink-0">
          <LoginBrandHero />
        </div>
        <div className="w-full lg:w-[52%] xl:w-[54%] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 min-h-[calc(100vh-340px)] lg:min-h-screen bg-[#f8fafc]">
          <div className="w-full max-w-md space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
            <h2 className="text-xl font-semibold text-slate-900">Conta criada</h2>
            <p className="text-sm text-slate-700">Verifique seu e‑mail para confirmar o cadastro.</p>
            <Button variant="primary" onClick={() => navigate('/login')}>Voltar para entrar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg[#f8fafc] text-slate-900 overflow-x-hidden">
      <div className="w-full lg:w-[48%] xl:w-[46%] min-h-[340px] lg:min-h-screen shrink-0">
        <LoginBrandHero />
      </div>
      <div className="w-full lg:w-[52%] xl:w-[54%] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 min-h-[calc(100vh-340px)] lg:min-h-screen bg[#f8fafc]">
        <div className="w-full max-w-md space-y-4">
          <h2 className="text-2xl font-bold text-slate-900 text-center">Criar conta</h2>
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nome"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              leftIcon={<Mail className="w-4 h-4" />}
            />
            <Input
              label="E‑mail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              leftIcon={<Mail className="w-4 h-4" />}
            />
            <Input
              label="Senha"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
            />
            <Input
              label="Confirmar senha"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
            />
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full bg-[#0066ff] hover:bg-[#0052cc] py-3 text-sm font-semibold rounded-xl"
            >
              Criar conta
            </Button>
          </form>
          <div className="mt-4 text-center text-xs">
            Já tem conta?{' '}
            <button type="button" onClick={() => navigate('/login')} className="font-semibold text-[#0066ff] hover:underline">
              Entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
