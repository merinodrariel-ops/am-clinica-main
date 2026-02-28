'use client';

import { DragEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Users,
    CheckCircle2,
    Circle,
    UserPlus,
    Stethoscope,
    Building2,
    FlaskConical,
    Sparkles,
    Wrench,
    Mail,
    Send,
    RefreshCw,
    Search,
    GripVertical,
    LayoutGrid,
    Rows3,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { getAllWorkers, sendAccessInvite, updateWorkerProfileAdmin } from '@/app/actions/worker-portal';
import { WorkerProfile, WorkerRole } from '@/types/worker-portal';
import NewWorkerModal from '@/components/admin/NewWorkerModal';
import { toast } from 'sonner';

const ROLE_ICONS: Record<string, ReactNode> = {
    dentist: <Stethoscope size={16} className="text-indigo-300" />,
    assistant: <Users size={16} className="text-cyan-300" />,
    admin: <Building2 size={16} className="text-violet-300" />,
    lab: <FlaskConical size={16} className="text-emerald-300" />,
    cleaning: <Sparkles size={16} className="text-sky-300" />,
    technician: <Wrench size={16} className="text-amber-300" />,
};

const ROLE_LABELS: Record<string, string> = {
    dentist: 'Odontólogos',
    assistant: 'Asistentes',
    technician: 'Técnicos',
    cleaning: 'Limpieza',
    admin: 'Administración',
    reception: 'Recepción',
    lab: 'Laboratorio',
    marketing: 'Marketing',
    other: 'Otros',
};

const ROLE_ORDER: WorkerRole[] = [
    'dentist',
    'assistant',
    'technician',
    'lab',
    'reception',
    'admin',
    'cleaning',
    'marketing',
    'other',
];

function normalizeRole(rol?: string | null): string {
    const value = (rol || '').trim().toLowerCase();
    if (!value) return 'other';

    if (value.includes('odont') || value.includes('dent')) return 'dentist';
    if (value.includes('asist')) return 'assistant';
    if (value.includes('tecn')) return 'technician';
    if (value.includes('limp')) return 'cleaning';
    if (value.includes('recep')) return 'reception';
    if (value.includes('laborat') || value === 'lab') return 'lab';
    if (value.includes('admin')) return 'admin';
    if (value.includes('market')) return 'marketing';
    return value;
}

function getRoleLabel(role: string): string {
    return ROLE_LABELS[role] || role.replace(/_/g, ' ');
}

function getRoleIcon(rol: string) {
    const key = normalizeRole(rol);
    return ROLE_ICONS[key] || <Users size={16} className="text-slate-400" />;
}

interface DocEntry {
    url?: string;
}

type DocMap = Record<string, DocEntry | undefined>;

function getDocCompliance(docs: unknown): number {
    if (!docs || typeof docs !== 'object') return 0;
    const docMap: DocMap = docs as DocMap;
    const required: (keyof DocMap)[] = ['dni_frente', 'dni_dorso', 'licencia', 'poliza'];
    const filled = required.filter((k) => {
        const entry = docMap[k];
        return entry != null && Boolean(entry.url);
    }).length;
    return Math.round((filled / required.length) * 100);
}

type AccessStatus = 'activo' | 'invitado' | 'sin_email';

function getAccessStatus(worker: WorkerProfile): AccessStatus {
    if (worker.user_id) return 'activo';
    if (worker.email) return 'invitado';
    return 'sin_email';
}

const ACCESS_BADGE: Record<AccessStatus, { label: string; className: string }> = {
    activo: { label: 'Portal activo', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    invitado: { label: 'Invitado', className: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    sin_email: { label: 'Sin acceso', className: 'bg-slate-800/70 text-slate-400 border-slate-700' },
};

const STAFF_VIEW_KEY = 'am.staff.view-mode';
const STAFF_ROLE_ORDER_KEY = 'am.staff.role-order';
const STAFF_GROUP_KEY = 'am.staff.group-mode';

type GroupMode = 'role' | 'company' | 'access' | 'compliance';

type InlineDraft = {
    email: string;
    rol: string;
    activo: boolean;
};

export default function StaffListPage() {
    const [workers, setWorkers] = useState<WorkerProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [sendingInvite, setSendingInvite] = useState<string | null>(null);
    const [updatingRole, setUpdatingRole] = useState<string | null>(null);
    const [draggingWorkerId, setDraggingWorkerId] = useState<string | null>(null);
    const [dragOverWorkerRole, setDragOverWorkerRole] = useState<string | null>(null);
    const [draggingRoleColumn, setDraggingRoleColumn] = useState<string | null>(null);
    const [dragOverRoleColumn, setDragOverRoleColumn] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [onlyActive, setOnlyActive] = useState(false);
    const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
    const [roleOrderPreference, setRoleOrderPreference] = useState<string[]>([]);
    const [groupMode, setGroupMode] = useState<GroupMode>('role');
    const [inlineDrafts, setInlineDrafts] = useState<Record<string, InlineDraft>>({});
    const [savingInlineId, setSavingInlineId] = useState<string | null>(null);

    const loadWorkers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAllWorkers();
            setWorkers(data);
        } catch (err) {
            console.error('Error loading workers:', err);
            toast.error('No se pudo cargar el módulo de prestadores');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadWorkers();
    }, [loadWorkers]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const savedView = window.localStorage.getItem(STAFF_VIEW_KEY);
        if (savedView === 'board' || savedView === 'table') {
            setViewMode(savedView);
        }

        const savedOrder = window.localStorage.getItem(STAFF_ROLE_ORDER_KEY);
        if (savedOrder) {
            try {
                const parsed = JSON.parse(savedOrder);
                if (Array.isArray(parsed)) {
                    setRoleOrderPreference(parsed.filter((item): item is string => typeof item === 'string'));
                }
            } catch {
                // ignore malformed persisted preference
            }
        }

        const savedGroup = window.localStorage.getItem(STAFF_GROUP_KEY);
        if (savedGroup === 'role' || savedGroup === 'company' || savedGroup === 'access' || savedGroup === 'compliance') {
            setGroupMode(savedGroup);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STAFF_VIEW_KEY, viewMode);
    }, [viewMode]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STAFF_ROLE_ORDER_KEY, JSON.stringify(roleOrderPreference));
    }, [roleOrderPreference]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(STAFF_GROUP_KEY, groupMode);
    }, [groupMode]);

    useEffect(() => {
        const next: Record<string, InlineDraft> = {};
        workers.forEach((worker) => {
            next[worker.id] = {
                email: worker.email || '',
                rol: normalizeRole(worker.rol),
                activo: worker.activo !== false,
            };
        });
        setInlineDrafts(next);
    }, [workers]);

    async function handleSendInvite(e: React.MouseEvent, workerId: string) {
        e.preventDefault();
        e.stopPropagation();
        setSendingInvite(workerId);
        try {
            await sendAccessInvite(workerId);
            toast.success('Invitación enviada correctamente');
            await loadWorkers();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al enviar invitación');
        } finally {
            setSendingInvite(null);
        }
    }

    const filteredWorkers = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return workers.filter((worker) => {
            if (onlyActive && worker.activo === false) return false;
            if (!q) return true;

            const fullName = `${worker.nombre || ''} ${worker.apellido || ''}`.toLowerCase();
            const rol = (worker.rol || '').toLowerCase();
            const mail = (worker.email || '').toLowerCase();
            const area = (worker.area || '').toLowerCase();

            return (
                fullName.includes(q) ||
                rol.includes(q) ||
                mail.includes(q) ||
                area.includes(q)
            );
        });
    }, [onlyActive, searchTerm, workers]);

    const activeCount = workers.filter((w) => w.activo !== false).length;
    const withAccess = workers.filter((w) => w.user_id).length;

    const groupedByRole = useMemo(() => {
        const gMap = new Map<string, WorkerProfile[]>();

        filteredWorkers.forEach((worker) => {
            const roleKey = normalizeRole(worker.rol);
            if (!gMap.has(roleKey)) gMap.set(roleKey, []);
            gMap.get(roleKey)!.push(worker);
        });

        const grouped: Record<string, WorkerProfile[]> = Object.fromEntries(gMap);

        return {
            grouped,
            dynamicRoles: Array.from(gMap.keys()).sort(),
        };
    }, [filteredWorkers]);

    const orderedRoles = useMemo(() => {
        const dynamicRoles = groupedByRole.dynamicRoles;
        const baseOrder = [
            ...ROLE_ORDER.filter((r) => dynamicRoles.includes(r)),
            ...dynamicRoles.filter((r) => !ROLE_ORDER.includes(r as WorkerRole)),
        ];

        if (!roleOrderPreference.length) return baseOrder;

        const preferred = roleOrderPreference.filter((role) => baseOrder.includes(role));
        const missing = baseOrder.filter((role) => !preferred.includes(role));
        return [...preferred, ...missing];
    }, [groupedByRole.dynamicRoles, roleOrderPreference]);

    const tableRows = useMemo(() => {
        return [...filteredWorkers].sort((a, b) => {
            const roleA = normalizeRole(a.rol);
            const roleB = normalizeRole(b.rol);
            const roleIdxA = orderedRoles.indexOf(roleA);
            const roleIdxB = orderedRoles.indexOf(roleB);

            if (roleIdxA !== roleIdxB) return roleIdxA - roleIdxB;

            const nameA = `${a.nombre || ''} ${a.apellido || ''}`.trim().toLowerCase();
            const nameB = `${b.nombre || ''} ${b.apellido || ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [filteredWorkers, orderedRoles]);

    function onDragStart(workerId: string) {
        setDraggingWorkerId(workerId);
    }

    function onDragEnd() {
        setDraggingWorkerId(null);
        setDragOverWorkerRole(null);
    }

    function onDragOverRole(e: DragEvent<HTMLDivElement>, role: string) {
        e.preventDefault();
        setDragOverWorkerRole(role);
    }

    function onRoleColumnDragStart(role: string) {
        setDraggingRoleColumn(role);
    }

    function onRoleColumnDragOver(e: DragEvent<HTMLDivElement>, role: string) {
        e.preventDefault();
        if (!draggingRoleColumn) return;
        setDragOverRoleColumn(role);
    }

    function onRoleColumnDragEnd() {
        setDraggingRoleColumn(null);
        setDragOverRoleColumn(null);
    }

    function onRoleColumnDrop(e: DragEvent<HTMLDivElement>, role: string) {
        e.preventDefault();
        if (!draggingRoleColumn || draggingRoleColumn === role) {
            onRoleColumnDragEnd();
            return;
        }

        const fromIndex = orderedRoles.indexOf(draggingRoleColumn);
        const toIndex = orderedRoles.indexOf(role);

        if (fromIndex < 0 || toIndex < 0) {
            onRoleColumnDragEnd();
            return;
        }

        const next = [...orderedRoles];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        setRoleOrderPreference(next);
        onRoleColumnDragEnd();
    }

    async function onDropRole(e: DragEvent<HTMLDivElement>, role: string) {
        e.preventDefault();
        if (!draggingWorkerId) return;

        const targetRole = role;
        const current = workers.find((w) => w.id === draggingWorkerId);
        if (!current) {
            onDragEnd();
            return;
        }

        const currentRole = normalizeRole(current.rol);
        if (currentRole === targetRole) {
            onDragEnd();
            return;
        }

        const prevWorkers = workers;
        setWorkers((prev) =>
            prev.map((worker) =>
                worker.id === draggingWorkerId
                    ? { ...worker, rol: targetRole }
                    : worker
            )
        );

        setUpdatingRole(draggingWorkerId);
        try {
            await updateWorkerProfileAdmin(draggingWorkerId, { rol: targetRole });
            toast.success(`Movido a ${getRoleLabel(targetRole)}`);
        } catch (error: unknown) {
            setWorkers(prevWorkers);
            toast.error(error instanceof Error ? error.message : 'No se pudo mover el prestador');
        } finally {
            setUpdatingRole(null);
            onDragEnd();
        }
    }

    function getComplianceBucket(worker: WorkerProfile): string {
        const c = getDocCompliance(worker.documents);
        if (c >= 100) return 'complete';
        if (c >= 50) return 'mid';
        if (c > 0) return 'low';
        return 'none';
    }

    const roleOptions = useMemo(() => {
        const next = new Set<string>([...ROLE_ORDER, ...groupedByRole.dynamicRoles]);
        return Array.from(next);
    }, [groupedByRole.dynamicRoles]);

    const boardColumns = useMemo(() => {
        if (groupMode === 'role') {
            return orderedRoles.map((role) => ({
                key: role,
                label: getRoleLabel(role),
                icon: getRoleIcon(role),
                workers: groupedByRole.grouped[role] || [],
                isRoleColumn: true,
            }));
        }

        if (groupMode === 'company') {
            const companyMap = new Map<string, WorkerProfile[]>();
            filteredWorkers.forEach((worker) => {
                const key = (worker.empresa_prestadora_nombre || 'Sin empresa').trim();
                if (!companyMap.has(key)) companyMap.set(key, []);
                companyMap.get(key)!.push(worker);
            });
            return Array.from(companyMap.keys())
                .sort((a, b) => a.localeCompare(b))
                .map((key) => ({
                    key,
                    label: key,
                    icon: <Building2 size={16} className="text-cyan-300" />,
                    workers: companyMap.get(key) ?? [],
                    isRoleColumn: false,
                }));
        }

        if (groupMode === 'access') {
            const order: AccessStatus[] = ['activo', 'invitado', 'sin_email'];
            return order.map((status) => ({
                key: status,
                label: ACCESS_BADGE[status].label,
                icon: <Users size={16} className="text-indigo-300" />,
                workers: filteredWorkers.filter((worker) => getAccessStatus(worker) === status),
                isRoleColumn: false,
            }));
        }

        const complianceOrder = ['complete', 'mid', 'low', 'none'];
        const complianceLabel: Record<string, string> = {
            complete: 'Docs completos',
            mid: 'Docs intermedios',
            low: 'Docs bajos',
            none: 'Sin documentos',
        };
        return complianceOrder.map((bucket) => ({
            key: bucket,
            label: complianceLabel[bucket],
            icon: <CheckCircle2 size={16} className="text-emerald-300" />,
            workers: filteredWorkers.filter((worker) => getComplianceBucket(worker) === bucket),
            isRoleColumn: false,
        }));
    }, [filteredWorkers, groupMode, groupedByRole.grouped, orderedRoles]);

    function setInlineDraft(workerId: string, patch: Partial<InlineDraft>) {
        setInlineDrafts((prev) => ({
            ...prev,
            [workerId]: {
                email: prev[workerId]?.email || '',
                rol: prev[workerId]?.rol || 'other',
                activo: prev[workerId]?.activo ?? true,
                ...patch,
            },
        }));
    }

    function isInlineDirty(worker: WorkerProfile, draft: InlineDraft | undefined): boolean {
        if (!draft) return false;
        const sameEmail = draft.email.trim() === (worker.email || '').trim();
        const sameRole = draft.rol === normalizeRole(worker.rol);
        const sameActive = draft.activo === (worker.activo !== false);
        return !(sameEmail && sameRole && sameActive);
    }

    async function saveInline(worker: WorkerProfile) {
        const draft = inlineDrafts[worker.id];
        if (!draft) return;

        if (!isInlineDirty(worker, draft)) return;

        setSavingInlineId(worker.id);
        try {
            await updateWorkerProfileAdmin(worker.id, {
                email: draft.email.trim(),
                rol: draft.rol,
                activo: draft.activo,
            });

            setWorkers((prev) =>
                prev.map((item) =>
                    item.id === worker.id
                        ? {
                            ...item,
                            email: draft.email.trim(),
                            rol: draft.rol,
                            activo: draft.activo,
                        }
                        : item
                )
            );

            toast.success('Cambios rápidos guardados');
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'No se pudieron guardar los cambios');
        } finally {
            setSavingInlineId(null);
        }
    }

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 pb-16 animate-in fade-in duration-500">
            <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 p-6 md:p-8">
                <div className="absolute -top-24 right-0 h-60 w-60 rounded-full bg-indigo-500/20 blur-3xl" />
                <div className="absolute -bottom-24 left-0 h-60 w-60 rounded-full bg-cyan-500/15 blur-3xl" />

                <div className="relative flex flex-col xl:flex-row xl:items-end justify-between gap-6">
                    <div>
                        <p className="text-xs font-bold tracking-[0.24em] text-indigo-300/80 uppercase mb-2">Staff board</p>
                        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Prestadores</h1>
                        <p className="text-slate-300 mt-2 max-w-2xl">
                            Vista Kanban con drag &amp; drop: arrastrá tarjetas entre roles para reorganizar el staff sin fricción.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={loadWorkers}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                            title="Actualizar"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            Actualizar
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/25"
                        >
                            <UserPlus size={17} />
                            Nuevo prestador
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-2xl font-black text-white">{workers.length}</p>
                    <p className="text-[11px] text-slate-500 uppercase tracking-[0.14em] font-semibold mt-1">Total staff</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                    <p className="text-2xl font-black text-emerald-300">{activeCount}</p>
                    <p className="text-[11px] text-slate-500 uppercase tracking-[0.14em] font-semibold mt-1">Activos</p>
                </div>
                <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4">
                    <p className="text-2xl font-black text-indigo-300">{withAccess}</p>
                    <p className="text-[11px] text-slate-500 uppercase tracking-[0.14em] font-semibold mt-1">Portal activo</p>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nombre, rol, área o email..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500"
                        />
                    </div>
                    <button
                        onClick={() => setOnlyActive((v) => !v)}
                        className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${onlyActive
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                : 'bg-slate-950 border-slate-700 text-slate-300 hover:text-white'
                            }`}
                    >
                        {onlyActive ? 'Mostrando solo activos' : 'Mostrar solo activos'}
                    </button>
                    <div className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950 p-1">
                        <button
                            onClick={() => setViewMode('board')}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                                }`}
                        >
                            <LayoutGrid size={13} />
                            Board
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
                                }`}
                        >
                            <Rows3 size={13} />
                            Tabla
                        </button>
                    </div>
                    <div className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950 p-1">
                        {([
                            ['role', 'Por rol'],
                            ['company', 'Por empresa'],
                            ['access', 'Por acceso'],
                            ['compliance', 'Por docs'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => setGroupMode(value)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${groupMode === value ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:text-white'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="text-xs text-slate-500 lg:ml-auto">
                        {filteredWorkers.length} resultados · {groupMode === 'role' ? 'Drag de tarjetas/columnas habilitado' : 'Drag disponible al agrupar por rol'}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24 text-slate-500 text-sm">Cargando tablero...</div>
            ) : orderedRoles.length === 0 ? (
                <div className="text-center py-24 border border-dashed border-slate-800 rounded-3xl">
                    <Users size={40} className="mx-auto text-slate-700 mb-4" />
                    <p className="text-slate-500 mb-4">No hay prestadores para los filtros actuales.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl transition-all"
                    >
                        <UserPlus size={17} />
                        Agregar prestador
                    </button>
                </div>
            ) : viewMode === 'table' ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-950/80 border-b border-slate-800">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Prestador</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Rol</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Email</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Activo</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Portal</th>
                                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Docs</th>
                                    <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-slate-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/70">
                                {tableRows.map((worker) => {
                                    const compliance = getDocCompliance(worker.documents);
                                    const initials = `${worker.nombre?.[0] || ''}${worker.apellido?.[0] || ''}`.toUpperCase();
                                    const accessStatus = getAccessStatus(worker);
                                    const badge = ACCESS_BADGE[accessStatus];
                                    const draft = inlineDrafts[worker.id];
                                    const role = draft?.rol || normalizeRole(worker.rol);
                                    const dirty = isInlineDirty(worker, draft);
                                    const isSavingInline = savingInlineId === worker.id;

                                    return (
                                        <tr key={worker.id} className="hover:bg-slate-950/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-black text-sm overflow-hidden shrink-0">
                                                        {worker.foto_url ? (
                                                            <img src={worker.foto_url} alt={worker.nombre} className="w-full h-full object-cover" />
                                                        ) : initials || '?'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-white truncate">{worker.nombre} {worker.apellido}</p>
                                                        <p className="text-xs text-slate-500 truncate">{worker.email || 'Sin email'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <div className="h-7 w-7 rounded-lg border border-slate-700 bg-slate-900 flex items-center justify-center">
                                                        {getRoleIcon(role)}
                                                    </div>
                                                    <select
                                                        value={role}
                                                        onChange={(e) => setInlineDraft(worker.id, { rol: e.target.value })}
                                                        className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                                                    >
                                                        {roleOptions.map((option) => (
                                                            <option key={option} value={option}>{getRoleLabel(option)}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    value={draft?.email || ''}
                                                    onChange={(e) => setInlineDraft(worker.id, { email: e.target.value })}
                                                    className="w-48 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                                                    placeholder="Sin email"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => setInlineDraft(worker.id, { activo: !(draft?.activo ?? (worker.activo !== false)) })}
                                                    className={`inline-flex items-center gap-2 px-2 py-1 rounded-full border text-xs font-semibold ${(draft?.activo ?? (worker.activo !== false))
                                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                                        }`}
                                                >
                                                    {(draft?.activo ?? (worker.activo !== false)) ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                                                    {(draft?.activo ?? (worker.activo !== false)) ? 'Activo' : 'Inactivo'}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${badge.className}`}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="w-32">
                                                    <div className="flex justify-between text-[11px] mb-1">
                                                        <span className="text-slate-500">Compliance</span>
                                                        <span className="text-slate-300">{compliance}%</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                                        <div
                                                            className={`h-full ${compliance >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                            style={{ width: `${compliance}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-2">
                                                    <Link
                                                        href={`/admin/staff/${worker.id}`}
                                                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:text-white hover:border-slate-600"
                                                    >
                                                        Abrir ficha
                                                    </Link>
                                                    {worker.email && !worker.user_id && (
                                                        <button
                                                            onClick={(e) => handleSendInvite(e, worker.id)}
                                                            disabled={sendingInvite === worker.id}
                                                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
                                                        >
                                                            {sendingInvite === worker.id ? 'Enviando...' : 'Invitar'}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => saveInline(worker)}
                                                        disabled={!dirty || isSavingInline}
                                                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-40"
                                                    >
                                                        {isSavingInline ? 'Guardando...' : 'Guardar'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="overflow-x-auto pb-2">
                    <motion.div layout className="flex items-start gap-4 min-w-max">
                        <AnimatePresence initial={false}>
                            {boardColumns.map((column) => {
                                const isRoleColumn = groupMode === 'role' && column.isRoleColumn;
                                const isDropTarget = isRoleColumn && dragOverWorkerRole === column.key;
                                const isRoleDropTarget = isRoleColumn && dragOverRoleColumn === column.key;
                                const isRoleDragging = isRoleColumn && draggingRoleColumn === column.key;

                                return (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, y: 14 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 8 }}
                                        transition={{ duration: 0.2 }}
                                        key={column.key}
                                        draggable={isRoleColumn}
                                        onDragStart={() => isRoleColumn && onRoleColumnDragStart(column.key)}
                                        onDragEnd={() => isRoleColumn && onRoleColumnDragEnd()}
                                        onDragOver={(e) => {
                                            if (!isRoleColumn) return;
                                            onRoleColumnDragOver(e, column.key);
                                            onDragOverRole(e, column.key);
                                        }}
                                        onDrop={(e) => {
                                            if (!isRoleColumn) return;
                                            onRoleColumnDrop(e, column.key);
                                            onDropRole(e, column.key);
                                        }}
                                        className={`w-[350px] rounded-2xl border p-3 transition-all ${isRoleDragging ? 'opacity-40 scale-[0.98]' : ''
                                            } ${isDropTarget
                                                ? 'border-indigo-500 bg-indigo-500/10'
                                                : isRoleDropTarget
                                                    ? 'border-cyan-500 bg-cyan-500/10'
                                                    : 'border-slate-800 bg-slate-900/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-3 px-1">
                                            {isRoleColumn && <GripVertical size={14} className="text-slate-600" />}
                                            <div className="h-7 w-7 rounded-lg border border-slate-700 bg-slate-900 flex items-center justify-center">
                                                {column.icon}
                                            </div>
                                            <h2 className="text-sm font-bold text-white truncate">{column.label}</h2>
                                            <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                                                {column.workers.length}
                                            </span>
                                        </div>

                                        <motion.div layout className="space-y-3 min-h-[140px]">
                                            <AnimatePresence initial={false}>
                                                {column.workers.map((worker) => {
                                                    const compliance = getDocCompliance(worker.documents);
                                                    const initials = `${worker.nombre?.[0] || ''}${worker.apellido?.[0] || ''}`.toUpperCase();
                                                    const accessStatus = getAccessStatus(worker);
                                                    const badge = ACCESS_BADGE[accessStatus];
                                                    const isDragging = draggingWorkerId === worker.id;
                                                    const isUpdating = updatingRole === worker.id;

                                                    return (
                                                        <motion.div
                                                            layout
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: 10 }}
                                                            key={worker.id}
                                                            draggable={!isUpdating && isRoleColumn}
                                                            onDragStart={(e) => {
                                                                if (!isRoleColumn) return;
                                                                e.stopPropagation();
                                                                onDragStart(worker.id);
                                                            }}
                                                            onDragEnd={onDragEnd}
                                                            className={`group rounded-xl border border-slate-800 bg-slate-950/60 p-3 transition ${isDragging ? 'opacity-40 scale-[0.98]' : 'hover:border-slate-700 hover:bg-slate-950'
                                                                }`}
                                                        >
                                                            <div className="flex items-start gap-3">
                                                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-black text-sm overflow-hidden shrink-0">
                                                                    {worker.foto_url ? (
                                                                        <img src={worker.foto_url} alt={worker.nombre} className="w-full h-full object-cover" />
                                                                    ) : initials || '?'}
                                                                </div>

                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="font-semibold text-sm text-white truncate">
                                                                            {worker.nombre} {worker.apellido}
                                                                        </p>
                                                                        {isRoleColumn && <GripVertical size={13} className="text-slate-600 shrink-0" />}
                                                                    </div>
                                                                    <p className="text-[10px] text-indigo-300 uppercase tracking-[0.14em] font-bold truncate mt-0.5">
                                                                        {worker.especialidad || worker.rol || 'Sin rol'}
                                                                    </p>
                                                                    {worker.email && (
                                                                        <p className="text-[11px] text-slate-500 truncate mt-1 flex items-center gap-1.5">
                                                                            <Mail size={10} />
                                                                            {worker.email}
                                                                        </p>
                                                                    )}
                                                                </div>

                                                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${worker.activo !== false
                                                                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                                                        : 'bg-slate-800 text-slate-500 border-slate-700'
                                                                    }`}>
                                                                    {worker.activo !== false ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                                                                    {worker.activo !== false ? 'Activo' : 'Inactivo'}
                                                                </div>
                                                            </div>

                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}>
                                                                    {badge.label}
                                                                </span>
                                                                {worker.documento && (
                                                                    <span className="text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                                                                        DNI {worker.documento}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="mt-3 flex justify-between items-center text-[10px] font-bold">
                                                                <span className="text-slate-600 uppercase tracking-wider">Docs</span>
                                                                <span className={
                                                                    compliance >= 100
                                                                        ? 'text-emerald-300'
                                                                        : compliance > 0
                                                                            ? 'text-amber-300'
                                                                            : 'text-slate-600'
                                                                }>
                                                                    {compliance}%
                                                                </span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${compliance >= 100 ? 'bg-emerald-500' : 'bg-amber-500'
                                                                        }`}
                                                                    style={{ width: `${compliance}%` }}
                                                                />
                                                            </div>

                                                            <div className="mt-3 grid grid-cols-2 gap-2">
                                                                <Link
                                                                    href={`/admin/staff/${worker.id}`}
                                                                    className="text-center py-1.5 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:text-white hover:border-slate-600 transition-colors"
                                                                >
                                                                    Abrir ficha
                                                                </Link>

                                                                {worker.email && !worker.user_id ? (
                                                                    <button
                                                                        onClick={(e) => handleSendInvite(e, worker.id)}
                                                                        disabled={sendingInvite === worker.id}
                                                                        className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
                                                                    >
                                                                        {sendingInvite === worker.id
                                                                            ? <span className="animate-pulse">Enviando</span>
                                                                            : <><Send size={11} /> Invitar</>}
                                                                    </button>
                                                                ) : (
                                                                    <span className="inline-flex items-center justify-center py-1.5 text-[11px] font-semibold rounded-lg border border-slate-800 text-slate-500">
                                                                        {isUpdating
                                                                            ? 'Moviendo...'
                                                                            : isRoleColumn
                                                                                ? 'Arrastrá para mover rol'
                                                                                : 'Vista agrupada'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </motion.div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </motion.div>
                </div>
            )}

            {showModal && (
                <NewWorkerModal
                    onClose={() => setShowModal(false)}
                    onCreated={loadWorkers}
                />
            )}
        </div>
    );
}
