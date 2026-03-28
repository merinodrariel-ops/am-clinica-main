'use client';

import { useState, useRef, useCallback } from 'react';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  className?: string;
  onPosChange?: (pos: number) => void;
}

export default function BeforeAfterSlider({ beforeSrc, afterSrc, className = '', onPosChange }: BeforeAfterSliderProps) {
  const [pos, setPos] = useState(50);

  const updatePos = useCallback((newPos: number) => {
    setPos(newPos);
    onPosChange?.(newPos);
  }, [onPosChange]);
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 }); // % from top-left
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const lastDist = useRef<number | null>(null);

  const getRelX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return 50;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  };

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    updatePos(getRelX(e.clientX));
  }, [updatePos]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    updatePos(getRelX(e.clientX));
  }, [updatePos]);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Pinch-to-zoom / scroll zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    setScale(prev => {
      const next = Math.max(1, Math.min(5, prev * (e.deltaY < 0 ? 1.15 : 0.87)));
      if (next > 1) setOrigin({ x: mx, y: my });
      return next;
    });
  }, []);

  // Touch: single finger = slider, two fingers = pinch zoom
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragging.current = true;
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      updatePos(getRelX(e.touches[0].clientX));
    } else if (e.touches.length === 2) {
      dragging.current = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging.current) {
      updatePos(getRelX(e.touches[0].clientX));
    } else if (e.touches.length === 2 && lastDist.current != null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / lastDist.current;
      setScale(prev => Math.max(1, Math.min(5, prev * ratio)));
      lastDist.current = dist;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    dragging.current = false;
    lastDist.current = null;
  }, []);

  const resetZoom = useCallback(() => setScale(1), []);

  const maxOriginX = Math.min(100, Math.max(0, origin.x));
  const maxOriginY = Math.min(100, Math.max(0, origin.y));
  
  const transformStyle = scale > 1
    ? { 
        width: `${scale * 100}%`, 
        height: `${scale * 100}%`, 
        left: `${maxOriginX - (maxOriginX * scale)}%`, 
        top: `${maxOriginY - (maxOriginY * scale)}%`,
        position: 'absolute' as const,
        transition: dragging.current ? 'none' : 'all 0.05s ease-out'
      }
    : { 
        width: '100%', 
        height: '100%', 
        left: '0%', 
        top: '0%',
        position: 'absolute' as const,
        transition: 'all 0.05s ease-out'
      };

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-lg cursor-col-resize ${className}`}
      style={{ userSelect: 'none', touchAction: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
    >
      {/* Scaled image wrapper */}
      <div style={transformStyle} className="w-full h-full">
        {/* After image (full, behind) */}
        <img
          src={afterSrc}
          alt="Después"
          className="block w-full h-full object-cover"
          draggable={false}
        />

        {/* Before image (clipped on left) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <img
            src={beforeSrc}
            alt="Antes"
            className="block w-full h-full object-cover"
            draggable={false}
          />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute bottom-2 left-3 text-[10px] text-white/60 font-medium pointer-events-none z-10">ANTES</div>
      <div className="absolute bottom-2 right-3 text-[10px] text-white/80 font-medium pointer-events-none z-10">DESPUÉS</div>

      {/* Divider line + handle (positioned relative to unscaled container) */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-20 pointer-events-none"
        style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs shadow-lg shadow-purple-500/50">
          ↔
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-30 pointer-events-auto">
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setScale(s => Math.min(5, s * 1.4)); }}
          className="w-6 h-6 rounded bg-black/60 text-white text-sm flex items-center justify-center hover:bg-black/80"
          title="Acercar"
        >+</button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setScale(s => Math.max(1, s / 1.4)); }}
          className="w-6 h-6 rounded bg-black/60 text-white text-sm flex items-center justify-center hover:bg-black/80"
          title="Alejar"
        >−</button>
        {scale > 1.05 && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); resetZoom(); }}
            className="w-6 h-6 rounded bg-purple-700/80 text-white text-[9px] flex items-center justify-center hover:bg-purple-700"
            title="Reset zoom"
          >↺</button>
        )}
      </div>

      {scale > 1.05 && (
        <div className="absolute top-2 left-2 z-30 bg-black/50 rounded px-1.5 py-0.5 text-[9px] text-white/70 pointer-events-none">
          {scale.toFixed(1)}×
        </div>
      )}
    </div>
  );
}
