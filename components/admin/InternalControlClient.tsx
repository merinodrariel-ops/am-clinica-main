'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
    AlertTriangle,
    CheckCircle2,
    History,
    Lock,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    TimerReset,
    UserCog,
    Workflow,
} from 'lucide-react';
import { createAccessGrant, revokeAccessGrant, updateInternalUserAccess, type BlackBoxEvent, type ControlAccessGrant, type ControlUser } from '@/app/actions/control-interno';
import { MODULE_DEFINITIONS, getCategoryDefault } from '@/lib/access-overrides';

type Tab = 'overview' | 'users' | 'grants' | 'blackbox';

const SECURITY_FLOWS = [
    { title: 'Alta de personal', status: 'Activo', detail: 'Invitar, asignar rol, revisar módulos y activar cuenta.', steps: ['Identidad', 'Rol', 'Permisos', 'Activación'] },
    { title: 'Acceso sensible', status: 'En uso', detail: 'Caja, pacientes, staff y emails quedan sujetos a rol y auditoría.', steps: ['Sesión', 'Política', 'Acción', 'Registro'] },
    { title: 'Acceso temporal', status: 'Nuevo', detail: 'Otorgar un módulo por una ventana limitada con motivo obligatorio.', steps: ['Solicitar', 'Vencer', 'Revocar', 'Auditar'] },
    { title: 'Lockdown de cuenta', status: 'Activo', detail: 'Apagar una cuenta revoca el acceso en Auth y conserva la trazabilidad.', steps: ['Detectar', 'Bloquear', 'Revisar', 'Rehabilitar'] },
];

const CATEGORY_OPTIONS = [
    { value: 'owner', label: 'Owner' },
    { value: 'admin', label: 'Admin' },
    { value: 'developer', label: 'Developer' },
    { value: 'reception', label: 'Recepción' },
    { value: 'asistente', label: 'Asistente' },
    { value: 'laboratorio', label: 'Laboratorio' },
    { value: 'odontologo', label: 'Odontólogo' },
    { value: 'recaptacion', label: 'Recaptación' },
    { value: 'pricing_manager', label: 'Gestor de precios' },
    { value: 'partner_viewer', label: 'Solo lectura' },
];

const LEVEL_OPTIONS = [
    { value: 'inherit', label: 'Según rol' },
    { value: 'none', label: 'Sin acceso' },
    { value: 'read', label: 'Lectura' },
    { value: 'edit', label: 'Edición' },
];

function formatDate(value: string | null) {
    if (!value) return 'Nunca';
    return new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(value));
}

function actionLabel(action: string) {
    return action
        .replace(/_/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function userMatches(user: ControlUser, query: string) {
    const text = `${user.full_name} ${user.email} ${user.categoria} ${user.estado}`.toLowerCase();
    return text.includes(query.toLowerCase());
}

function eventMatches(event: BlackBoxEvent, query: string) {
    const metadata = event.metadata ? JSON.stringify(event.metadata) : '';
    const text = `${event.user_email || ''} ${event.categoria || ''} ${event.action} ${event.table_name} ${event.record_id || ''} ${metadata}`.toLowerCase();
    return text.includes(query.toLowerCase());
}

export default function InternalControlClient({ initialUsers, initialEvents, initialGrants }: {
    initialUsers: ControlUser[];
    initialEvents: BlackBoxEvent[];
    initialGrants: ControlAccessGrant[];
}) {
    const [tab, setTab] = useState<Tab>('overview');
    const [users, setUsers] = useState(initialUsers);
    const [grants, setGrants] = useState(initialGrants);
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState(initialUsers[0]?.id || '');
    const [isPending, startTransition] = useTransition();
    const [grantModule, setGrantModule] = useState<string>(MODULE_DEFINITIONS[0]?.key || 'agenda');
    const [grantLevel, setGrantLevel] = useState<'read' | 'edit'>('read');
    const [grantDuration, setGrantDuration] = useState('24');
    const [grantReason, setGrantReason] = useState('');

    const selectedUser = users.find(user => user.id === selectedId) || users[0] || null;
    const filteredUsers = useMemo(() => users.filter(user => userMatches(user, query)), [users, query]);
    const filteredEvents = useMemo(() => initialEvents.filter(event => eventMatches(event, query)), [initialEvents, query]);
    const sensitiveUsers = users.filter(user => user.sensitive_access.length > 0).length;
    const inactiveUsers = users.filter(user => !user.is_active || user.estado !== 'activo').length;
    const activeGrants = grants.filter(grant => !grant.revoked_at && new Date(grant.expires_at) > new Date()).length;

    const updateSelectedUser = (patch: Partial<ControlUser>) => {
        if (!selectedUser) return;
        setUsers(prev => prev.map(user => user.id === selectedUser.id ? { ...user, ...patch } : user));
    };

    const updateOverride = (moduleKey: string, value: string) => {
        if (!selectedUser) return;

        const nextOverrides = { ...(selectedUser.access_overrides || {}) } as Record<string, 'read' | 'edit' | 'none'>;
        if (value === 'inherit') {
            delete nextOverrides[moduleKey];
        } else if (value === 'read' || value === 'edit' || value === 'none') {
            nextOverrides[moduleKey] = value;
        }

        updateSelectedUser({ access_overrides: Object.keys(nextOverrides).length ? nextOverrides : null });
    };

    const saveSelected = () => {
        if (!selectedUser) return;

        startTransition(async () => {
            const result = await updateInternalUserAccess({
                targetUserId: selectedUser.id,
                categoria: selectedUser.categoria,
                is_active: selectedUser.is_active,
                access_overrides: selectedUser.access_overrides || {},
            });

            if (!result.success) {
                toast.error(result.error || 'No se pudieron guardar los permisos');
                return;
            }

            toast.success('Permisos actualizados y registrados en caja negra');
        });
    };

    const createGrant = () => {
        if (!selectedUser) return;
        const expiresAt = new Date(Date.now() + Number(grantDuration) * 60 * 60 * 1000).toISOString();
        startTransition(async () => {
            const result = await createAccessGrant({
                targetUserId: selectedUser.id,
                moduleKey: grantModule,
                accessLevel: grantLevel,
                reason: grantReason,
                expiresAt,
            });
            if (!result.success) {
                toast.error(result.error || 'No se pudo crear el acceso temporal');
                return;
            }
            toast.success('Acceso temporal creado y auditado');
            window.location.reload();
        });
    };

    const revokeGrant = (grantId: string) => {
        startTransition(async () => {
            const result = await revokeAccessGrant(grantId);
            if (!result.success) {
                toast.error(result.error || 'No se pudo revocar el acceso');
                return;
            }
            setGrants(prev => prev.map(grant => grant.id === grantId ? { ...grant, revoked_at: new Date().toISOString() } : grant));
            toast.success('Acceso temporal revocado');
        });
    };

    return (
        <div className="min-h-screen p-6 md:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                            <ShieldCheck size={14} />
                            Centro de acceso y seguridad
                        </div>
                        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-4xl">
                            Seguridad, autorizaciones y flows
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                            Una consola operativa para revisar identidades, permisos, accesos temporales, flujos y trazabilidad.
                        </p>
                    </div>

                    <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                    >
                        <RefreshCw size={16} />
                        Refrescar
                    </button>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                    <div className="glass-card p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Usuarios</p>
                        <p className="mt-2 text-3xl font-bold text-white">{users.length}</p>
                        <p className="mt-1 text-xs text-zinc-400">Perfiles internos cargados</p>
                    </div>
                    <div className="glass-card p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Acceso sensible</p>
                        <p className="mt-2 text-3xl font-bold text-amber-300">{sensitiveUsers}</p>
                        <p className="mt-1 text-xs text-zinc-400">Usuarios con caja, pacientes, staff o emails</p>
                    </div>
                    <div className="glass-card p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Inactivos</p>
                        <p className="mt-2 text-3xl font-bold text-rose-300">{inactiveUsers}</p>
                        <p className="mt-1 text-xs text-zinc-400">Usuarios apagados o no activos</p>
                    </div>
                    <div className="glass-card p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Accesos temporales</p>
                        <p className="mt-2 text-3xl font-bold text-sky-300">{activeGrants}</p>
                        <p className="mt-1 text-xs text-zinc-400">Con vencimiento y motivo obligatorio</p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex rounded-xl bg-black/20 p-1">
                        <button
                            onClick={() => setTab('overview')}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'overview' ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <Workflow size={16} />
                            Flows
                        </button>
                        <button
                            onClick={() => setTab('users')}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'users' ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <UserCog size={16} />
                            Usuarios y permisos
                        </button>
                        <button
                            onClick={() => setTab('grants')}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'grants' ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <TimerReset size={16} />
                            Temporales
                        </button>
                        <button
                            onClick={() => setTab('blackbox')}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'blackbox' ? 'bg-emerald-400 text-black' : 'text-zinc-400 hover:text-white'}`}
                        >
                            <History size={16} />
                            Caja negra
                        </button>
                    </div>

                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar..."
                            className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/60"
                        />
                    </div>
                </div>

                {tab === 'overview' && (
                    <div className="grid gap-4 md:grid-cols-2">
                        {SECURITY_FLOWS.map(flow => (
                            <div key={flow.title} className="glass-card p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-lg font-bold text-white">{flow.title}</p>
                                        <p className="mt-1 text-sm text-zinc-400">{flow.detail}</p>
                                    </div>
                                    <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-300">{flow.status}</span>
                                </div>
                                <div className="mt-5 grid grid-cols-4 gap-2">
                                    {flow.steps.map((step, index) => (
                                        <div key={step} className="rounded-xl border border-white/10 bg-black/20 p-2 text-center">
                                            <span className="text-[10px] text-zinc-600">0{index + 1}</span>
                                            <p className="mt-1 text-xs font-semibold text-zinc-200">{step}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div className="glass-card border-sky-400/20 bg-sky-400/[0.04] p-5 md:col-span-2">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 text-sky-300" size={20} />
                                <div>
                                    <p className="font-bold text-white">Principio de autorización</p>
                                    <p className="mt-1 text-sm text-zinc-400">El rol define el acceso heredado, el override explícito puede bloquearlo y un grant temporal solo eleva un permiso durante una ventana auditada.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'users' && (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                        <div className="glass-card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
                                        <tr>
                                            <th className="px-4 py-3">Usuario</th>
                                            <th className="px-4 py-3">Rol</th>
                                            <th className="px-4 py-3">Estado</th>
                                            <th className="px-4 py-3">Último login</th>
                                            <th className="px-4 py-3">Riesgos</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {filteredUsers.map(user => (
                                            <tr
                                                key={user.id}
                                                onClick={() => setSelectedId(user.id)}
                                                className={`cursor-pointer transition hover:bg-white/[0.04] ${selectedUser?.id === user.id ? 'bg-emerald-400/10' : ''}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <p className="font-semibold text-white">{user.full_name || 'Sin nombre'}</p>
                                                    <p className="text-xs text-zinc-500">{user.email}</p>
                                                </td>
                                                <td className="px-4 py-3 text-zinc-300">{user.categoria.replace(/_/g, ' ')}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${user.is_active && user.estado === 'activo' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}> 
                                                        {user.is_active && user.estado === 'activo' ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-zinc-400">{formatDate(user.last_sign_in_at)}</td>
                                                <td className="px-4 py-3">
                                                    {user.sensitive_access.length > 0 ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-300">
                                                            <AlertTriangle size={12} />
                                                            {user.sensitive_access.length} sensibles
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/60 px-2 py-1 text-xs text-zinc-400">
                                                            <CheckCircle2 size={12} />
                                                            Bajo
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {selectedUser && (
                            <aside className="glass-card p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">{selectedUser.full_name || selectedUser.email}</h2>
                                        <p className="text-xs text-zinc-500">{selectedUser.email}</p>
                                    </div>
                                    <button
                                        onClick={saveSelected}
                                        disabled={isPending}
                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-black hover:bg-emerald-300 disabled:opacity-60"
                                    >
                                        <Save size={14} />
                                        {isPending ? 'Guardando' : 'Guardar'}
                                    </button>
                                </div>

                                <div className="mt-5 grid gap-3">
                                    <label className="space-y-1">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rol real</span>
                                        <select
                                            value={selectedUser.categoria}
                                            onChange={event => updateSelectedUser({ categoria: event.target.value })}
                                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
                                        >
                                            {CATEGORY_OPTIONS.map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                                        <span>
                                            <span className="block text-sm font-semibold text-white">Usuario activo</span>
                                            <span className="text-xs text-zinc-500">Apagar esto bloquea el acceso en Auth.</span>
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={selectedUser.is_active}
                                            onChange={event => updateSelectedUser({ is_active: event.target.checked, estado: event.target.checked ? 'activo' : 'inactivo' })}
                                            className="h-5 w-5 accent-emerald-400"
                                        />
                                    </label>
                                </div>

                                <div className="mt-6">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                                        <Lock size={16} className="text-amber-300" />
                                        Permisos por módulo
                                    </div>
                                    <div className="space-y-2">
                                        {MODULE_DEFINITIONS.map(module => {
                                            const override = selectedUser.access_overrides?.[module.key] || 'inherit';
                                            const defaultAccess = getCategoryDefault(selectedUser.categoria, module.key);
                                            return (
                                                <div key={module.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-white">{module.label}</p>
                                                            <p className="text-xs text-zinc-500">
                                                                Rol: {defaultAccess === 'full' ? 'Completo' : defaultAccess === 'read' ? 'Solo lectura' : 'Sin acceso'}
                                                            </p>
                                                        </div>
                                                        <select
                                                            value={override}
                                                            onChange={event => updateOverride(module.key, event.target.value)}
                                                            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white outline-none"
                                                        >
                                                            {LEVEL_OPTIONS.map(option => (
                                                                <option key={option.value} value={option.value}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </aside>
                        )}
                    </div>
                )}

                {tab === 'grants' && (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                        <div className="glass-card overflow-hidden">
                            <div className="border-b border-white/10 p-4">
                                <h2 className="text-lg font-bold text-white">Accesos temporales</h2>
                                <p className="text-sm text-zinc-500">Permisos con vencimiento automático, motivo y revocación auditada.</p>
                            </div>
                            <div className="divide-y divide-white/10">
                                {grants.map(grant => (
                                    <div key={grant.id} className="grid gap-3 p-4 md:grid-cols-[1fr_180px_110px]">
                                        <div>
                                            <p className="font-semibold text-white">{grant.target_name || grant.target_email}</p>
                                            <p className="text-xs text-zinc-500">{grant.target_email} · {MODULE_DEFINITIONS.find(module => module.key === grant.module_key)?.label || grant.module_key}</p>
                                            <p className="mt-2 text-sm text-zinc-300">{grant.reason}</p>
                                        </div>
                                        <div className="text-xs text-zinc-400">
                                            <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${grant.revoked_at ? 'bg-zinc-700/60 text-zinc-400' : new Date(grant.expires_at) > new Date() ? 'bg-sky-400/10 text-sky-300' : 'bg-amber-400/10 text-amber-300'}`}>
                                                {grant.revoked_at ? 'Revocado' : new Date(grant.expires_at) > new Date() ? `Vence ${formatDate(grant.expires_at)}` : 'Vencido'}
                                            </span>
                                            <p className="mt-2">Nivel: {grant.access_level === 'edit' ? 'Edición' : 'Lectura'}</p>
                                        </div>
                                        <div className="flex items-start justify-end">
                                            {!grant.revoked_at && new Date(grant.expires_at) > new Date() && (
                                                <button onClick={() => revokeGrant(grant.id)} disabled={isPending} className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-400/10 disabled:opacity-50">Revocar</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {grants.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">Todavía no hay accesos temporales.</div>}
                            </div>
                        </div>

                        <aside className="glass-card p-5">
                            <div className="flex items-center gap-2 text-sm font-bold text-white"><TimerReset size={16} className="text-sky-300" /> Otorgar acceso</div>
                            <p className="mt-1 text-xs text-zinc-500">El acceso se activa ahora y vence automáticamente.</p>
                            <div className="mt-5 grid gap-3">
                                <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Persona</span><select value={selectedId} onChange={event => setSelectedId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{users.map(user => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}</select></label>
                                <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Módulo</span><select value={grantModule} onChange={event => setGrantModule(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{MODULE_DEFINITIONS.map(module => <option key={module.key} value={module.key}>{module.label}</option>)}</select></label>
                                <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nivel</span><select value={grantLevel} onChange={event => setGrantLevel(event.target.value as 'read' | 'edit')} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"><option value="read">Lectura</option><option value="edit">Edición</option></select></label>
                                <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Duración</span><select value={grantDuration} onChange={event => setGrantDuration(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"><option value="1">1 hora</option><option value="8">8 horas</option><option value="24">24 horas</option><option value="168">7 días</option><option value="720">30 días</option></select></label>
                                <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Motivo obligatorio</span><textarea value={grantReason} onChange={event => setGrantReason(event.target.value)} placeholder="Ej.: cubrir caja durante el turno de la tarde" className="min-h-24 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600" /></label>
                                <button onClick={createGrant} disabled={isPending || grantReason.trim().length < 3 || !selectedId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-400 px-3 py-2.5 text-sm font-bold text-black hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"><TimerReset size={16} /> Crear acceso temporal</button>
                            </div>
                        </aside>
                    </div>
                )}

                {tab === 'blackbox' && (
                    <div className="glass-card overflow-hidden">
                        <div className="border-b border-white/10 p-4">
                            <h2 className="text-lg font-bold text-white">Eventos recientes</h2>
                            <p className="text-sm text-zinc-500">Últimos {initialEvents.length} registros de auditoría global.</p>
                        </div>
                        <div className="divide-y divide-white/10">
                            {filteredEvents.map(event => (
                                <div key={event.id} className="grid gap-3 p-4 md:grid-cols-[180px_1fr_220px]">
                                    <div className="text-xs text-zinc-500">{formatDate(event.created_at)}</div>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-zinc-200">{actionLabel(event.action)}</span>
                                            <span className="text-xs text-zinc-500">{event.table_name}{event.record_id ? ` · ${event.record_id.slice(0, 8)}` : ''}</span>
                                        </div>
                                        {event.metadata && (
                                            <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-black/30 p-2 text-xs text-zinc-400">
                                                {JSON.stringify(event.metadata, null, 2)}
                                            </pre>
                                        )}
                                    </div>
                                    <div className="text-sm text-zinc-300">
                                        <p className="truncate font-medium">{event.user_email || 'Sistema'}</p>
                                        <p className="text-xs text-zinc-500">{event.categoria || 'sin rol'}</p>
                                    </div>
                                </div>
                            ))}
                            {filteredEvents.length === 0 && (
                                <div className="p-8 text-center text-sm text-zinc-500">No hay eventos para ese filtro.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
