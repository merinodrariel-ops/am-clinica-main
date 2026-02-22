import { getWorkerById, getWorkerAchievements, getWorkerLiquidations, getWorkerXP, getAllGoals, getGoalProgress } from '@/app/actions/worker-portal';
import { notFound } from 'next/navigation';
import {
    User,
    Mail,
    Phone,
    Award,
    ChevronLeft,
    DollarSign,
    Clock,
    ShieldCheck,
    ExternalLink,
    CheckCircle2,
    Zap,
} from 'lucide-react';
import Link from 'next/link';
import StaffPhotoUploader from '@/components/admin/StaffPhotoUploader';

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const worker = await getWorkerById(id);
    if (!worker) notFound();

    const [achievements, liquidations, totalXP, goals, progressList] = await Promise.all([
        getWorkerAchievements(worker.id),
        getWorkerLiquidations(worker.id),
        getWorkerXP(worker.id),
        getAllGoals(worker.rol),
        getGoalProgress(worker.id),
    ]);

    const progressMap = new Map(progressList.map(p => [p.goal_id, p]));
    const docs = (worker.documents as Record<string, any>) || {};
    const initials = `${worker.nombre?.[0] || ''}${worker.apellido?.[0] || ''}`.toUpperCase();

    const completedGoals = progressList.filter(p => p.completed).length;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700 pb-16">
            {/* Back */}
            <Link href="/admin/staff" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors w-fit">
                <ChevronLeft size={18} />
                Volver al personal
            </Link>

            {/* Hero Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-8">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                    <StaffPhotoUploader
                        workerId={worker.id}
                        initialPhotoUrl={worker.foto_url}
                        workerName={worker.nombre}
                        initials={initials}
                    />

                    <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-extrabold text-white tracking-tight">
                                    {worker.nombre} {worker.apellido}
                                </h1>
                                <p className="text-indigo-400 font-bold text-sm uppercase tracking-widest mt-1">{worker.rol}</p>
                                {worker.especialidad && (
                                    <p className="text-slate-400 text-sm mt-0.5">{worker.especialidad}</p>
                                )}
                            </div>
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${worker.activo !== false
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                                }`}>
                                <div className={`w-2 h-2 rounded-full ${worker.activo !== false ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                                {worker.activo !== false ? 'Activo' : 'Inactivo'}
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                            {worker.email && (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <Mail size={14} />
                                    <span>{worker.email}</span>
                                </div>
                            )}
                            {worker.whatsapp && (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <Phone size={14} />
                                    <span>{worker.whatsapp}</span>
                                </div>
                            )}
                            {worker.documento && (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <User size={14} />
                                    <span>DNI: {worker.documento}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Stats */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 text-center">
                    <Zap className="mx-auto text-indigo-400 mb-2" size={28} />
                    <p className="text-2xl font-black text-white">{totalXP.toLocaleString()}</p>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">XP Total</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 text-center">
                    <Award className="mx-auto text-amber-400 mb-2" size={28} />
                    <p className="text-2xl font-black text-white">{achievements.length}</p>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Medallas</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 text-center">
                    <CheckCircle2 className="mx-auto text-emerald-400 mb-2" size={28} />
                    <p className="text-2xl font-black text-white">{completedGoals}</p>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">Objetivos completos</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Financial Info */}
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <DollarSign className="text-emerald-400" size={20} />
                        <h3 className="font-bold text-white">Datos de Pago</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { label: 'Valor/hora', value: `$${(worker.valor_hora_ars || 0).toLocaleString()}` },
                            { label: '% Honorarios', value: `${worker.porcentaje_honorarios || 0}%` },
                            { label: 'Ingresó', value: worker.fecha_ingreso ? new Date(worker.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '---' },
                            { label: 'Último pago', value: worker.ultimo_pago_fecha ? new Date(worker.ultimo_pago_fecha + 'T12:00:00').toLocaleDateString('es-AR') : '---' },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-slate-950/40 rounded-xl p-3">
                                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">{label}</p>
                                <p className="font-mono font-bold text-white mt-1">{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Liquidations */}
                    <div className="mt-5 pt-5 border-t border-slate-800/50">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-slate-300">Liquidaciones</h4>
                            <span className="text-xs text-slate-500">{liquidations.length} total</span>
                        </div>
                        <div className="space-y-2">
                            {liquidations.slice(0, 3).map(liq => (
                                <div key={liq.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-800/40">
                                    <div>
                                        <p className="text-sm font-bold text-white">
                                            {new Date(liq.mes + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                                        </p>
                                        <p className="text-[11px] text-slate-500">{liq.total_horas}h · ${liq.total_ars?.toLocaleString()}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${liq.estado === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                        {liq.estado}
                                    </span>
                                </div>
                            ))}
                            {liquidations.length === 0 && (
                                <p className="text-center text-slate-600 text-xs py-4">Sin liquidaciones</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Documents */}
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <ShieldCheck className="text-blue-400" size={20} />
                        <h3 className="font-bold text-white">Documentación</h3>
                    </div>
                    <div className="space-y-3">
                        {[
                            { key: 'dni_frente', label: 'DNI Frente' },
                            { key: 'dni_dorso', label: 'DNI Dorso' },
                            { key: 'licencia', label: 'Matrícula / Licencia' },
                            { key: 'poliza', label: 'Póliza de Seguro' },
                            { key: 'contrato', label: 'Contrato' },
                        ].map(slot => {
                            const doc = docs[slot.key];
                            return (
                                <div key={slot.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/30 border border-slate-800/40">
                                    <div className="flex items-center gap-2.5">
                                        {doc?.url ? (
                                            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                                        ) : (
                                            <div className="w-4 h-4 rounded-full border border-slate-700 flex-shrink-0" />
                                        )}
                                        <span className="text-sm font-medium text-slate-300">{slot.label}</span>
                                    </div>
                                    {doc?.url ? (
                                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                                            <ExternalLink size={14} />
                                        </a>
                                    ) : (
                                        <span className="text-[10px] font-bold text-slate-600 uppercase">Faltante</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Achievements */}
                    <div className="mt-5 pt-5 border-t border-slate-800/50">
                        <h4 className="text-sm font-bold text-slate-300 mb-3">Medallas ganadas</h4>
                        <div className="flex flex-wrap gap-2">
                            {achievements.slice(0, 6).map(wa => (
                                <div key={wa.id} className="px-3 py-1.5 bg-amber-500/5 border border-amber-500/20 rounded-xl text-xs font-bold text-amber-400" title={(wa.achievement as any)?.description}>
                                    ✨ {(wa.achievement as any)?.name}
                                </div>
                            ))}
                            {achievements.length === 0 && (
                                <p className="text-xs text-slate-600">Sin medallas aún</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
