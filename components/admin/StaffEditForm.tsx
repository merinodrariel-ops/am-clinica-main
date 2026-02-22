'use client';

import { useState, useEffect } from 'react';
import { WorkerProfile, WorkerRole } from '@/types/worker-portal';
import { updateWorkerProfileAdmin, getAppUsers } from '@/app/actions/worker-portal';
import { toast } from 'sonner';
import { Save, X, User, Briefcase, DollarSign, Phone, Mail, MapPin, Hash, ShieldCheck, Link2 } from 'lucide-react';

interface StaffEditFormProps {
    worker: WorkerProfile;
    onCancel: () => void;
    onSuccess: () => void;
}

export default function StaffEditForm({ worker, onCancel, onSuccess }: StaffEditFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [appUsers, setAppUsers] = useState<{ id: string, full_name: string, email: string }[]>([]);

    useEffect(() => {
        getAppUsers().then(setAppUsers).catch(console.error);
    }, []);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        const fd = new FormData(e.currentTarget);

        const data: Partial<WorkerProfile> = {
            nombre: fd.get('nombre') as string,
            apellido: fd.get('apellido') as string,
            email: fd.get('email') as string,
            whatsapp: fd.get('whatsapp') as string,
            documento: fd.get('documento') as string,
            rol: fd.get('rol') as string,
            especialidad: fd.get('especialidad') as string,
            direccion: fd.get('direccion') as string,
            barrio_localidad: fd.get('barrio_localidad') as string,
            valor_hora_ars: Number(fd.get('valor_hora_ars')),
            porcentaje_honorarios: Number(fd.get('porcentaje_honorarios')),
            activo: fd.get('activo') === 'on',
            matricula_provincial: fd.get('matricula_provincial') as string,
            user_id: fd.get('user_id') as string || undefined,
        };

        try {
            await updateWorkerProfileAdmin(worker.id, data);
            toast.success('Perfil actualizado correctamente');
            onSuccess();
        } catch (err: any) {
            toast.error(err.message || 'Error al actualizar el perfil');
        } finally {
            setIsSaving(false);
        }
    };

    const ROLES: WorkerRole[] = ['dentist', 'assistant', 'technician', 'cleaning', 'admin', 'reception', 'lab', 'marketing', 'other'];

    return (
        <form onSubmit={handleSubmit} className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 md:space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <User className="text-indigo-400" size={20} />
                    {worker.nombre}
                </h2>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors border border-slate-800 rounded-xl"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                    >
                        {isSaving ? '...' : (
                            <>
                                <Save size={16} />
                                Guardar
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Personal Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <User size={14} /> Datos Personales
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nombre</label>
                            <input name="nombre" defaultValue={worker.nombre} required className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Apellido</label>
                            <input name="apellido" defaultValue={worker.apellido} required className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">DNI / Documento</label>
                        <div className="relative">
                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input name="documento" defaultValue={worker.documento} required className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-white outline-none transition-all" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">WhatsApp</label>
                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input name="whatsapp" defaultValue={worker.whatsapp} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-white outline-none transition-all" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input name="email" type="email" defaultValue={worker.email} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-white outline-none transition-all" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Professional Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <Briefcase size={14} /> Profesional & Rol
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Rol en Clínica</label>
                            <select name="rol" defaultValue={worker.rol} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all appearance-none">
                                {ROLES.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Especialidad</label>
                            <input name="especialidad" defaultValue={worker.especialidad} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Matrícula Provincial</label>
                        <div className="relative">
                            <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input name="matricula_provincial" defaultValue={worker.matricula_provincial} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-white outline-none transition-all" />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-slate-800/30 border border-slate-800 rounded-2xl">
                        <div className="flex-1">
                            <p className="text-sm font-bold text-white">Estado del Prestador</p>
                            <p className="text-xs text-slate-500">¿Habilitado para ver el portal y recibir pagos?</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" name="activo" defaultChecked={worker.activo !== false} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>
                </div>

                {/* Financial Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <DollarSign size={14} /> Configuración Financiera
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Valor Hora (ARS)</label>
                            <input name="valor_hora_ars" type="number" defaultValue={worker.valor_hora_ars || 0} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all font-mono" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">% Honorarios</label>
                            <input name="porcentaje_honorarios" type="number" defaultValue={worker.porcentaje_honorarios || 0} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all font-mono" />
                        </div>
                    </div>
                </div>

                {/* Location Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                        <MapPin size={14} /> Ubicación
                    </h3>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Dirección</label>
                        <input name="direccion" defaultValue={worker.direccion} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Barrio / Localidad</label>
                        <input name="barrio_localidad" defaultValue={worker.barrio_localidad} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all" />
                    </div>
                </div>

                {/* Account Link Section */}
                <div className="space-y-4 md:col-span-2">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2 border-t border-slate-800 pt-6">
                        <Link2 size={14} /> Vinculación de Cuenta (Acceso al Portal)
                    </h3>

                    <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Vincular con Usuario de la App</label>
                            <select
                                name="user_id"
                                defaultValue={worker.user_id || ''}
                                className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-all appearance-none"
                            >
                                <option value="">No vinculado</option>
                                {appUsers.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.full_name} ({u.email})
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-500 mt-1 italic">
                                Vincule este perfil de personal con un usuario registrado para que pueda acceder a su portal individual.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
