'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
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
    Loader2,
} from 'lucide-react';
import { getOwnerDashboardStats, type OwnerDashboardStats } from '@/lib/dashboard';

const STORAGE_KEY = 'owner-dashboard-layout';

type CardId = 'total-pacientes' | 'primera-vez' | 'ingresos-mes' | 'egresos-mes' | 'en-financiacion' | 'deuda-total';

interface LayoutConfig {
    order: CardId[];
    hidden: CardId[];
}

const DEFAULT_ORDER: CardId[] = [
    'total-pacientes',
    'primera-vez',
    'ingresos-mes',
    'egresos-mes',
    'en-financiacion',
    'deuda-total',
];

function getLayout(): LayoutConfig {
    if (typeof window === 'undefined') return { order: DEFAULT_ORDER, hidden: [] };
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Ensure all cards are in the order (handle new cards added later)
            const allCards = new Set(DEFAULT_ORDER);
            const order = (parsed.order || []).filter((id: string) => allCards.has(id as CardId)) as CardId[];
            DEFAULT_ORDER.forEach(id => { if (!order.includes(id)) order.push(id); });
            return { order, hidden: parsed.hidden || [] };
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
}: {
    id: string;
    children: React.ReactNode;
    isEditing: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: !isEditing });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative">
            {isEditing && (
                <button
                    className="absolute top-2 left-2 z-10 p-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-all"
                    style={{ background: 'hsla(230, 15%, 25%, 0.8)', color: 'hsl(230, 10%, 60%)' }}
                    {...attributes}
                    {...listeners}
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
    isEditing: boolean;
    isHidden: boolean;
    onToggleVisibility: (id: CardId) => void;
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
    isEditing,
    isHidden,
    onToggleVisibility,
}: KpiCardProps) {
    const [expanded, setExpanded] = useState(false);

    if (isHidden && !isEditing) return null;

    return (
        <div
            className={`glass-card rounded-2xl p-6 transition-all duration-300 relative ${isGiant ? 'col-span-1 md:col-span-2' : ''
                } ${isHidden ? 'opacity-40' : ''} ${isEditing ? 'ring-1 ring-white/10' : ''}`}
            style={{
                background: isHidden
                    ? 'hsla(230, 15%, 12%, 0.5)'
                    : 'hsla(230, 15%, 12%, 0.6)',
            }}
        >
            {isEditing && (
                <button
                    onClick={() => onToggleVisibility(id)}
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-lg transition-all hover:scale-110"
                    style={{
                        background: isHidden ? 'hsla(0, 70%, 50%, 0.2)' : 'hsla(230, 15%, 25%, 0.8)',
                        color: isHidden ? 'hsl(0, 70%, 60%)' : 'hsl(230, 10%, 60%)',
                    }}
                    title={isHidden ? 'Mostrar' : 'Ocultar'}
                >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
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
                            className={`${isGiant ? 'text-base' : 'text-sm'} font-medium`}
                            style={{ color: 'hsl(230 10% 55%)' }}
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
                        <p className="text-xs mt-1.5" style={{ color: 'hsl(230 10% 45%)' }}>
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>

            {expandContent && !isHidden && (
                <div className="mt-3">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1 text-xs transition-colors"
                        style={{ color: 'hsl(230 10% 50%)' }}
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expanded ? 'Ocultar detalle' : 'Ver detalle'}
                    </button>
                    {expanded && (
                        <div
                            className="mt-2 rounded-xl p-3 max-h-48 overflow-y-auto"
                            style={{ background: 'hsla(230, 15%, 8%, 0.5)' }}
                        >
                            {expandContent}
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
    const [layout, setLayout] = useState<LayoutConfig>({ order: DEFAULT_ORDER, hidden: [] });
    const [isEditing, setIsEditing] = useState(false);

    const currentMonth = MONTH_NAMES[new Date().getMonth()];

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        setLayout(getLayout());
    }, []);

    useEffect(() => {
        async function load() {
            const data = await getOwnerDashboardStats();
            setStats(data);
            setLoading(false);
        }
        load();
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setLayout(prev => {
                const oldIndex = prev.order.indexOf(active.id as CardId);
                const newIndex = prev.order.indexOf(over.id as CardId);
                const newLayout = { ...prev, order: arrayMove(prev.order, oldIndex, newIndex) };
                saveLayout(newLayout);
                return newLayout;
            });
        }
    }, []);

    const toggleVisibility = useCallback((id: CardId) => {
        setLayout(prev => {
            const hidden = prev.hidden.includes(id)
                ? prev.hidden.filter(h => h !== id)
                : [...prev.hidden, id];
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
    }, []);

    if (loading) {
        return (
            <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="h-7 w-48 rounded-lg animate-pulse" style={{ background: 'hsl(230 15% 18%)' }} />
                        <div className="h-4 w-32 mt-2 rounded animate-pulse" style={{ background: 'hsl(230 15% 18%)' }} />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="glass-card rounded-2xl p-6 animate-pulse" style={{ height: i === 1 ? '140px' : '120px' }}>
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl" style={{ background: 'hsl(230 15% 18%)' }} />
                                <div className="space-y-2">
                                    <div className="h-4 w-24 rounded" style={{ background: 'hsl(230 15% 18%)' }} />
                                    <div className="h-8 w-20 rounded" style={{ background: 'hsl(230 15% 18%)' }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!stats) return null;

    const cardData: Record<CardId, Omit<KpiCardProps, 'isEditing' | 'isHidden' | 'onToggleVisibility'>> = {
        'total-pacientes': {
            id: 'total-pacientes',
            icon: Users,
            label: 'Pacientes Totales',
            value: stats.totalPacientes.toLocaleString(),
            subtitle: 'Pacientes activos registrados',
            gradient: 'linear-gradient(135deg, hsl(217 91% 60%), hsl(224 76% 48%))',
            iconBg: 'hsla(217, 91%, 60%, 0.15)',
            iconColor: 'hsl(217 91% 65%)',
            isGiant: true,
        },
        'primera-vez': {
            id: 'primera-vez',
            icon: UserPlus,
            label: '1era Vez',
            value: stats.primeraVezMes,
            badge: currentMonth,
            subtitle: 'Primera consulta real del mes',
            gradient: 'linear-gradient(135deg, hsl(165 100% 42%), hsl(140 70% 35%))',
            iconBg: 'hsla(165, 100%, 42%, 0.15)',
            iconColor: 'hsl(165 85% 50%)',
            isLarge: true,
            expandContent: stats.listaPrimeraVez.length > 0 ? (
                <ul className="space-y-1.5">
                    {stats.listaPrimeraVez.map((p, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs" style={{ color: 'hsl(210 20% 80%)' }}>
                            <span
                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                    background: 'hsla(165, 100%, 42%, 0.15)',
                                    color: 'hsl(165, 85%, 50%)',
                                }}
                            >
                                1era vez
                            </span>
                            <span className="font-medium">{p.nombre} {p.apellido}</span>
                            <span style={{ color: 'hsl(230 10% 40%)' }}>
                                {new Date(p.primera_consulta_fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : undefined,
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

    const visibleCards = layout.order.filter(id => !layout.hidden.includes(id) || isEditing);

    return (
        <div className="mb-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2
                        className="text-xl font-bold tracking-tight"
                        style={{ color: 'hsl(210 20% 95%)' }}
                    >
                        📊 Panel del Dueño
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'hsl(230 10% 45%)' }}>
                        {currentMonth} {new Date().getFullYear()} — Vista ejecutiva
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isEditing && (
                        <button
                            onClick={resetLayout}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                            style={{
                                background: 'hsla(230, 15%, 20%, 0.8)',
                                color: 'hsl(230, 10%, 60%)',
                                border: '1px solid hsla(230, 15%, 30%, 0.5)',
                            }}
                        >
                            <RotateCcw size={12} />
                            Restablecer
                        </button>
                    )}
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 ${isEditing ? 'ring-1' : ''
                            }`}
                        style={{
                            background: isEditing
                                ? 'hsla(165, 100%, 42%, 0.15)'
                                : 'hsla(230, 15%, 20%, 0.8)',
                            color: isEditing
                                ? 'hsl(165, 85%, 50%)'
                                : 'hsl(230, 10%, 60%)',
                            border: `1px solid ${isEditing ? 'hsla(165, 100%, 42%, 0.3)' : 'hsla(230, 15%, 30%, 0.5)'}`,
                        }}
                    >
                        <Settings2 size={12} />
                        {isEditing ? 'Listo' : 'Personalizar'}
                    </button>
                </div>
            </div>

            {isEditing && (
                <div
                    className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-xs"
                    style={{
                        background: 'hsla(217, 91%, 60%, 0.08)',
                        border: '1px solid hsla(217, 91%, 60%, 0.15)',
                        color: 'hsl(217 91% 70%)',
                    }}
                >
                    <GripVertical size={14} />
                    Arrastrá las tarjetas para reordenar • Usá el ojo 👁️ para ocultar/mostrar
                </div>
            )}

            {/* Cards Grid */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={visibleCards} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {visibleCards.map(id => {
                            const card = cardData[id];
                            if (!card) return null;
                            return (
                                <SortableCard key={id} id={id} isEditing={isEditing}>
                                    <KpiCard
                                        {...card}
                                        isEditing={isEditing}
                                        isHidden={layout.hidden.includes(id)}
                                        onToggleVisibility={toggleVisibility}
                                    />
                                </SortableCard>
                            );
                        })}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
