import React, { useState } from 'react';
import { Building2, User, Mail, Phone, FileText, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PrexyonLogo } from '../../components/ui/PrexyonLogo';
import { Button } from '../../components/ui/Button';

interface OnboardingPageProps {
  onComplete: () => void;
}

export const OnboardingPage: React.FC<OnboardingPageProps> = ({ onComplete }) => {
  const { user, completeOnboarding } = useAuth();

  const [fullName, setFullName] = useState(user?.name && user.name !== user.email?.split('@')[0] ? user.name : '');
  const [tradeName, setTradeName] = useState('');
  const [corporateName, setCorporateName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim()) {
      setErrorMessage('Por favor, informe seu nome completo.');
      return;
    }

    if (!tradeName.trim()) {
      setErrorMessage('Por favor, informe o nome da sua empresa.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await completeOnboarding({
        fullName: fullName.trim(),
        tradeName: tradeName.trim(),
        corporateName: corporateName.trim() || tradeName.trim(),
        document: document.trim() || undefined,
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
      });

      if (res.success) {
        onComplete();
      } else {
        setIsSubmitting(false);
        setErrorMessage(res.error || 'Não foi possível cadastrar a empresa. Verifique os dados e tente novamente.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Ocorreu um erro ao conectar ao servidor.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col justify-between selection:bg-[#0066ff] selection:text-white">
      {/* Top Brand Header */}
      <header className="px-6 py-6 sm:px-12 flex items-center justify-between border-b border-slate-800/80 bg-[#0b1329]/60 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <PrexyonLogo variant="dark" className="h-7 w-auto" />
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Configuração Inicial
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 my-6">
        <div className="w-full max-w-2xl bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-[#0a1936] to-[#0066ff] p-8 sm:p-10 text-white relative overflow-hidden">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur-md border border-white/20 text-blue-200 mb-3">
                <Building2 className="w-3.5 h-3.5" />
                Passo Único
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Vamos configurar sua conta
              </h1>
              <p className="text-sm text-slate-300 mt-2 max-w-xl leading-relaxed">
                Precisamos de algumas informações para preparar seu ambiente Prexyon.
              </p>
            </div>
            {/* Ambient Background Blur */}
            <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-[#0066ff]/20 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8 sm:p-10 space-y-8">
            {errorMessage && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs sm:text-sm text-rose-700 flex items-start gap-3 animate-in fade-in">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{errorMessage}</div>
              </div>
            )}

            {/* SEÇÃO 1: SEUS DADOS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="p-1.5 rounded-lg bg-blue-50 text-[#0066ff]">
                  <User className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Seus Dados Pessoais
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    E-mail de Acesso
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      disabled
                      value={user?.email || ''}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500 cursor-not-allowed"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Vinculado à sua conta de autenticação
                  </span>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: SUA EMPRESA */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="p-1.5 rounded-lg bg-blue-50 text-[#0066ff]">
                  <Building2 className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Sua Empresa / Gráfica
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nome da Empresa / Nome Fantasia <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Gráfica Rápida Express"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Razão Social <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ex: Express Gráfica e Editora LTDA"
                      value={corporateName}
                      onChange={(e) => setCorporateName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                    />
                    <FileText className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    CNPJ <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Telefone / WhatsApp <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Cidade <span className="text-slate-400 font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: São Paulo"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      UF
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="SP"
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 placeholder:text-slate-400 text-center uppercase focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-slate-500 text-center sm:text-left">
                Ao criar sua empresa, você terá acesso imediato ao Portal Prexyon.
              </span>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-8 py-3 bg-[#0066ff] hover:bg-[#0052cc] text-white font-bold rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Criando sua empresa...</span>
                  </>
                ) : (
                  <>
                    <span>Criar minha empresa</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Prexyon. Todos os direitos reservados.
      </footer>
    </div>
  );
};
