import { getAllWorkers } from '@/app/actions/worker-portal';
import { Users, CheckCircle2, Circle, Search, UserPlus, Stethoscope, Building2, FlaskConical, Sparkles, Wrench } from 'lucide-react';
import Link from 'next/link';

const ROLE_ICONS: Record<string, React.ReactNode> = {
    dentist: <Stethoscope size={18} className="text-indigo-400" />,
    'odontólogo': <Stethoscope size={18} className="text-indigo-400" />,
    'dental': <Stethoscope size={18} className="text-indigo-400" />,
    admin: <Building2 size={18} className="text-violet-400" />,
    'administra': <Building2 size={18} className="text-violet-400" />,
    lab: <FlaskConical size={18} className="text-emerald-400" />,
    'laboratorio': <FlaskConical size={18} className="text-emerald-400" />,
    cleaning: <Sparkles size={18} className="text-sky-400" />,
    limpieza: <Sparkles size={18} className="text-sky-400" />,
    technician: <Wrench size={18} className="text-amber-400" />,
};

function getRoleIcon(rol: string) {
    const key = rol?.toLowerCase() || '';
    for (const [roleKey, icon] of Object.entries(ROLE_ICONS)) {
        if (key.includes(roleKey)) return icon;
    }
    return <Users size={18} className="text-slate-400" />;
}

function getDocCompliance(docs: any): number {
    if (!docs || typeof docs !== 'object') return 0;
    const required = ['dni_frente', 'dni_dorso', 'licencia', 'poliza'];
    const filled = required.filter(k => docs[k]?.url).length;
    return Math.round((filled / required.length) * 100);
}

export default async function StaffListPage() {
    const workers = await getAllWorkers();

    const active = workers.filter(w => w.activo !== false);
    const withEmail = workers.filter(w => w.email);

    const byRole: Record<string, typeof workers> = {};
    workers.forEach(w => {
        const role = w.rol || 'Otros';
        if (!byRole[role]) byRole[role] = [];
        byRole[role].push(w);
    });

    return (
        <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-700 pb-16">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">Gestión de Personal</h1>
                    <p className="text-slate-400 font-medium mt-1">Fichas de todos los prestadores AM Clínica.</p>
                </div>
                <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20">
                    <UserPlus size={17} />
                    Nuevo Prestador
                </button>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-black text-white">{workers.length}</p>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Total Personal</p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-black text-emerald-400">{active.length}</p>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Activos</p>
                </div>
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5 text-center">
                    <p className="text-3xl font-black text-indigo-400">{withEmail.length}</p>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Con Acceso Portal</p>
                </div>
            </div>

            {/* Staff Grid */}
            {Object.entries(byRole).map(([role, roleWorkers]) => (
                <div key={role}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                            {getRoleIcon(role)}
                        </div>
                        <h2 className="text-lg font-bold text-white">{role}</h2>
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
                            {roleWorkers.length}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roleWorkers.map(worker => {
                            const compliance = getDocCompliance(worker.documents);
                            const initials = `${worker.nombre?.[0] || ''}${worker.apellido?.[0] || ''}`.toUpperCase();

                            return (
                                <Link
                                    key={worker.id}
                                    href={`/admin/staff/${worker.id}`}
                                    className="group bg-slate-900/40 border border-slate-800/60 hover:border-slate-700 hover:bg-slate-900/70 rounded-2xl p-5 transition-all cursor-pointer"
                                >
                                    <div className="flex items-start justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/20 overflow-hidden">
                                                {worker.foto_url ? (
                                                    <img src={worker.foto_url} alt={worker.nombre} className="w-full h-full object-cover" />
                                                ) : initials || '?'}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors">
                                                    {worker.nombre} {worker.apellido}
                                                </h3>
                                                <p className="text-[11px] text-indigo-400 font-bold uppercase tracking-widest">
                                                    {worker.especialidad || worker.rol}
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase ${worker.activo !== false
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                                            }`}>
                                            {worker.activo !== false ? (
                                                <><CheckCircle2 size={10} />Activo</>
                                            ) : (
                                                <><Circle size={10} />Inactivo</>
                                            )}
                                        </div>
                                    </div>

                                    {/* Info Pills */}
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {worker.email ? (
                                            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                                                ✓ Portal
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-600 bg-slate-800/50 border border-slate-800 px-2.5 py-1 rounded-full">
                                                Sin acceso
                                            </span>
                                        )}
                                        {worker.documento && (
                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full">
                                                DNI: {worker.documento}
                                            </span>
                                        )}
                                    </div>

                                    {/* Compliance Bar */}
                                    <div>
                                        <div className="flex justify-between text-[10px] font-bold mb-1.5">
                                            <span className="text-slate-600 uppercase tracking-wider">Docs</span>
                                            <span className={compliance >= 100 ? 'text-emerald-400' : compliance > 0 ? 'text-amber-400' : 'text-slate-600'}>
                                                {compliance}%
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${compliance >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                style={{ width: `${compliance}%` }}
                                            />
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            ))}

            {workers.length === 0 && (
                <div className="text-center py-24 border border-dashed border-slate-800 rounded-3xl">
                    <Users size={40} className="mx-auto text-slate-700 mb-4" />
                    <p className="text-slate-500">No hay personal registrado aún.</p>
                </div>
            )}
        </div>
    );
}
