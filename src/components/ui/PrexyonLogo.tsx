import React from 'react';
import prexyonLogoDarkBg from '../../assets/branding/prexyon-logo-dark.png';
import prexyonLogoLightBg from '../../assets/branding/prexyon-logo-light.png';

export interface PrexyonLogoProps {
  /**
   * 'dark' -> Para fundos escuros (usa a logo branca oficial)
   * 'light' -> Para fundos claros (usa a logo escura oficial)
   */
  variant?: 'light' | 'dark';
  /**
   * Classes Tailwind adicionais (ex: altura h-8, h-10)
   */
  className?: string;
  alt?: string;
}

export const PrexyonLogo: React.FC<PrexyonLogoProps> = ({
  variant = 'light',
  className = 'h-8 sm:h-9 w-auto',
  alt = 'Prexyon',
}) => {
  const logoSrc = variant === 'dark' ? prexyonLogoDarkBg : prexyonLogoLightBg;

  return (
    <img
      src={logoSrc}
      alt={alt}
      className={`object-contain select-none ${className}`}
    />
  );
};
