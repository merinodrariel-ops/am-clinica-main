'use client';

import { useState } from 'react';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  className?: string;
}

export default function BeforeAfterSlider({ beforeSrc, afterSrc, className = '' }: BeforeAfterSliderProps) {
  const [pos, setPos] = useState(50);

  return (
    <div
      className={`relative select-none overflow-hidden rounded-lg ${className}`}
      style={{ userSelect: 'none' }}
    >
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

      {/* Labels */}
      <div className="absolute bottom-2 left-3 text-[10px] text-white/60 font-medium pointer-events-none z-10">ANTES</div>
      <div className="absolute bottom-2 right-3 text-[10px] text-white/80 font-medium pointer-events-none z-10">DESPUÉS</div>

      {/* Divider line + handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-20 pointer-events-none"
        style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs shadow-lg shadow-purple-500/50">
          ↔
        </div>
      </div>

      {/* Range input (invisible, covers entire area) */}
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={e => setPos(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-col-resize z-30"
        style={{ margin: 0 }}
      />
    </div>
  );
}
