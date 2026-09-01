import React from 'react';
import prexyonSymbol from '../../assets/branding/prexyon-symbol-circle.png';
import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';
import arteflowSymbol from '../../assets/branding/arteflow-symbol.png';
import artecheckSymbol from '../../assets/branding/artecheck-symbol.png';

export const LoginBrandHero: React.FC = () => {
  return (
    <div className="relative flex flex-col justify-between h-full p-8 sm:p-12 lg:p-16 bg-[#061126] text-white overflow-hidden select-none">
      {/* Background Subtle Tech / Connection Mesh Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 30%, rgba(0, 136, 255, 0.25) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(124, 58, 237, 0.15) 0%, transparent 50%),
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 48px 48px, 48px 48px'
        }}
      />

      {/* Decorative Network Nodes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-25" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="meshGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0088ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0088ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Subtle Constellation Lines */}
        <line x1="85%" y1="15%" x2="70%" y2="45%" stroke="rgba(56, 169, 247, 0.2)" strokeWidth="1" />
        <line x1="70%" y1="45%" x2="90%" y2="60%" stroke="rgba(56, 169, 247, 0.15)" strokeWidth="1" />
        <line x1="70%" y1="45%" x2="60%" y2="80%" stroke="rgba(56, 169, 247, 0.15)" strokeWidth="1" />
        <line x1="90%" y1="60%" x2="80%" y2="90%" stroke="rgba(56, 169, 247, 0.2)" strokeWidth="1" />
        <circle cx="85%" cy="15%" r="3" fill="#38a9f7" opacity="0.6" />
        <circle cx="70%" cy="45%" r="4" fill="#0088ff" opacity="0.8" />
        <circle cx="90%" cy="60%" r="3" fill="#38a9f7" opacity="0.6" />
        <circle cx="60%" cy="80%" r="3" fill="#38a9f7" opacity="0.5" />
        <circle cx="80%" cy="90%" r="4" fill="#0088ff" opacity="0.7" />
      </svg>

      {/* Header with Prexyon Logo */}
      <div className="relative z-10">
        <div className="flex items-center space-x-3">
          <img
            src={prexyonSymbol}
            alt="Prexyon"
            className="w-10 h-10 object-contain drop-shadow-md"
          />
          <span className="text-2xl font-bold tracking-tight text-white font-sans">
            prexyon
          </span>
        </div>
      </div>

      {/* Hero Headline & Value Proposition */}
      <div className="relative z-10 my-auto py-12">
        <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.12] text-white">
          Sua empresa.<br />
          Seus processos.<br />
          <span className="text-[#0088ff] bg-gradient-to-r from-[#0088ff] to-[#38bdf8] bg-clip-text text-transparent">
            Em um só lugar.
          </span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-lg font-normal">
          O ecossistema Prexyon integra soluções inteligentes para impulsionar seus resultados com eficiência, colaboração e controle.
        </p>
      </div>

      {/* Official Product Badges at Bottom */}
      <div className="relative z-10 pt-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {/* OrçaGraf Badge */}
          <div className="flex items-center space-x-2.5 px-3.5 py-2 rounded-xl bg-slate-900/70 border border-emerald-500/30 backdrop-blur-md transition-all hover:border-emerald-500/60 hover:bg-slate-900/90">
            <img
              src={orcagrafSymbol}
              alt="OrçaGraf"
              className="w-6 h-6 object-contain"
            />
            <span className="text-sm font-semibold text-white tracking-wide">OrçaGraf</span>
          </div>

          {/* ArteFlow Badge */}
          <div className="flex items-center space-x-2.5 px-3.5 py-2 rounded-xl bg-slate-900/70 border border-sky-500/30 backdrop-blur-md transition-all hover:border-sky-500/60 hover:bg-slate-900/90">
            <img
              src={arteflowSymbol}
              alt="ArteFlow"
              className="w-6 h-6 object-contain"
            />
            <span className="text-sm font-semibold text-white tracking-wide">ArteFlow</span>
          </div>

          {/* ArteCheck Badge */}
          <div className="flex items-center space-x-2.5 px-3.5 py-2 rounded-xl bg-slate-900/70 border border-purple-500/30 backdrop-blur-md transition-all hover:border-purple-500/60 hover:bg-slate-900/90">
            <img
              src={artecheckSymbol}
              alt="ArteCheck"
              className="w-6 h-6 object-contain"
            />
            <span className="text-sm font-semibold text-white tracking-wide">ArteCheck</span>
          </div>
        </div>
      </div>
    </div>
  );
};
