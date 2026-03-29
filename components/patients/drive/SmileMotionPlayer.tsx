'use client';

import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Maximize2, ArrowLeft } from 'lucide-react';

interface SmileMotionPlayerProps {
  beforeVideoUrl: string;
  afterVideoUrl: string;
  onClose: () => void;
}

export default function SmileMotionPlayer({ beforeVideoUrl, afterVideoUrl, onClose }: SmileMotionPlayerProps) {
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef  = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const isRestartingRef = useRef(false);

  // Auto-play once both videos are ready
  useEffect(() => {
    const before = beforeRef.current;
    const after  = afterRef.current;
    if (!before || !after) return;

    let readyCount = 0;
    const tryPlay = () => {
      readyCount++;
      if (readyCount >= 2) {
        before.play().catch(() => undefined);
        after.play().catch(() => undefined);
        setPlaying(true);
      }
    };

    before.addEventListener('canplaythrough', tryPlay, { once: true });
    after.addEventListener('canplaythrough', tryPlay, { once: true });
    return () => {
      before.removeEventListener('canplaythrough', tryPlay);
      after.removeEventListener('canplaythrough', tryPlay);
    };
  }, []);

  // Synchronized loop: restart both on ended, prevent double-restart
  useEffect(() => {
    const handleEnded = () => {
      if (isRestartingRef.current) return;
      isRestartingRef.current = true;
      const before = beforeRef.current;
      const after  = afterRef.current;
      if (before) { before.currentTime = 0; before.play().catch(() => undefined); }
      if (after)  { after.currentTime  = 0; after.play().catch(() => undefined); }
      requestAnimationFrame(() => { isRestartingRef.current = false; });
    };

    const before = beforeRef.current;
    const after  = afterRef.current;
    before?.addEventListener('ended', handleEnded);
    after?.addEventListener('ended', handleEnded);
    return () => {
      before?.removeEventListener('ended', handleEnded);
      after?.removeEventListener('ended', handleEnded);
    };
  }, []);

  function togglePlay() {
    const before = beforeRef.current;
    const after  = afterRef.current;
    if (!before || !after) return;
    if (playing) {
      before.pause();
      after.pause();
      setPlaying(false);
    } else {
      before.play().catch(() => undefined);
      after.play().catch(() => undefined);
      setPlaying(true);
    }
  }

  function handleFullscreen() {
    if (containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => undefined);
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3 bg-zinc-950 rounded-xl overflow-hidden">
      {/* Videos */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="relative">
          <span className="absolute top-2 left-2 z-10 text-xs font-bold text-amber-400 bg-black/60 px-2 py-0.5 rounded">
            ANTES
          </span>
          <video
            ref={beforeRef}
            src={beforeVideoUrl}
            className="w-full h-full object-cover rounded-lg"
            muted
            playsInline
            preload="auto"
          />
        </div>
        <div className="relative">
          <span className="absolute top-2 left-2 z-10 text-xs font-bold text-emerald-400 bg-black/60 px-2 py-0.5 rounded">
            DESPUÉS
          </span>
          <video
            ref={afterRef}
            src={afterVideoUrl}
            className="w-full h-full object-cover rounded-lg"
            muted
            playsInline
            preload="auto"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 pb-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Ver fotos
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={handleFullscreen}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
