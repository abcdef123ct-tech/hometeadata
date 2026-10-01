import React, { useState, useEffect, useRef } from "react";
import { Maximize2, Minimize2, Smartphone, Monitor } from "lucide-react";

export type ImageFitMode = "contain" | "cover" | "auto";

interface SmartImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  defaultFit?: ImageFitMode;
  showFitToggle?: boolean;
  showOrientationBadge?: boolean;
  fallbackSrc?: string;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

const DEFAULT_FALLBACK = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format&fit=crop&q=80";

export default function SmartImage({
  src,
  alt = "Hình ảnh bất động sản",
  className = "",
  imgClassName = "",
  defaultFit = "auto",
  showFitToggle = true,
  showOrientationBadge = false,
  fallbackSrc = DEFAULT_FALLBACK,
  onClick,
  children,
}: SmartImageProps) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [manualFit, setManualFit] = useState<"contain" | "cover" | null>(null);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const cleanSrc = (src && typeof src === "string" && src.trim().length > 0) ? src.trim() : fallbackSrc;
  const currentSrc = hasError ? fallbackSrc : cleanSrc;

  // Check if image is already loaded from browser cache
  useEffect(() => {
    setHasError(false);
    const node = imgRef.current;
    if (node && node.complete && node.naturalWidth > 0 && node.naturalHeight > 0) {
      setNaturalSize((prev) => {
        if (prev && prev.width === node.naturalWidth && prev.height === node.naturalHeight) {
          return prev;
        }
        return { width: node.naturalWidth, height: node.naturalHeight };
      });
    }
  }, [currentSrc]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setNaturalSize((prev) => {
        if (prev && prev.width === img.naturalWidth && prev.height === img.naturalHeight) {
          return prev;
        }
        return {
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
      });
    }
    setHasError(false);
  };

  const handleImageError = () => {
    if (!hasError) {
      setHasError(true);
    }
  };

  const isPortrait = naturalSize ? naturalSize.height > naturalSize.width : false;

  // Effective fit: If user manually toggled, respect it.
  // Otherwise if "auto": portrait photos default to "contain" so the facade/house is not cropped.
  // Horizontal photos default to "cover" to fill the card neatly.
  const effectiveFit = manualFit || (defaultFit === "auto" ? (isPortrait ? "contain" : "cover") : defaultFit);

  const toggleFit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setManualFit((prev) => {
      const current = prev || effectiveFit;
      return current === "contain" ? "cover" : "contain";
    });
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none group/smart-img bg-slate-950 ${className}`}
      onClick={onClick}
    >
      {/* 1. Ambient Blurred Backdrop for Portrait or Letterbox images */}
      {effectiveFit === "contain" && (
        <img
          src={currentSrc}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-35 dark:opacity-45 brightness-90 saturate-125 pointer-events-none transition-opacity duration-300"
        />
      )}

      {/* Subtle vignette gradient for contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/15 pointer-events-none z-[1]" />

      {/* 2. Main Foreground Photo - always visible (no opacity-0) */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={handleImageLoad}
        onError={handleImageError}
        className={`relative z-[2] w-full h-full transition-all duration-200 ${
          effectiveFit === "cover" ? "object-cover group-hover/smart-img:scale-102" : "object-contain drop-shadow-md"
        } ${imgClassName}`}
      />

      {/* Top Floating Controls Bar */}
      <div className="absolute top-2 left-2 right-2 z-[5] flex items-center justify-between gap-1.5 pointer-events-none">
        
        {/* Left: Orientation Badge (Dọc / Ngang) */}
        {showOrientationBadge && naturalSize ? (
          <div className="pointer-events-auto px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-md border border-white/20 text-white text-[10px] font-medium flex items-center gap-1 shadow-sm">
            {isPortrait ? (
              <>
                <Smartphone className="w-3 h-3 text-amber-400" />
                <span>Ảnh dọc</span>
              </>
            ) : (
              <>
                <Monitor className="w-3 h-3 text-sky-400" />
                <span>Ảnh ngang</span>
              </>
            )}
            <span className="opacity-70 text-[9px] font-mono ml-0.5">
              {Math.round(naturalSize.width)}x{Math.round(naturalSize.height)}
            </span>
          </div>
        ) : <div />}

        {/* Right: Quick Fit Mode Switcher (Lấp đầy vs Xem trọn ảnh) */}
        {showFitToggle && (
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={toggleFit}
              className="px-2 py-1 rounded-lg bg-black/65 hover:bg-black/85 text-white backdrop-blur-md border border-white/20 text-[10px] font-medium shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1 opacity-90 hover:opacity-100"
              title={
                effectiveFit === "contain"
                  ? "Đang xem trọn vẹn (không cắt ảnh). Nhấn để chuyển sang Lấp đầy khung"
                  : "Đang lấp đầy khung. Nhấn để xem trọn vẹn toàn bộ ảnh"
              }
            >
              {effectiveFit === "contain" ? (
                <>
                  <Maximize2 className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">Lấp đầy</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3 h-3 text-sky-400" />
                  <span className="hidden sm:inline">Trọn ảnh</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Subtle indicator for portrait images when viewed in contain mode */}
      {isPortrait && effectiveFit === "contain" && (
        <div className="absolute bottom-2 left-2 z-[3] pointer-events-none opacity-85 sm:opacity-0 sm:group-hover/smart-img:opacity-100 transition-opacity">
          <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[9px] text-amber-300 font-medium border border-amber-400/20 shadow-xs flex items-center gap-1">
            <Smartphone className="w-2.5 h-2.5 text-amber-400" />
            <span>Ảnh dọc trọn vẹn</span>
          </span>
        </div>
      )}

      {/* Any child elements (sliders, custom tags, custom buttons) */}
      {children}
    </div>
  );
}

