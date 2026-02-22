'use client';

import { useState } from 'react';
import { WorkerProfile } from '@/types/worker-portal';
import { Save, Upload, CheckCircle, AlertCircle, Camera, ShieldCheck, FileText, User, Briefcase, MapPin, Lock } from 'lucide-react';
import { uploadWorkerDocument, updateOwnProfile } from '@/app/actions/worker-portal';
import { toast } from 'sonner';

// Fields that cannot be changed by the prestador once set (admin-only)
const LOCKED_ONCE_SET = ['documento', 'foto_url', 'matricula_provincial', 'poliza_url'] as const;
type LockedField = typeof LOCKED_ONCE_SET[number];

interface ProfileFormProps {
    worker: WorkerProfile;
}

type Section = 'identity' | 'contact' | 'professional' | 'documents';

export default function ProfileForm({ worker }: ProfileFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<Section>('identity');

    const docs = (worker.documents as Record<string, any>) || {};

    const SECTIONS: { id: Section; label: string; icon: any }[] = [
        { id: 'identity', label: 'Identidad', icon: User },
        { id: 'contact', label: 'Contacto y Legal', icon: MapPin },
        { id: 'professional', label: 'Profesional', icon: Briefcase },
        { id: 'documents', label: 'Documentación', icon: FileText },
    ];

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(type);
        try {
            await uploadWorkerDocument(worker.id, file, type);
            toast.success(`Documento cargado exitosamente`);
        } catch {
            toast.error('Error al cargar el documento');
        } finally {
            setUploading(null);
        }
    };

    // Check if a field is locked (already set, can't be changed by prestador)
    function isFieldLocked(field: LockedField): boolean {
        return !!worker[field as keyof WorkerProfile];
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        const fd = new FormData(e.currentTarget);

        try {
            await updateOwnProfile({
                nombre: fd.get('nombre') as string,
                apellido: fd.get('apellido') as string,
                especialidad: fd.get('especialidad') as string,
                whatsapp: fd.get('whatsapp') as string,
                email: fd.get('email') as string,
                // Only include locked fields in payload if they're not already set
                ...(!isFieldLocked('documento') && { documento: fd.get('documento') as string }),
                ...(!isFieldLocked('matricula_provincial') && { matricula_provincial: fd.get('matricula_provincial') as string }),
                direccion: fd.get('direccion') as string,
                barrio_localidad: fd.get('barrio_localidad') as string,
                condicion_afip: fd.get('condicion_afip') as string,
                descripcion: fd.get('descripcion') as string,
            });
            toast.success('Perfil actualizado correctamente');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al guardar los cambios');
        } finally {
            setIsSaving(false);
        }
    };

    const DOCUMENT_SLOTS = [
        { key: 'dni_frente', label: 'DNI (Frente)' },
        { key: 'dni_dorso', label: 'DNI (Dorso)' },
        { key: 'licencia', label: 'Matrícula / Licencia' },
        { key: 'poliza', label: 'Póliza de Seguro' },
        { key: 'contrato', label: 'Contrato de trabajo' },
        { key: 'otros', label: 'Otros documentos' },
    ];

    const completedDocs = DOCUMENT_SLOTS.filter(d => docs[d.key]?.url).length;
    const profilePct = [
        worker.nombre, worker.apellido, worker.email, worker.whatsapp,
        worker.documento, worker.direccion, worker.especialidad, worker.condicion_afip,
    ].filter(Boolean).length;
    const profileCompleteness = Math.round((profilePct / 8) * 100);

    return (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* Left: Profile Card */}
            <div className="space-y-4">
                {/* Avatar */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 text-center relative overflow-hidden">
                    <div className="relative inline-block mb-4">
                        <div className="w-28 h-28 rounded-full bg-slate-900 flex items-center justify-center border-4 border-slate-800 shadow-2xl overflow-hidden">
                            {worker.foto_url ? (
                                <img src={worker.foto_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-5xl text-slate-700 font-black">{worker.nombre?.[0]}</span>
                            )}
                        </div>
                        <button type="button" className="absolute bottom-1 right-1 p-2 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 transition-all shadow-lg border-2 border-slate-950">
                            <Camera size={14} />
                        </button>
                    </div>
                    <h4 className="text-lg font-bold text-white">{worker.nombre} {worker.apellido}</h4>
                    <p className="text-indigo-400 font-bold text-xs uppercase tracking-widest mt-0.5">{worker.rol}</p>
                    {worker.especialidad && (
                        <p className="text-slate-500 text-xs mt-0.5">{worker.especialidad}</p>
                    )}

                    {/* Completeness */}
                    <div className="mt-5 pt-5 border-t border-slate-800/50 space-y-3">
                        <div>
                            <div className="flex justify-between text-[10px] font-bold mb-1">
                                <span className="text-slate-500 uppercase tracking-wider">Perfil</span>
                                <span className="text-indigo-400">{profileCompleteness}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${profileCompleteness}%` }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-[10px] font-bold mb-1">
                                <span className="text-slate-500 uppercase tracking-wider">Documentos</span>
                                <span className="text-emerald-400">{completedDocs}/{DOCUMENT_SLOTS.length}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(completedDocs / DOCUMENT_SLOTS.length) * 100}%` }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section Nav */}
                <nav className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-2 space-y-0.5">
                    {SECTIONS.map(sec => {
                        const Icon = sec.icon;
                        return (
                            <button
                                key={sec.id}
                                type="button"
                                onClick={() => setActiveSection(sec.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeSection === sec.id
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                    }`}
                            >
                                <Icon size={15} />
                                {sec.label}
                            </button>
                        );
                    })}
                </nav>

                {/* Save Button */}
                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    <Save size={18} />
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>

            {/* Right: Form Sections */}
            <div className="lg:col-span-3 space-y-6">

                {/* Identity */}
                {activeSection === 'identity' && (
                    <FormSection title="Información Personal" icon={<User size={20} className="text-indigo-400" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Nombre" name="nombre" defaultValue={worker.nombre} />
                            <FormField label="Apellido" name="apellido" defaultValue={worker.apellido} />
                            <FormField label="Email" name="email" defaultValue={worker.email} type="email" />
                            <FormField
                                label="DNI / Documento"
                                name="documento"
                                defaultValue={worker.documento}
                                locked={isFieldLocked('documento')}
                                lockedHint="Solo administración puede modificar el DNI una vez registrado"
                            />
                        </div>
                        <div className="mt-4">
                            <FormField label="Descripción / Bio breve" name="descripcion" defaultValue={worker.descripcion} isTextarea />
                        </div>
                    </FormSection>
                )}

                {/* Contact & Legal */}
                {activeSection === 'contact' && (
                    <FormSection title="Contacto y Datos Legales" icon={<MapPin size={20} className="text-cyan-400" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="WhatsApp" name="whatsapp" defaultValue={worker.whatsapp} placeholder="+54 9 11..." />
                            <FormField label="Condición AFIP" name="condicion_afip" defaultValue={worker.condicion_afip} />
                            <FormField label="Dirección" name="direccion" defaultValue={worker.direccion} />
                            <FormField label="Barrio / Localidad" name="barrio_localidad" defaultValue={worker.barrio_localidad} />
                        </div>
                    </FormSection>
                )}

                {/* Professional */}
                {activeSection === 'professional' && (
                    <FormSection title="Datos Profesionales" icon={<Briefcase size={20} className="text-violet-400" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Especialidad" name="especialidad" defaultValue={worker.especialidad} />
                            <FormField
                                label="Matrícula Provincial"
                                name="matricula_provincial"
                                defaultValue={worker.matricula_provincial}
                                locked={isFieldLocked('matricula_provincial')}
                                lockedHint="Solo administración puede modificar la matrícula una vez registrada"
                            />
                        </div>
                        <div className="mt-5 p-4 bg-slate-950/30 rounded-2xl border border-slate-800/50">
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3">Datos de Pago (sólo lectura)</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Valor Hora</p>
                                    <p className="text-white font-mono font-bold mt-1">${worker.valor_hora_ars?.toLocaleString() || '---'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">% Honorarios</p>
                                    <p className="text-white font-mono font-bold mt-1">{worker.porcentaje_honorarios || 0}%</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Fecha Ingreso</p>
                                    <p className="text-white font-mono font-bold mt-1">
                                        {worker.fecha_ingreso ? new Date(worker.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '---'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Último Pago</p>
                                    <p className="text-white font-mono font-bold mt-1">
                                        {worker.ultimo_pago_fecha ? new Date(worker.ultimo_pago_fecha + 'T12:00:00').toLocaleDateString('es-AR') : '---'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </FormSection>
                )}

                {/* Documents */}
                {activeSection === 'documents' && (
                    <FormSection title="Documentación Requerida" icon={<ShieldCheck size={20} className="text-emerald-400" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {DOCUMENT_SLOTS.map(slot => {
                                const doc = docs[slot.key];
                                const isVerified = doc?.status === 'verified';
                                const isPending = doc?.status === 'pending_review';
                                const isUploading = uploading === slot.key;

                                return (
                                    <div key={slot.key} className={`p-4 rounded-2xl border transition-all ${isVerified ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-950/30 border-slate-800/50 hover:border-slate-700'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-sm font-bold text-slate-300">{slot.label}</span>
                                            {isVerified ? (
                                                <CheckCircle className="text-emerald-400" size={16} />
                                            ) : isPending ? (
                                                <AlertCircle className="text-amber-400" size={16} />
                                            ) : (
                                                <div className="w-2 h-2 rounded-full bg-slate-700" />
                                            )}
                                        </div>

                                        {doc ? (
                                            <div className="flex items-center justify-between">
                                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline font-bold">
                                                    Ver Documento
                                                </a>
                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isVerified ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
                                                    {isVerified ? 'Verificado' : 'En revisión'}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input
                                                    type="file"
                                                    onChange={(e) => handleFileUpload(e, slot.key)}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                    disabled={isUploading}
                                                />
                                                <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-slate-500 bg-slate-900/50 border border-dashed border-slate-800 rounded-xl hover:border-slate-600 transition-colors">
                                                    {isUploading ? (
                                                        <span className="animate-pulse">Subiendo...</span>
                                                    ) : (
                                                        <>
                                                            <Upload size={13} />
                                                            Subir archivo
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </FormSection>
                )}

                {/* Footer */}
                <div className="pt-4 border-t border-slate-800/50">
                    <p className="text-center text-slate-600 text-[10px] font-bold uppercase tracking-widest">
                        AM Clínica © 2026 • Portal Verificado • Todos los datos encriptados
                    </p>
                </div>
            </div>
        </form>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FormSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
                    {icon}
                </div>
                <h3 className="text-base font-bold text-white">{title}</h3>
            </div>
            {children}
        </div>
    );
}

function FormField({ label, name, defaultValue, type = 'text', placeholder, isTextarea, locked, lockedHint }: {
    label: string;
    name: string;
    defaultValue?: string;
    type?: string;
    placeholder?: string;
    isTextarea?: boolean;
    locked?: boolean;
    lockedHint?: string;
}) {
    const baseClass = "w-full bg-slate-950/50 border border-slate-800/50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 text-slate-200 rounded-xl px-4 text-sm transition-all outline-none placeholder:text-slate-600";
    const lockedClass = "w-full bg-slate-900/30 border border-slate-800/30 text-slate-400 rounded-xl px-4 text-sm cursor-not-allowed opacity-70";

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                {locked && (
                    <span title={lockedHint || 'Solo administración puede modificar este campo'}>
                        <Lock size={10} className="text-amber-500" />
                    </span>
                )}
            </div>
            {locked ? (
                <div className="relative">
                    <input
                        type={type}
                        name={name}
                        value={defaultValue || ''}
                        readOnly
                        className={`${lockedClass} h-11 pr-10`}
                    />
                    <Lock size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500/60" />
                </div>
            ) : isTextarea ? (
                <textarea
                    name={name}
                    defaultValue={defaultValue || ''}
                    placeholder={placeholder}
                    rows={3}
                    className={`${baseClass} py-3 resize-none`}
                />
            ) : (
                <input
                    type={type}
                    name={name}
                    defaultValue={defaultValue || ''}
                    placeholder={placeholder}
                    className={`${baseClass} h-11`}
                />
            )}
            {locked && lockedHint && (
                <p className="text-[10px] text-amber-600/70 flex items-center gap-1">
                    <Lock size={8} />{lockedHint}
                </p>
            )}
        </div>
    );
}
