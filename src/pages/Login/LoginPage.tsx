import React, { useState } from 'react';
import { LoginBrandHero } from '../../components/auth/LoginBrandHero';
import { LoginForm } from '../../components/auth/LoginForm';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Mail, CheckCircle2, MessageSquare, ExternalLink, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { resetPassword } = useAuth();
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySubmitted, setRecoverySubmitted] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    if (!recoveryEmail) return;

    setIsRecovering(true);
    const res = await resetPassword(recoveryEmail);
    setIsRecovering(false);

    if (res.success) {
      setRecoverySubmitted(true);
    } else {
      setRecoveryError(res.error || 'Não foi possível enviar o e-mail de recuperação.');
    }
  };

  const resetRecoveryModal = () => {
    setIsForgotModalOpen(false);
    setRecoverySubmitted(false);
    setRecoveryEmail('');
    setRecoveryError(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8fafc] text-slate-900 overflow-x-hidden">
      {/* Left Column: Brand Hero (48% on desktop) */}
      <div className="w-full lg:w-[48%] xl:w-[46%] min-h-[340px] lg:min-h-screen shrink-0">
        <LoginBrandHero />
      </div>

      {/* Right Column: Authentication Card (52% on desktop) */}
      <div className="w-full lg:w-[52%] xl:w-[54%] flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 min-h-[calc(100vh-340px)] lg:min-h-screen bg-[#f8fafc]">
        <div className="w-full max-w-md">
          <LoginForm
            onSuccess={onLoginSuccess}
            onForgotPasswordClick={() => setIsForgotModalOpen(true)}
            onContactClick={() => setIsContactModalOpen(true)}
          />
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={resetRecoveryModal}
        title="Recuperar Senha de Acesso"
        maxWidth="md"
      >
        {recoverySubmitted ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">E-mail de recuperação enviado!</h4>
            <p className="text-sm text-slate-600">
              Se houver uma conta associada a <strong>{recoveryEmail}</strong>, enviamos um link seguro com instruções para redefinir sua senha.
            </p>
            <div className="pt-3">
              <Button
                variant="primary"
                onClick={resetRecoveryModal}
                className="w-full"
              >
                Voltar para o Login
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePasswordRecovery} className="space-y-4">
            <p className="text-sm text-slate-600">
              Informe o e-mail cadastrado na sua conta Prexyon para receber as instruções de redefinição de senha via Supabase Auth.
            </p>

            {recoveryError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{recoveryError}</span>
              </div>
            )}

            <Input
              label="E-mail cadastrado"
              type="email"
              required
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="seu@email.com"
              leftIcon={<Mail className="w-4 h-4" />}
            />
            <div className="flex justify-end gap-3 pt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={resetRecoveryModal}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isRecovering}
              >
                Enviar link
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Contact / New Account Modal */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title="Falar com a Prexyon"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Deseja contratar o ecossistema Prexyon para sua empresa ou conhecer demonstrações de <strong>OrçaGraf</strong>, <strong>ArteFlow</strong> e <strong>ArteCheck</strong>?
          </p>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#0066ff]" />
              <span>Atendimento comercial e consultores dedicados</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#0066ff]" />
              <span>contato@prexyon.com</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsContactModalOpen(false)}
            >
              Fechar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => window.open('https://wa.me/5500000000000', '_blank')}
              rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Falar com consultor
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
