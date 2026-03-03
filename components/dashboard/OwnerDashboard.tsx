'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    DndContext,
    DragOverlay,
    AutoScrollActivator,
    MeasuringStrategy,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
    type DragOverEvent,
    type CollisionDetection,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    Users,
    UserPlus,
    TrendingUp,
    TrendingDown,
    CreditCard,
    Landmark,
    GripVertical,
    Eye,
    EyeOff,
    Settings2,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Trash2,
    Plus,
} from 'lucide-react';
import { getOwnerDashboardStats, type OwnerDashboardStats } from '@/lib/dashboard';
import Link from 'next/link';

const STORAGE_KEY = 'owner-dashboard-layout';

type CardId = 'total-pacientes' | 'primera-vez' | 'ingresos-mes' | 'egresos-mes' | 'en-financiacion' | 'deuda-total';

interface LayoutConfig {
    order: CardId[];
    hidden: CardId[];
}

type PresetId = 'ejecutivo' | 'finanzas' | 'operaciones';

const DEFAULT_ORDER: CardId[] = [
    'total-pacientes',
    'primera-vez',
    'ingresos-mes',
    'egresos-mes',
    'en-financiacion',
    'deuda-total',
];

const CARD_TITLES: Record<CardId, string> = {
    'total-pacientes': 'Pacientes Totales',
    'primera-vez': 'Pacientes Nuevos',
    'ingresos-mes': 'Ingresos Recepción',
    'egresos-mes': 'Egresos Admin',
    'en-financiacion': 'En Financiación',
    'deuda-total': 'Deuda Total Circulante',
};

const GRID_PRESETS: Record<PresetId, { name: string; description: string; layout: LayoutConfig }> = {
    ejecutivo: {
        name: 'Ejecutivo',
        description: 'Vista general con KPIs claves.',
        layout: {
            order: ['total-pacientes', 'primera-vez', 'ingresos-mes', 'egresos-mes', 'deuda-total', 'en-financiacion'],
            hidden: [],
        },
    },
    finanzas: {
        name: 'Finanzas',
        description: 'Enfocado en ingresos, egresos, deuda y financiación.',
        layout: {
            order: ['ingresos-mes', 'egresos-mes', 'deuda-total', 'en-financiacion', 'total-pacientes', 'primera-vez'],
            hidden: ['total-pacientes', 'primera-vez'],
        },
    },
    operaciones: {
        name: 'Operaciones',
        description: 'Prioriza actividad clínica y nuevos pacientes.',
        layout: {
            order: ['primera-vez', 'total-pacientes', 'en-financiacion', 'ingresos-mes', 'egresos-mes', 'deuda-total'],
            hidden: ['egresos-mes', 'deuda-total'],
        },
    },
};

function sameLayout(a: LayoutConfig, b: LayoutConfig) {
    if (a.order.length !== b.order.length) return false;
    for (let i = 0; i < a.order.length; i += 1) {
        if (a.order[i] !== b.order[i]) return false;
    }

    const hiddenA = [...a.hidden].sort();
    const hiddenB = [...b.hidden].sort();
    if (hiddenA.length !== hiddenB.length) return false;
    for (let i = 0; i < hiddenA.length; i += 1) {
        if (hiddenA[i] !== hiddenB[i]) return false;
    }

    return true;
}

function getLayout(): LayoutConfig {
    if (typeof window === 'undefined') return { order: DEFAULT_ORDER, hidden: [] };
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Ensure all cards are valid, unique, and complete (including newly added cards)
            const allCards = new Set(DEFAULT_ORDER);
            const orderRaw = (parsed.order || []).filter((id: string) => allCards.has(id as CardId)) as CardId[];
            const seenOrder = new Set<CardId>();
            const order = orderRaw.filter((id) => {
                if (seenOrder.has(id)) return false;
                seenOrder.add(id);
                return true;
            });
            DEFAULT_ORDER.forEach(id => { if (!order.includes(id)) order.push(id); });

            const hiddenRaw = (parsed.hidden || []).filter((id: string) => allCards.has(id as CardId)) as CardId[];
            const seenHidden = new Set<CardId>();
            const hidden = hiddenRaw.filter((id) => {
                if (seenHidden.has(id)) return false;
                seenHidden.add(id);
                return true;
            });

            return { order, hidden };
        }
    } catch { /* ignore */ }
    return { order: DEFAULT_ORDER, hidden: [] };
}

function saveLayout(layout: LayoutConfig) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch { /* ignore */ }
}

// Month names in Spanish
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function SortableCard({
    id,
    children,
    isEditing,
    isDragEnabled,
    isDropTarget,
    isRecentlyDropped,
    className,
}: {
    id: string;
    children: React.ReactNode;
    isEditing: boolean;
    isDragEnabled: boolean;
    isDropTarget: boolean;
    isRecentlyDropped: boolean;
    className?: string;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: !isDragEnabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 60 : 'auto',
        opacity: isDragging ? 0.35 : 1,
        filter: isDragging ? 'saturate(0.75)' : 'none',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative transition-all duration-200 ${isDragEnabled ? 'touch-none' : ''} ${className || ''}`}
            data-drag-target={isDropTarget ? 'true' : undefined}
            data-drag-dropped={isRecentlyDropped ? 'true' : undefined}
            aria-dropeffect={isDropTarget ? 'move' : undefined}
            aria-grabbed={isDragging ? 'true' : undefined}
            onMouseEnter={(event) => {
                if (!isEditing) return;
                event.currentTarget.style.transformOrigin = 'center';
            }}
        >
            {isDragEnabled && isDropTarget && (
                <div
                    className="pointer-events-none absolute -inset-1 rounded-3xl animate-pulse"
                    style={{
                        border: '1px solid hsla(165, 100%, 42%, 0.42)',
                        boxShadow: '0 0 0 1px hsla(165, 100%, 42%, 0.18), 0 14px 34px -20px rgba(24, 255, 189, 0.7)',
                    }}
                />
            )}
            {isDragEnabled && isRecentlyDropped && (
                <div
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{
                        boxShadow: '0 0 0 1px hsla(165, 100%, 42%, 0.25), 0 0 30px -16px rgba(24, 255, 189, 0.8)',
                    }}
                />
            )}
            {isDragEnabled && (
                <button
                    className="absolute top-2 left-2 z-10 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all touch-none bg-white/5 hover:bg-white/10 text-slate-400"
                    aria-label="Arrastrar tarjeta"
                    {...(isDragEnabled ? { ...attributes, ...listeners } : {})}
                >
                    <GripVertical size={16} />
                </button>
            )}
            {children}
        </div>
    );
}

interface KpiCardProps {
    id: CardId;
    icon: React.ElementType;
    label: string;
    value: string | number;
    subtitle?: string;
    gradient: string;
    iconBg: string;
    iconColor: string;
    isGiant?: boolean;
    isLarge?: boolean;
    badge?: string;
    expandContent?: React.ReactNode;
    alwaysExpanded?: boolean;
    cardClassName?: string;
    isEditing: boolean;
    isHidden: boolean;
    canRemove: boolean;
    onToggleVisibility: (id: CardId) => void;
    onRemove: (id: CardId) => void;
}

function KpiCard({
    id,
    icon: Icon,
    label,
    value,
    subtitle,
    gradient,
    iconBg,
    iconColor,
    isGiant,
    isLarge,
    badge,
    expandContent,
    alwaysExpanded = false,
    cardClassName = '',
    isEditing,
    isHidden,
    canRemove,
    onToggleVisibility,
    onRemove,
}: KpiCardProps) {
    const [expanded, setExpanded] = useState(alwaysExpanded);

    if (isHidden && !isEditing) return null;

    return (
        <div
            className={`glass-card rounded-2xl p-6 transition-all duration-300 relative border border-white/5 min-h-[170px] ${isGiant ? 'col-span-1 md:col-span-2' : ''
                } ${isHidden ? 'opacity-40 bg-black/40' : 'bg-black/20'} ${isEditing ? 'ring-1 ring-white/10' : ''} ${cardClassName}`}
        >
            {isEditing && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                    <button
                        onClick={() => onToggleVisibility(id)}
                        className={`p-1.5 rounded-lg transition-all hover:scale-110 ${isHidden ? 'bg-red-500/20 text-red-400' : 'bg-white/5 hover:bg-white/10 text-slate-400'}`}
                        title={isHidden ? 'Mostrar' : 'Ocultar'}
                    >
                        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                        onClick={() => onRemove(id)}
                        disabled={!canRemove}
                        className="p-1.5 rounded-lg transition-all hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed bg-red-500/20 text-red-500"
                        title={canRemove ? 'Eliminar del grid' : 'Debe quedar al menos una tarjeta'}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}

            <div className="flex items-start gap-4">
                <div
                    className={`${isGiant ? 'h-16 w-16' : 'h-12 w-12'} rounded-xl flex items-center justify-center flex-shrink-0`}
                    style={{ background: iconBg }}
                >
                    <Icon size={isGiant ? 32 : 24} style={{ color: iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <p
                            className={`${isGiant ? 'text-base' : 'text-sm'} font-medium text-slate-400`}
                        >
                            {label}
                        </p>
                        {badge && (
                            <span
                                className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{
                                    background: 'hsla(165, 100%, 42%, 0.12)',
                                    color: 'hsl(165, 85%, 50%)',
                                    border: '1px solid hsla(165, 100%, 42%, 0.2)',
                                }}
                            >
                                {badge}
                            </span>
                        )}
                    </div>
                    <p
                        className={`font-bold tracking-tight leading-none ${isGiant ? 'text-5xl md:text-6xl lg:text-7xl' : isLarge ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'
                            }`}
                        style={{
                            background: gradient,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}
                    >
                        {value}
                    </p>
                    {subtitle && (
                        <p className="text-xs mt-1.5 text-slate-500">
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>

            {expandContent && !isHidden && (
                <div className="mt-3">
                    {!alwaysExpanded && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="flex items-center gap-1 text-xs transition-colors text-slate-400 hover:text-slate-300"
                        >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {expanded ? 'Ocultar detalle' : 'Ver detalle'}
                        </button>
                    )}
                    {(alwaysExpanded || expanded) && (
                        <div
                            className={`rounded-xl p-3 overflow-y-auto ${alwaysExpanded ? 'mt-0 max-h-80' : 'mt-2 max-h-48'} bg-black/40 border border-white/5`}
                        >
                            {expandContent}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function NewPatientsTrendDetail({
    monthly,
    consultations,
}: {
    monthly: OwnerDashboardStats['primeraVezMensual'];
    consultations: OwnerDashboardStats['primerasConsultasRecientes'];
}) {
    const [selectedMonthKey, setSelectedMonthKey] = useState(monthly[monthly.length - 1]?.key || '');
    const [showSelectedList, setShowSelectedList] = useState(true);
    const [showJanuaryList, setShowJanuaryList] = useState(false);

    const selectedIndex = monthly.findIndex((month) => month.key === selectedMonthKey);
    const safeIndex = selectedIndex >= 0 ? selectedIndex : monthly.length - 1;
    const selectedMonth = monthly[safeIndex];
    const previousMonth = safeIndex > 0 ? monthly[safeIndex - 1] : null;

    const currentCount = selectedMonth?.count || 0;
    const previousCount = previousMonth?.count || 0;
    const changePct = previousCount > 0
        ? Math.round(((currentCount - previousCount) / previousCount) * 100)
        : 0;
    const trendUp = changePct > 0;
    const trendDown = changePct < 0;

    const maxCount = Math.max(1, ...monthly.map((month) => month.count));
    const canPrev = safeIndex > 0;
    const canNext = safeIndex >= 0 && safeIndex < monthly.length - 1;
    const selectedPatients = consultations.filter((p) => p.monthKey === selectedMonth?.key);

    const januaryMonth = monthly.find((month) => month.key.endsWith('-01'));
    const januaryPatients = januaryMonth
        ? consultations.filter((p) => p.monthKey === januaryMonth.key)
        : [];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg px-2 py-1 bg-black/40 border border-white/5">
                <button
                    type="button"
                    onClick={() => canPrev && setSelectedMonthKey(monthly[safeIndex - 1].key)}
                    disabled={!canPrev}
                    className="p-1 rounded disabled:opacity-30 text-slate-400 hover:text-slate-300"
                    aria-label="Mes anterior"
                >
                    <ChevronLeft size={14} />
                </button>
                <div className="text-center">
                    <p className="text-xs capitalize text-slate-200">{selectedMonth?.label || 'Sin datos'}</p>
                    <p className="text-[11px] text-slate-500">
                        {currentCount} nuevos{previousMonth ? ` · vs ${previousMonth.shortLabel}: ${previousCount}` : ''}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => canNext && setSelectedMonthKey(monthly[safeIndex + 1].key)}
                    disabled={!canNext}
                    className="p-1 rounded disabled:opacity-30 text-slate-400 hover:text-slate-300"
                    aria-label="Mes siguiente"
                >
                    <ChevronRight size={14} />
                </button>
            </div>

            <div className="grid grid-cols-6 gap-2 items-end h-32">
                {monthly.map((month) => {
                    const isSelected = month.key === selectedMonth?.key;
                    const height = Math.max(10, Math.round((month.count / maxCount) * 100));
                    return (
                        <button
                            type="button"
                            key={month.key}
                            onClick={() => setSelectedMonthKey(month.key)}
                            className="flex flex-col items-center justify-end gap-1"
                            title={`${month.label}: ${month.count}`}
                        >
                            <span className={`text-[10px] ${isSelected ? 'text-teal-500' : 'text-slate-500'}`}>
                                {month.count}
                            </span>
                            <div
                                className="w-full rounded-md"
                                style={{
                                    height: `${height}%`,
                                    background: isSelected
                                        ? 'linear-gradient(180deg, #14b8a6, #0f766e)'
                                        : 'rgba(255, 255, 255, 0.05)',
                                    border: isSelected
                                        ? '1px solid rgba(20, 184, 166, 0.5)'
                                        : '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                            />
                            <span className={`text-[10px] uppercase ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                {month.shortLabel}
                            </span>
                        </button>
                    );
                })}
            </div>

            {(trendUp || trendDown) && (
                <p className={`text-xs ${trendUp ? 'text-teal-500' : 'text-red-400'}`}>
                    {trendUp ? 'Sube' : 'Baja'} {Math.abs(changePct)}% respecto al mes previo.
                </p>
            )}

            <p className="text-[11px] text-slate-500">
                Tocá una barra para cambiar el mes de referencia.
            </p>

            <div className="pt-2 border-t border-white/5">
                <button
                    type="button"
                    onClick={() => setShowSelectedList((prev) => !prev)}
                    className="flex items-center gap-1 text-xs transition-colors text-slate-400 hover:text-slate-300"
                >
                    {showSelectedList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showSelectedList ? 'Ocultar lista del mes' : 'Ver lista del mes'}
                </button>

                {showSelectedList && (
                    <div className="mt-2 space-y-1.5">
                        {selectedPatients.length === 0 ? (
                            <p className="text-xs text-slate-500">
                                Sin pacientes nuevos para {selectedMonth?.label || 'el mes seleccionado'}.
                            </p>
                        ) : (
                            selectedPatients.slice(0, 8).map((p, i) => (
                                <Link
                                    key={`${p.monthKey}-${p.nombre}-${p.apellido}-${i}`}
                                    href={`/patients/${p.id_paciente}`}
                                    className="flex items-center gap-2 text-xs hover:text-teal-400 transition-colors group text-slate-300"
                                >
                                    <span className="font-medium group-hover:underline">{p.nombre} {p.apellido}</span>
                                    <span className="text-slate-500">
                                        {new Date(`${p.primera_consulta_fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                    </span>
                                </Link>
                            ))
                        )}
                    </div>
                )}
            </div>

            {januaryMonth && (
                <div className="pt-2 border-t border-white/5">
                    <button
                        type="button"
                        onClick={() => setShowJanuaryList((prev) => !prev)}
                        className="flex items-center gap-1 text-xs transition-colors text-slate-400 hover:text-slate-300"
                    >
                        {showJanuaryList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {showJanuaryList ? 'Ocultar lista de enero' : `Ver lista de enero (${januaryMonth.count})`}
                    </button>

                    {showJanuaryList && (
                        <div className="mt-2 space-y-1.5">
                            {januaryPatients.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                    No hay pacientes nuevos en enero.
                                </p>
                            ) : (
                                januaryPatients.slice(0, 8).map((p, i) => (
                                    <Link
                                        key={`enero-${p.monthKey}-${p.nombre}-${p.apellido}-${i}`}
                                        href={`/patients/${p.id_paciente}`}
                                        className="flex items-center gap-2 text-xs hover:text-teal-400 transition-colors group text-slate-300"
                                    >
                                        <span className="font-medium group-hover:underline">{p.nombre} {p.apellido}</span>
                                        <span className="text-slate-500">
                                            {new Date(`${p.primera_consulta_fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                        </span>
                                    </Link>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function OwnerDashboard() {
    const [stats, setStats] = useState<OwnerDashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [layout, setLayout] = useState<LayoutConfig>(() => getLayout());
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'config'>('dashboard');
    const [activeCardId, setActiveCardId] = useState<CardId | null>(null);
    const [overCardId, setOverCardId] = useState<CardId | null>(null);
    const [recentlyDroppedCardId, setRecentlyDroppedCardId] = useState<CardId | null>(null);
    const droppedPulseTimeoutRef = useRef<number | null>(null);
    const isDragEnabled = activeTab === 'dashboard';

    const currentMonth = MONTH_NAMES[new Date().getMonth()];

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
        const pointerHits = pointerWithin(args);
        if (pointerHits.length > 0) return pointerHits;
        return closestCorners(args);
    }, []);

    useEffect(() => {
        async function load() {
            const data = await getOwnerDashboardStats();
            setStats(data);
            setLoading(false);
        }
        load();
    }, []);

    useEffect(() => {
        return () => {
            if (droppedPulseTimeoutRef.current) {
                window.clearTimeout(droppedPulseTimeoutRef.current);
            }
        };
    }, []);

    const triggerDropPulse = useCallback((id: CardId) => {
        if (droppedPulseTimeoutRef.current) {
            window.clearTimeout(droppedPulseTimeoutRef.current);
        }
        setRecentlyDroppedCardId(id);
        droppedPulseTimeoutRef.current = window.setTimeout(() => {
            setRecentlyDroppedCardId(null);
            droppedPulseTimeoutRef.current = null;
        }, 260);
    }, []);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveCardId(event.active.id as CardId);
        setOverCardId(event.active.id as CardId);
    }, []);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        setOverCardId((event.over?.id as CardId | undefined) || null);
    }, []);

    const handleDragCancel = useCallback(() => {
        setActiveCardId(null);
        setOverCardId(null);
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const draggedCardId = event.active.id as CardId;
        setActiveCardId(null);
        setOverCardId(null);
        const { active, over } = event;
        if (!over || active.id === over.id) {
            triggerDropPulse(draggedCardId);
            return;
        }

        setLayout(prev => {
            const oldIndex = prev.order.indexOf(active.id as CardId);
            const newIndex = prev.order.indexOf(over.id as CardId);
            if (oldIndex < 0 || newIndex < 0) return prev;
            const newLayout = { ...prev, order: arrayMove(prev.order, oldIndex, newIndex) };
            saveLayout(newLayout);
            return newLayout;
        });
        triggerDropPulse(draggedCardId);
    }, [triggerDropPulse]);

    const toggleVisibility = useCallback((id: string) => {
        const cardId = id as CardId;
        setLayout(prev => {
            const hidden = prev.hidden.includes(cardId)
                ? prev.hidden.filter(h => h !== cardId)
                : [...prev.hidden, cardId];
            const newLayout = { ...prev, hidden };
            saveLayout(newLayout);
            return newLayout;
        });
    }, []);

    const resetLayout = useCallback(() => {
        const defaultLayout = { order: DEFAULT_ORDER, hidden: [] };
        setLayout(defaultLayout);
        saveLayout(defaultLayout);
        setIsEditing(false);
        setActiveTab('dashboard');
    }, []);

    const repairLayout = useCallback(() => {
        const defaultLayout = { order: DEFAULT_ORDER, hidden: [] };
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
        setLayout(defaultLayout);
        saveLayout(defaultLayout);
        setIsEditing(false);
        setActiveTab('dashboard');
    }, []);

    const applyPreset = useCallback((presetId: PresetId) => {
        const presetLayout = GRID_PRESETS[presetId].layout;
        const nextLayout: LayoutConfig = {
            order: [...presetLayout.order],
            hidden: [...presetLayout.hidden],
        };
        setLayout(nextLayout);
        saveLayout(nextLayout);
    }, []);

    const removeCard = useCallback((id: CardId) => {
        setLayout(prev => {
            if (!prev.order.includes(id) || prev.order.length <= 1) return prev;
            const order = prev.order.filter(cardId => cardId !== id);
            const hidden = prev.hidden.filter(cardId => cardId !== id);
            const newLayout = { ...prev, order, hidden };
            saveLayout(newLayout);
            return newLayout;
        });
        if (activeCardId === id) setActiveCardId(null);
        if (overCardId === id) setOverCardId(null);
    }, [activeCardId, overCardId]);

    const restoreCard = useCallback((id: CardId) => {
        setLayout(prev => {
            if (prev.order.includes(id)) return prev;
            const order = [...prev.order, id];
            const hidden = prev.hidden.filter(cardId => cardId !== id);
            const newLayout = { ...prev, order, hidden };
            saveLayout(newLayout);
            return newLayout;
        });
    }, []);

    const moveCardInConfig = useCallback((id: CardId, direction: 'up' | 'down') => {
        setLayout(prev => {
            const index = prev.order.indexOf(id);
            if (index < 0) return prev;
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= prev.order.length) return prev;
            const order = arrayMove(prev.order, index, targetIndex);
            const newLayout = { ...prev, order };
            saveLayout(newLayout);
            return newLayout;
        });
    }, []);

    if (loading) {
        return (
            <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="h-7 w-48 rounded-lg animate-pulse bg-white/5" />
                        <div className="h-4 w-32 mt-2 rounded animate-pulse bg-white/5" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="glass-card rounded-2xl p-6 animate-pulse bg-black/20 border border-white/5" style={{ height: i === 1 ? '140px' : '120px' }}>
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-white/5" />
                                <div className="space-y-2">
                                    <div className="h-4 w-24 rounded bg-white/5" />
                                    <div className="h-8 w-20 rounded bg-white/5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!stats) return null;

    const cardData: Partial<Record<CardId, Omit<KpiCardProps, 'isEditing' | 'isHidden' | 'canRemove' | 'onToggleVisibility' | 'onRemove'>>> = {
        'total-pacientes': {
            id: 'total-pacientes',
            icon: Users,
            label: 'Pacientes Totales',
            value: stats.totalPacientes.toLocaleString(),
            subtitle: 'Pacientes activos registrados',
            gradient: 'linear-gradient(135deg, hsl(217 91% 60%), hsl(224 76% 48%))',
            iconBg: 'hsla(217, 91%, 60%, 0.15)',
            iconColor: 'hsl(217 91% 65%)',
            isLarge: true,
        },
        'primera-vez': {
            id: 'primera-vez',
            icon: UserPlus,
            label: 'Pacientes Nuevos',
            value: stats.primeraVezMes,
            badge: currentMonth,
            subtitle: 'Comparativo mensual de primeras consultas',
            gradient: 'linear-gradient(135deg, hsl(165 100% 42%), hsl(140 70% 35%))',
            iconBg: 'hsla(165, 100%, 42%, 0.15)',
            iconColor: 'hsl(165 85% 50%)',
            isLarge: true,
            cardClassName: '',
            alwaysExpanded: false,
            expandContent: (
                <NewPatientsTrendDetail
                    monthly={stats.primeraVezMensual}
                    consultations={stats.primerasConsultasRecientes}
                />
            ),
        },
        'ingresos-mes': {
            id: 'ingresos-mes',
            icon: TrendingUp,
            label: 'Ingresos Recepción',
            value: `$${stats.ingresosMesUsd.toLocaleString()} USD`,
            badge: currentMonth,
            subtitle: 'Cobros pagados en caja de recepción',
            gradient: 'linear-gradient(135deg, hsl(150 80% 45%), hsl(165 90% 35%))',
            iconBg: 'hsla(150, 80%, 45%, 0.15)',
            iconColor: 'hsl(150 80% 50%)',
            isLarge: true,
        },
        'egresos-mes': {
            id: 'egresos-mes',
            icon: TrendingDown,
            label: 'Egresos Admin',
            value: `$${stats.egresosMesUsd.toLocaleString()} USD`,
            badge: currentMonth,
            subtitle: 'Gastos operativos de administración',
            gradient: 'linear-gradient(135deg, hsl(0 75% 55%), hsl(15 80% 50%))',
            iconBg: 'hsla(0, 75%, 55%, 0.15)',
            iconColor: 'hsl(0 75% 60%)',
            isLarge: true,
        },
        'en-financiacion': {
            id: 'en-financiacion',
            icon: CreditCard,
            label: 'En Financiación',
            value: `${stats.personasEnFinanciacion} personas`,
            subtitle: 'Con plan de cuotas activo',
            gradient: 'linear-gradient(135deg, hsl(270 67% 55%), hsl(285 65% 50%))',
            iconBg: 'hsla(270, 67%, 55%, 0.15)',
            iconColor: 'hsl(270 67% 65%)',
            expandContent: stats.planesFinanciacion.length > 0 ? (
                <ul className="space-y-2">
                    {stats.planesFinanciacion.map((p) => (
                        <li key={p.id} className="text-xs" style={{ color: 'hsl(210 20% 80%)' }}>
                            <div className="flex items-center justify-between">
                                <span className="font-medium">{p.paciente_nombre}</span>
                                <span style={{ color: 'hsl(270 67% 65%)' }}>
                                    {p.cuotas_pagadas}/{p.cuotas_total} cuotas
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                                <span style={{ color: 'hsl(230 10% 45%)' }}>{p.tratamiento}</span>
                                <span style={{ color: 'hsl(25 95% 60%)' }}>
                                    ${Number(p.saldo_restante_usd).toLocaleString()} USD
                                </span>
                            </div>
                            {/* Progress bar */}
                            <div className="h-1 rounded-full mt-1.5" style={{ background: 'hsla(230, 15%, 25%, 0.5)' }}>
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${(p.cuotas_pagadas / p.cuotas_total) * 100}%`,
                                        background: 'linear-gradient(90deg, hsl(270 67% 55%), hsl(285 65% 50%))',
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : undefined,
        },
        'deuda-total': {
            id: 'deuda-total',
            icon: Landmark,
            label: 'Deuda Total Circulante',
            value: `$${stats.deudaTotalUsd.toLocaleString()} USD`,
            subtitle: 'Saldo pendiente de todos los planes',
            gradient: 'linear-gradient(135deg, hsl(35 95% 55%), hsl(25 90% 48%))',
            iconBg: 'hsla(35, 95%, 55%, 0.15)',
            iconColor: 'hsl(35 95% 60%)',
        },
    };

    const activeCard = activeCardId ? cardData[activeCardId] : undefined;
    const ActiveCardIcon = activeCard?.icon || GripVertical;

    const visibleCards = layout.order.filter(id => !layout.hidden.includes(id) || isEditing);
    const removedCards = DEFAULT_ORDER.filter(id => !layout.order.includes(id));
    const activePresetId = (Object.keys(GRID_PRESETS) as PresetId[])
        .find((presetId) => sameLayout(layout, GRID_PRESETS[presetId].layout)) || null;

    const openConfigTab = () => {
        setActiveTab('config');
        setIsEditing(true);
    };

    const openDashboardTab = () => {
        setActiveTab('dashboard');
        setIsEditing(false);
    };

    return (
        <div className="mb-8">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                <div>
                    <h2
                        className="text-xl font-bold tracking-tight text-white"
                    >
                        📊 Panel del Dueño
                    </h2>
                    <p className="text-sm mt-0.5 text-slate-400">
                        {currentMonth} {new Date().getFullYear()} — Vista ejecutiva
                    </p>
                    <div className="mt-3 inline-flex items-center gap-1 rounded-xl p-1 bg-black/40 border border-white/5">
                        <button
                            onClick={openDashboardTab}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === 'dashboard' ? 'bg-teal-500/10 text-teal-400' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={openConfigTab}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === 'config' ? 'bg-teal-500/10 text-teal-400' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                        >
                            <Settings2 size={12} />
                            Configurar grid
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={repairLayout}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 bg-amber-500/10 hover:bg-amber-500/15 text-amber-300 border border-amber-500/25"
                        title="Borra layout guardado y reconstruye el grid"
                    >
                        <Settings2 size={12} />
                        Reparar grid
                    </button>
                    <button
                        onClick={resetLayout}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                    >
                        <RotateCcw size={12} />
                        Restablecer
                    </button>
                    {activeTab === 'dashboard' && (
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 ${isEditing ? 'ring-1 border-teal-500/30 bg-teal-500/10 text-teal-400' : 'border-white/5 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                        >
                            <Settings2 size={12} />
                            {isEditing ? 'Listo' : 'Personalizar'}
                        </button>
                    )}
                </div>
            </div>

            {activeTab === 'config' && (
                <div className="mb-4 glass-card rounded-2xl p-4 bg-black/20 border border-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <p className="text-xs font-semibold text-slate-200">
                            Configuración del grid
                        </p>
                        <p className="text-[11px] text-slate-500">
                            {layout.order.length} activas • {layout.hidden.length} ocultas • {removedCards.length} eliminadas
                        </p>
                    </div>

                    <div className="mb-4">
                        <p className="text-[11px] font-semibold mb-2 text-slate-400">
                            Presets rápidos
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {(Object.keys(GRID_PRESETS) as PresetId[]).map((presetId) => {
                                const preset = GRID_PRESETS[presetId];
                                const active = activePresetId === presetId;
                                return (
                                    <button
                                        key={`preset-${presetId}`}
                                        onClick={() => applyPreset(presetId)}
                                        className={`rounded-xl px-3 py-2 text-left transition-all border ${active ? 'bg-teal-500/10 border-teal-500/30 text-teal-400' : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'}`}
                                    >
                                        <p className="text-xs font-semibold">{preset.name}</p>
                                        <p className={`text-[11px] mt-0.5 ${active ? 'text-teal-500' : 'text-slate-500'}`}>
                                            {preset.description}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                        {activePresetId === null && (
                            <p className="text-[11px] mt-2 text-slate-500">
                                Estás en vista personalizada.
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        {DEFAULT_ORDER.map((id) => {
                            const inGrid = layout.order.includes(id);
                            const isHidden = layout.hidden.includes(id);
                            const currentIndex = layout.order.indexOf(id);
                            return (
                                <div
                                    key={`config-${id}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 bg-white/5 border border-white/5"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-slate-200">{CARD_TITLES[id]}</p>
                                        <p className="text-[11px] text-slate-500">
                                            {!inGrid ? 'Eliminada del grid' : isHidden ? 'Oculta en dashboard' : `Visible en posición ${currentIndex + 1}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {inGrid ? (
                                            <>
                                                <button
                                                    onClick={() => moveCardInConfig(id, 'up')}
                                                    disabled={currentIndex <= 0}
                                                    className="p-1.5 rounded-lg disabled:opacity-35 disabled:cursor-not-allowed bg-white/10 hover:bg-white/20 text-slate-400"
                                                    title="Subir"
                                                >
                                                    <ChevronUp size={14} />
                                                </button>
                                                <button
                                                    onClick={() => moveCardInConfig(id, 'down')}
                                                    disabled={currentIndex < 0 || currentIndex >= layout.order.length - 1}
                                                    className="p-1.5 rounded-lg disabled:opacity-35 disabled:cursor-not-allowed bg-white/10 hover:bg-white/20 text-slate-400"
                                                    title="Bajar"
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                                <button
                                                    onClick={() => toggleVisibility(id)}
                                                    className={`p-1.5 rounded-lg transition-all ${isHidden ? 'bg-red-500/20 text-red-500' : 'bg-white/10 hover:bg-white/20 text-slate-400'}`}
                                                    title={isHidden ? 'Mostrar' : 'Ocultar'}
                                                >
                                                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                                <button
                                                    onClick={() => removeCard(id)}
                                                    disabled={layout.order.length <= 1}
                                                    className="p-1.5 rounded-lg disabled:opacity-35 disabled:cursor-not-allowed bg-red-500/20 hover:bg-red-500/30 text-red-500"
                                                    title="Eliminar del grid"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => restoreCard(id)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 transition-all border border-teal-500/20"
                                            >
                                                <Plus size={12} />
                                                Agregar al grid
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {isDragEnabled && (
                <div
                    className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-xs bg-teal-500/10 border border-teal-500/20 text-teal-400"
                >
                    <GripVertical size={14} />
                    Arrastrá para reordenar • Ojo para ocultar/mostrar • Basura para eliminar del grid
                </div>
            )}


            {/* Cards Grid */}
            <DndContext
                sensors={isDragEnabled ? sensors : undefined}
                autoScroll={{
                    enabled: true,
                    activator: AutoScrollActivator.Pointer,
                    acceleration: 16,
                    threshold: { x: 0.08, y: 0.22 },
                    interval: 4,
                }}
                measuring={{
                    droppable: {
                        strategy: MeasuringStrategy.Always,
                    },
                }}
                collisionDetection={collisionDetectionStrategy}
                onDragStart={isDragEnabled ? handleDragStart : undefined}
                onDragOver={isDragEnabled ? handleDragOver : undefined}
                onDragCancel={isDragEnabled ? handleDragCancel : undefined}
                onDragEnd={isDragEnabled ? handleDragEnd : undefined}
            >
                <SortableContext items={visibleCards} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {visibleCards.map(id => {
                            const card = cardData[id];
                            if (!card) return null;
                            return (
                                <SortableCard
                                    key={id}
                                    id={id}
                                    className={card.isGiant ? 'md:col-span-2' : ''}
                                    isEditing={isEditing}
                                    isDragEnabled={isDragEnabled}
                                    isDropTarget={overCardId === id && activeCardId !== id}
                                    isRecentlyDropped={recentlyDroppedCardId === id}
                                >
                                    <KpiCard
                                        {...card}
                                        isEditing={isEditing}
                                        isHidden={layout.hidden.includes(id)}
                                        canRemove={layout.order.length > 1}
                                        onToggleVisibility={toggleVisibility}
                                        onRemove={removeCard}
                                    />
                                </SortableCard>
                            );
                        })}
                    </div>
                </SortableContext>
                <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
                    {activeCardId && (
                        <div
                            className="rounded-2xl border px-4 py-3 backdrop-blur-xl"
                            style={{
                                minWidth: '260px',
                                maxWidth: '420px',
                                background: 'linear-gradient(145deg, hsla(230, 20%, 14%, 0.95), hsla(230, 18%, 10%, 0.92))',
                                borderColor: 'hsla(165, 100%, 42%, 0.35)',
                                boxShadow: '0 24px 50px -18px rgba(0,0,0,0.8), 0 0 0 1px hsla(165, 100%, 42%, 0.12)',
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="h-9 w-9 rounded-xl flex items-center justify-center"
                                    style={{ background: 'hsla(165, 100%, 42%, 0.16)', color: 'hsl(165 85% 55%)' }}
                                >
                                    <ActiveCardIcon size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate" style={{ color: 'hsl(210 20% 94%)' }}>
                                        {CARD_TITLES[activeCardId]}
                                    </p>
                                    <p className="text-[11px]" style={{ color: 'hsl(230 10% 52%)' }}>
                                        Soltá para reordenar
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
