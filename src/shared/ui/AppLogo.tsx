import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: number | string;
  alt?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ 
  className = "w-full h-full object-contain", 
  size, 
  alt = "GC Hub Logo" 
}) => {
  const style: React.CSSProperties = size ? { width: size, height: size } : {};

  return (
    <img
      src="./logo/GC_Master_Logo_Clean.svg"
      alt={alt}
      className={className}
      style={style}
      onError={(e) => {
        // Fallback to relative png if svg path is unavailable
        const target = e.target as HTMLImageElement;
        if (!target.dataset.triedFallback) {
          target.dataset.triedFallback = 'true';
          target.src = './logo/gc_logo_extracted.png';
        }
      }}
    />
  );
};
