'use client';

import type {
  SmileSettings,
  SmileState,
  SmileGridData,
  SmileResult,
  CentralLength,
  SmileIdentity,
  SmileShade,
} from '@/hooks/useSmileDesign';
import { DEFAULT_SMILE_SETTINGS } from '@/hooks/useSmileDesign';
import {
  getLessWhiteSettings,
  getMoreNaturalSettings,
  getMorePerfectSettings,
} from '@/lib/smile-design-settings';
import type { MotionState } from '@/hooks/useSmileMotion';

interface SmileDesignPanelProps {
  state: SmileState;
  result: SmileResult | null;
  gridData: SmileGridData | null;
  settings: SmileSettings;
  onSettingsChange: (patch: Partial<SmileSettings>) => void;
  onRegenerate: (overrides?: Partial<SmileSettings>) => void;
  onSave: () => void;
  onShareLink: () => void;
  onExit: () => void;
  onOpenWarpBrush?: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  canShare: boolean;
  error: string | null;
  processingTime?: number | null;
  onGenerateMotion: () => void;
  onSaveMotion: () => void;
  motionState: MotionState;
  motionError: string | null;
}

const IDENTITY_OPTIONS: { value: SmileIdentity; label: string; hint: string }[] = [
  { value: 'Fiel', label: 'Fiel al paciente', hint: 'Conserva tamaño, proporciones y personalidad dental.' },
  { value: 'Equilibrado', label: 'Equilibrado', hint: 'Híbrido entre identidad real y sonrisa armónica.' },
  { value: 'Idealizado', label: 'Idealizado', hint: 'Mayor corrección, simetría y perfección estética.' },
];
const LEVEL_OPTIONS: { value: SmileShade; label: string }[] = [
  { value: 'Tono original', label: 'Tono original' },
  { value: 'Original mejorado', label: 'Original mejorado' },
  { value: 'Natural', label: 'Natural' },
  { value: 'Blanco estético', label: 'Blanco estético' },
  { value: 'Ultra blanco', label: 'Ultra blanco' },
];
const INTENSITY3 = ['Sutil', 'Medio', 'Marcado'] as const;
const TEXTURE_OPTIONS = ['Sutil', 'Medio', 'Detallado'] as const;
const CENTRAL_LENGTH_OPTIONS: { value: CentralLength; label: string }[] = [
  { value: 'Cortos', label: 'Cortos' },
  { value: 'Natural', label: 'Natural' },
  { value: 'Largos', label: 'Largos' },
];

export default function SmileDesignPanel({
  state,
  gridData,
  settings,
  onSettingsChange,
  onRegenerate,
  onSave,
  onShareLink,
  onExit,
  onOpenWarpBrush,
  showGrid,
  onToggleGrid,
  canShare,
  error,
  processingTime,
  onGenerateMotion,
  onSaveMotion,
  motionState,
  motionError,
}: SmileDesignPanelProps) {
  const isProcessing = state === 'aligning' || state === 'enhancing';
  const isReady = state === 'ready';

  return (
    <div className="flex flex-col h-full bg-[#12151f]">
      {/* Canvas area (left) + Controls (right) layout done by parent */}
      {/* This panel IS the right-side controls */}
      <div className="flex flex-col h-full overflow-y-auto p-3 gap-3">

        {/* Header */}
        <div className="flex items-center gap-1.5 pb-2 border-b border-[#1e2130]">
          <span className="text-sm">✨</span>
          <span className="text-xs font-bold text-white">Smile Design</span>
          <div className="ml-auto bg-emerald-500 rounded px-1.5 py-0.5 text-[9px] text-white font-semibold">IA</div>
          <button
            onClick={onExit}
            className="ml-1 text-gray-500 hover:text-gray-300 text-xs px-1"
            title="Salir de Smile Design"
          >
            ✕
          </button>
        </div>

        {/* Loading state */}
        {isProcessing && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">
              {state === 'aligning' ? 'Auto-alineando...' : 'Generando smile design...'}
            </span>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Controls — always visible so user can adjust before regenerate */}
        <div className={`flex flex-col gap-3 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>

          {/* Dental identity */}
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-1.5">Identidad dental</div>
            <div className="flex flex-col gap-1">
              {IDENTITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onSettingsChange({ identity: opt.value })}
                  className={`text-left px-2 py-1.5 rounded border transition-colors ${
                    settings.identity === opt.value
                      ? 'bg-purple-900/50 border-purple-500 text-purple-200'
                      : 'bg-[#1e2130] border-[#2a2d3a] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <div className="text-[10px] font-semibold">
                    {settings.identity === opt.value && '● '}{opt.label}
                    {opt.value === DEFAULT_SMILE_SETTINGS.identity && settings.identity === opt.value && (
                      <span className="float-right text-[8px] text-purple-400">default</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[8px] leading-tight text-gray-500">{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Whitening level */}
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-1.5">Tono del esmalte</div>
            <div className="flex flex-col gap-1">
              {LEVEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onSettingsChange({ level: opt.value })}
                  className={`text-left px-2 py-1.5 rounded text-[10px] border transition-colors ${
                    settings.level === opt.value
                      ? 'bg-purple-900/50 border-purple-500 text-purple-300 font-semibold'
                      : 'bg-[#1e2130] border-[#2a2d3a] text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {settings.level === opt.value && '● '}{opt.label}
                  {opt.value === DEFAULT_SMILE_SETTINGS.level && settings.level === opt.value && (
                    <span className="float-right text-[8px] text-purple-400">default</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Incisal edges */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[9px] text-gray-500 uppercase tracking-wide">Bordes incisales</div>
              <button
                onClick={() => onSettingsChange({ edges: !settings.edges })}
                className={`w-7 h-3.5 rounded-full relative transition-colors ${settings.edges ? 'bg-purple-600' : 'bg-gray-700'}`}
              >
                <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${settings.edges ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
            {settings.edges && (
              <div className="flex gap-1">
                {INTENSITY3.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onSettingsChange({ edgesIntensity: opt })}
                    className={`flex-1 rounded py-1 text-center text-[9px] transition-colors ${
                      settings.edgesIntensity === opt
                        ? 'bg-purple-900/50 text-purple-300 font-semibold'
                        : 'bg-[#1e2130] text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dental texture */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[9px] text-gray-500 uppercase tracking-wide">Textura dental</div>
              <button
                onClick={() => onSettingsChange({ texture: !settings.texture })}
                className={`w-7 h-3.5 rounded-full relative transition-colors ${settings.texture ? 'bg-purple-600' : 'bg-gray-700'}`}
              >
                <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${settings.texture ? 'right-0.5' : 'left-0.5'}`} />
              </button>
            </div>
            {settings.texture && (
              <div className="flex gap-1">
                {TEXTURE_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onSettingsChange({ textureIntensity: opt })}
                    className={`flex-1 rounded py-1 text-center text-[9px] transition-colors ${
                      settings.textureIntensity === opt
                        ? 'bg-purple-900/50 text-purple-300 font-semibold'
                        : 'bg-[#1e2130] text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Shape slider */}
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-1.5">Forma dental</div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-pink-300">Fem</span>
              <input
                type="range"
                min={-100}
                max={100}
                value={Math.round(settings.shape * 100)}
                onChange={e => onSettingsChange({ shape: Number(e.target.value) / 100 })}
                className="flex-1 accent-purple-500"
              />
              <span className="text-[9px] text-blue-300">Masc</span>
            </div>
            {Math.abs(settings.shape) < 0.05 && (
              <div className="text-center text-[8px] text-purple-400 mt-0.5">Centro (default)</div>
            )}
          </div>

          {/* Central incisor length */}
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-1.5">Largo de centrales</div>
            <div className="flex gap-1">
              {CENTRAL_LENGTH_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onSettingsChange({ centralLength: value })}
                  className={`flex-1 rounded py-1.5 text-center text-[9px] transition-colors border ${
                    settings.centralLength === value
                      ? 'bg-purple-900/50 border-purple-500 text-purple-300 font-semibold'
                      : 'bg-[#1e2130] border-[#2a2d3a] text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#1e2130]" />

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5">
          {isReady && (
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-1.5">Ajuste rápido</div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => onRegenerate(getMoreNaturalSettings(settings))}
                  disabled={isProcessing}
                  className="rounded-md border border-emerald-500/30 bg-emerald-900/20 px-1 py-2 text-[9px] leading-tight text-emerald-300 hover:border-emerald-400 disabled:opacity-50"
                  title="Conserva más identidad y baja un nivel el blanco"
                >
                  Más natural
                </button>
                <button
                  onClick={() => onRegenerate(getMorePerfectSettings(settings))}
                  disabled={isProcessing}
                  className="rounded-md border border-purple-500/30 bg-purple-900/20 px-1 py-2 text-[9px] leading-tight text-purple-300 hover:border-purple-400 disabled:opacity-50"
                  title="Aumenta la idealización sin modificar el tono"
                >
                  Más perfecto
                </button>
                <button
                  onClick={() => onRegenerate(getLessWhiteSettings(settings))}
                  disabled={isProcessing}
                  className="rounded-md border border-amber-500/30 bg-amber-900/20 px-1 py-2 text-[9px] leading-tight text-amber-300 hover:border-amber-400 disabled:opacity-50"
                  title="Baja un nivel el blanco sin modificar la identidad"
                >
                  Menos blanco
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => onRegenerate()}
            disabled={isProcessing}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm md:text-base font-bold py-2.5 rounded-md flex items-center justify-center gap-1"
          >
            🔄 Regenerar
          </button>
          {onOpenWarpBrush && isReady && (
            <button
              onClick={onOpenWarpBrush}
              className="bg-[#1e2130] border border-purple-500/40 hover:border-purple-400 text-purple-300 text-sm md:text-base py-2.5 rounded-md flex items-center justify-center gap-1"
            >
              🖌️ Pincel de corrección
            </button>
          )}
          <button
            onClick={onSave}
            disabled={isProcessing || !isReady}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm md:text-base font-bold py-2.5 rounded-md shadow-sm transition-colors"
          >
            💾 Guardar Copia en Drive + Portal
          </button>
          <button
            onClick={onShareLink}
            disabled={!canShare}
            className="bg-[#1e2130] border border-[#2a2d3a] hover:border-gray-500 disabled:opacity-40 text-gray-300 text-sm md:text-base py-2.5 rounded-md"
          >
            🔗 Link para paciente
          </button>
        </div>

        {/* ── Smile Motion ─────────────────────────────────────────── */}
        {state === 'ready' && (
          <div className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-3">
            {(motionState === 'idle' || motionState === 'error') && (
              <button
                onClick={onGenerateMotion}
                className="w-full py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-sm md:text-base font-medium transition-all flex items-center justify-center gap-2"
              >
                🎬 Generar Smile Motion
              </button>
            )}
            {motionState === 'error' && motionError && (
              <p className="text-xs text-red-400 text-center">{motionError}</p>
            )}
            {motionState === 'generating' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-400 text-center">⟳ Google está generando el video del resultado… Puede tardar varios minutos.</p>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}
            {motionState === 'ready' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-emerald-400 text-center">✓ Video del resultado listo</p>
                <button
                  onClick={onSaveMotion}
                  className="w-full py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-sm md:text-base font-medium transition-all flex items-center justify-center gap-2"
                >
                  💾 Guardar video en Drive
                </button>
                <button
                  onClick={onShareLink}
                  className="w-full py-2.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-sm md:text-base font-medium transition-all flex items-center justify-center gap-2"
                >
                  📲 Incluir en link del paciente
                </button>
              </div>
            )}
          </div>
        )}

        {/* Status */}
        {isReady && processingTime != null && (
          <div className="bg-[#1a1d2e] rounded-lg p-2 text-center">
            <div className="text-[9px] text-emerald-400">✓ Procesado en {processingTime.toFixed(1)}s</div>
            <div className="text-[8px] text-gray-600 mt-0.5">
              Auto-alineado · {settings.identity} · {settings.level}
            </div>
          </div>
        )}

        {/* Grid toggle (shown when gridData available) */}
        {gridData && (gridData.bipupilarY || gridData.smileLineY || gridData.midlineX) && (
          <button
            onClick={onToggleGrid}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] transition-colors ${
              showGrid
                ? 'bg-purple-600/20 border border-purple-500/40 text-purple-300'
                : 'bg-[#1a1d2e] border border-[#2a2d3a] text-gray-500'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${showGrid ? 'bg-purple-400' : 'bg-gray-600'}`} />
            Grilla de referencia
            <div className={`ml-auto w-7 h-3.5 rounded-full relative ${showGrid ? 'bg-purple-600' : 'bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${showGrid ? 'right-0.5' : 'left-0.5'}`} />
            </div>
          </button>
        )}

      </div>
    </div>
  );
}
