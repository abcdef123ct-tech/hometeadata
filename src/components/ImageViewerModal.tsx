import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  Smartphone,
  Monitor,
  StretchHorizontal,
  StretchVertical,
} from "lucide-react";

interface ImageViewerModalProps {
  isOpen: boolean;
  images: string[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}

export default function ImageViewerModal({
  isOpen,
  images,
  initialIndex = 0,
  title,
  onClose,
}: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; isPortrait: boolean } | null>(null);
  const [fitMode, setFitMode] = useState<"contain" | "width" | "height">("contain");

  // Touch gesture refs
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync index when initialIndex or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)));
      setImageMeta(null);
      resetTransform();
    }
  }, [isOpen, initialIndex, images.length]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  // Zoom controls
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev * 1.3, 5));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = prev / 1.3;
      if (next <= 1.05) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return next;
    });
  };

  const handleResetZoom = () => {
    resetTransform();
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Image Navigation
  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setImageMeta(null);
    resetTransform();
  }, [images.length, resetTransform]);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setImageMeta(null);
    resetTransform();
  }, [images.length, resetTransform]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          handlePrev();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
        case "_":
          handleZoomOut();
          break;
        case "0":
        case "r":
        case "R":
          resetTransform();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose, resetTransform]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev * 1.15, 5));
    } else {
      setScale((prev) => {
        const next = prev / 1.15;
        if (next <= 1.05) {
          setPosition({ x: 0, y: 0 });
          return 1;
        }
        return next;
      });
    }
  };

  // Mouse drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Double click to toggle zoom
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale > 1) {
      resetTransform();
    } else {
      setScale(2.5);
      // Zoom centered towards click
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = (rect.width / 2 - (e.clientX - rect.left)) * 1.5;
      const offsetY = (rect.height / 2 - (e.clientY - rect.top)) * 1.5;
      setPosition({ x: offsetX, y: offsetY });
    }
  };

  // Mobile Touch Handling (Pinch-to-zoom & pan & swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch gesture start
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      // Pinching
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchDistanceRef.current;
      setScale((prev) => Math.min(Math.max(1, prev * factor), 5));
      touchDistanceRef.current = dist;
    } else if (e.touches.length === 1 && scale > 1 && isDragging) {
      // Pan
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchDistanceRef.current = null;
    setIsDragging(false);

    // Swipe left / right if scale is 1
    if (scale === 1 && e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;
      const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
      if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 60) {
        if (deltaX > 0) {
          handlePrev();
        } else {
          handleNext();
        }
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!currentImageUrl) return;
    try {
      setDownloading(true);
      const response = await fetch(currentImageUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const safeTitle = title
        ? title.trim().toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u1EA0-\u1EF9]+/gi, "_")
        : "bat-dong-san";
      link.download = `${safeTitle}_anh_${currentIndex + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
    } catch (e) {
      // If direct blob download is restricted by CORS, fallback to browser direct download link
      const link = document.createElement("a");
      link.href = currentImageUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = `anh_${currentIndex + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen || images.length === 0) return null;

  const currentImageUrl = images[currentIndex];
  const zoomPercent = Math.round(scale * 100);

  return (
    <div
      ref={containerRef}
      id="image-viewer-modal"
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between select-none overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Header Controls Bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3.5 bg-black/50 border-b border-white/10 z-20 text-white min-w-0">
        
        {/* Title, Counter & Orientation badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
          <div className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-mono font-bold shrink-0">
            {currentIndex + 1} / {images.length}
          </div>
          {title && (
            <span className="text-xs sm:text-sm font-semibold truncate text-slate-200 hidden xs:inline max-w-[200px] sm:max-w-xs">
              {title}
            </span>
          )}

          {/* Orientation & Resolution Badge */}
          {imageMeta && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-mono text-slate-200 shrink-0">
              {imageMeta.isPortrait ? (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ảnh dọc ({imageMeta.width}×{imageMeta.height})</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3.5 h-3.5 text-sky-400" />
                  <span>Ảnh ngang ({imageMeta.width}×{imageMeta.height})</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          
          {/* Fit Mode Switcher (Contain / Width / Height) */}
          <button
            onClick={() => {
              setFitMode((prev) => {
                if (prev === "contain") return "width";
                if (prev === "width") return "height";
                return "contain";
              });
              resetTransform();
            }}
            id="btn-viewer-fit-mode"
            className={`px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
              fitMode !== "contain"
                ? "bg-amber-500/25 border-amber-400/50 text-amber-300"
                : "bg-white/10 border-white/15 hover:bg-white/20 text-white"
            }`}
            title={
              fitMode === "contain"
                ? "Chế độ hiển thị: Vừa màn hình (Nhấp để chuyển xem vừa ngang)"
                : fitMode === "width"
                ? "Chế độ hiển thị: Vừa chiều ngang (Nhấp để chuyển xem vừa dọc)"
                : "Chế độ hiển thị: Vừa chiều dọc (Nhấp để chuyển xem vừa màn hình)"
            }
          >
            {fitMode === "contain" && <Maximize2 className="w-3.5 h-3.5 text-slate-200" />}
            {fitMode === "width" && <StretchHorizontal className="w-3.5 h-3.5 text-amber-400" />}
            {fitMode === "height" && <StretchVertical className="w-3.5 h-3.5 text-amber-400" />}
            <span className="hidden md:inline text-[11px]">
              {fitMode === "contain" ? "Vừa khung" : fitMode === "width" ? "Khớp ngang" : "Khớp dọc"}
            </span>
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            disabled={scale <= 1}
            id="btn-viewer-zoom-out"
            className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer text-white"
            title="Thu nhỏ (-)"
          >
            <ZoomOut className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {/* Zoom Percent / Reset */}
          <button
            onClick={handleResetZoom}
            id="btn-viewer-zoom-reset"
            className="px-2 sm:px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] sm:text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 text-amber-400"
            title="Đặt lại kích thước chuẩn (0 hoặc R)"
          >
            <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>{zoomPercent}%</span>
          </button>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            disabled={scale >= 5}
            id="btn-viewer-zoom-in"
            className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer text-white"
            title="Phóng to (+)"
          >
            <ZoomIn className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {/* Rotate 90deg (available on all devices) */}
          <button
            onClick={handleRotate}
            id="btn-viewer-rotate"
            className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all cursor-pointer text-white flex"
            title="Xoay ảnh 90°"
          >
            <RotateCw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {/* Fullscreen browser toggle */}
          <button
            onClick={toggleFullscreen}
            id="btn-viewer-fullscreen"
            className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all cursor-pointer text-white hidden sm:flex"
            title="Toàn màn hình"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            ) : (
              <Maximize2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            )}
          </button>

          {/* Download image button */}
          <button
            onClick={handleDownloadImage}
            disabled={downloading}
            id="btn-viewer-download"
            className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-white cursor-pointer disabled:opacity-50 flex items-center justify-center"
            title="Tải ảnh về máy"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 animate-spin text-amber-400" />
            ) : (
              <Download className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-amber-400" />
            )}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            id="btn-viewer-close"
            className="p-1.5 sm:p-2 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white transition-all cursor-pointer ml-1"
            title="Đóng xem ảnh (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Image Stage */}
      <div
        className={`relative flex-1 flex items-center justify-center overflow-hidden touch-none ${
          scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Ambient Blurred Backdrop for theater-grade depth */}
        <img
          src={currentImageUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover blur-3xl scale-125 opacity-25 pointer-events-none select-none transition-all duration-500"
        />

        <div
          className="relative transition-transform duration-100 ease-out inline-block max-w-full max-h-full z-10"
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
          }}
        >
          <img
            src={currentImageUrl}
            alt={`Ảnh ${currentIndex + 1}`}
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const isPort = h > w;
                setImageMeta((prev) => {
                  if (prev && prev.width === w && prev.height === h && prev.isPortrait === isPort) {
                    return prev;
                  }
                  return { width: w, height: h, isPortrait: isPort };
                });
              }
            }}
            className={`pointer-events-none rounded-lg shadow-2xl transition-all duration-200 ${
              fitMode === "contain"
                ? "max-h-[75vh] sm:max-h-[82vh] max-w-[95vw] w-auto h-auto object-contain"
                : fitMode === "width"
                ? "w-[94vw] max-h-[85vh] h-auto object-contain"
                : "h-[82vh] max-w-[95vw] w-auto object-contain"
            }`}
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://images.unsplash.com/photo-1594322436404-5a0526db4d13?w=1200&auto=format&fit=crop&q=80";
            }}
          />
        </div>

        {/* Left Navigation Chevron */}
        {images.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            id="btn-viewer-prev"
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-2.5 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/15 transition-all shadow-xl hover:scale-110 active:scale-95 cursor-pointer z-10"
            title="Ảnh trước (Mũi tên trái)"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Right Navigation Chevron */}
        {images.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            id="btn-viewer-next"
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-2.5 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/15 transition-all shadow-xl hover:scale-110 active:scale-95 cursor-pointer z-10"
            title="Ảnh sau (Mũi tên phải)"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}

        {/* Quick hint on mobile & desktop */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 border border-white/10 text-[11px] text-slate-300 font-medium pointer-events-none opacity-80 sm:opacity-90">
          {scale > 1
            ? "Kéo để di chuyển • Nhấp đúp để đặt lại"
            : "Cuộn chuột hoặc nhấp đúp để phóng to • Vuốt để chuyển ảnh"}
        </div>
      </div>

      {/* Bottom Thumbnail Gallery Bar */}
      {images.length > 1 && showThumbnails && (
        <div className="p-2 sm:p-3 bg-black/70 border-t border-white/10 z-20 overflow-x-auto max-w-full flex items-center justify-center gap-2">
          <div className="flex gap-2 max-w-full overflow-x-auto px-2 py-1 scrollbar-thin">
            {images.map((imgUrl, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentIndex(idx);
                  resetTransform();
                }}
                id={`thumb-viewer-${idx}`}
                className={`w-12 h-12 sm:w-16 sm:h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                  currentIndex === idx
                    ? "border-amber-400 scale-105 shadow-lg shadow-amber-400/20"
                    : "border-white/20 opacity-50 hover:opacity-100"
                }`}
              >
                <img
                  src={imgUrl}
                  alt={`Thumbnail ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
