'use client';

import { useState, useEffect } from 'react';
import { WorkerProfile, WorkerCategory } from '@/types/worker-portal';
import { updateWorkerProfileAdmin, getAppUsers, getProviderCompanies, createProviderCompany } from '@/app/actions/worker-portal';
import { toast } from 'sonner';
import { Save, User, Briefcase, DollarSign, Phone, Mail, MapPin, Hash, ShieldCheck, Link2, Clock, ListChecks } from 'lucide-react';

interface StaffEditFormProps {
    worker: WorkerProfile;
    onCancel: () => void;
    onSuccess: () => void;
}

export default function StaffEditForm({ worker, onCancel, onSuccess }: StaffEditFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [appUsers, setAppUsers] = useState<{ id: string, full_name: string, email: string, categoria: string }[]>([]);
    const [linkedUserId, setLinkedUserId] = useState(worker.user_id || '');
    const [providerCompanyId, setProviderCompanyId] = useState(worker.empresa_prestadora_id || '');
    const [companies, setCompanies] = useState<Array<{ id: string; nombre: string }>>([]);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [creatingCompany, setCreatingCompany] = useState(false);
    const [cobraPorHoras, setCobraPorHoras] = useState(worker.cobra_por_horas ?? false);

    const APP_ROLE_LABELS: Record<string, string> = {
        partner_viewer: 'Solo lectura',
        reception: 'Recepción',
        recaptacion: 'Recaptación',
        laboratorio: 'Laboratorio',
        asistente: 'Asistente',
        odontologo: 'Odontólogo',
        pricing_manager: 'Gestor de Precios',
        developer: 'Desarrollador',
        admin: 'Administrador',
        owner: 'Dueño',
    };

    useEffect(() => {
        getAppUsers().then(setAppUsers).catch(console.error);
        getProviderCompanies().then(setCompanies).catch(() => setCompanies([]));
    }, []);

    const selectedLinkedUser = linkedUserId
        ? appUsers.find((u) => u.id === linkedUserId)
        : null;
    const linkedAppRole = selectedLinkedUser?.categoria;
    const linkedAppRoleLabel = linkedAppRole ? (APP_ROLE_LABELS[linkedAppRole] || linkedAppRole) : 'Sin rol de app';

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
            categoria: fd.get('rol') as string,
            especialidad: fd.get('especialidad') as string,
            direccion: fd.get('direccion') as string,
            barrio_localidad: fd.get('barrio_localidad') as string,
            valor_hora_ars: Number(fd.get('valor_hora_ars')),
            activo: fd.get('activo') === 'on',
            matricula_provincial: fd.get('matricula_provincial') as string,
            user_id: linkedUserId || undefined,
            empresa_prestadora_id: providerCompanyId || undefined,
            cobra_por_horas: cobraPorHoras,
        };

        try {
            await updateWorkerProfileAdmin(worker.id, data);
            toast.success('Perfil actualizado correctamente');
            onSuccess();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al actualizar el perfil');
        } finally {
            setIsSaving(false);
        }
    };

    const ROLES: WorkerCategory[] = ['dentist', 'assistant', 'technician', 'cleaning', 'admin', 'reception', 'lab', 'marketing', 'other'];

    async function handleCreateCompany() {
        const nombre = newCompanyName.trim();
        if (!nombre) return;

        setCreatingCompany(true);
        try {
            const empresa = await createProviderCompany({ nombre });
            setCompanies((prev) => [...prev, empresa].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })));
            setProviderCompanyId(empresa.id);
            setNewCompanyName('');
            toast.success('Empresa prestadora creada');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'No se pudo crear la empresa');
        } finally {
            setCreatingCompany(false);
        }
    }

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
                            <input name="documento" defaultValue={worker.documento} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl pl-11 pr-4 py-2.5 text-white outline-none transition-all" />
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
                            <select name="rol" defaultValue={worker.categoria} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all appearance-none">
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

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Empresa Prestadora (para liquidación agrupada)</label>
                        <select
                            value={providerCompanyId}
                            onChange={(e) => setProviderCompanyId(e.target.value)}
                            className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all appearance-none"
                        >
                            <option value="">Sin empresa (liquidación individual)</option>
                            {companies.map((company) => (
                                <option key={company.id} value={company.id}>{company.nombre}</option>
                            ))}
                        </select>
                        <div className="flex gap-2 mt-2">
                            <input
                                type="text"
                                value={newCompanyName}
                                onChange={(e) => setNewCompanyName(e.target.value)}
                                placeholder="Nueva empresa prestadora..."
                                className="flex-1 bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-white outline-none transition-all"
                            />
                            <button
                                type="button"
                                onClick={handleCreateCompany}
                                disabled={creatingCompany || !newCompanyName.trim()}
                                className="px-3 py-2 rounded-xl border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50 text-xs font-bold"
                            >
                                {creatingCompany ? 'Creando...' : 'Crear'}
                            </button>
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

                    {/* Billing mode toggle */}
                    <button
                        type="button"
                        onClick={() => setCobraPorHoras(prev => !prev)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 text-left ${
                            cobraPorHoras
                                ? 'bg-violet-500/10 border-violet-500/30'
                                : 'bg-emerald-500/10 border-emerald-500/30'
                        }`}
                    >
                        {/* Pill / track */}
                        <div className={`relative w-14 h-7 rounded-full flex-shrink-0 transition-colors duration-300 ${
                            cobraPorHoras ? 'bg-violet-600' : 'bg-emerald-600'
                        }`}>
                            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300 ${
                                cobraPorHoras ? 'translate-x-7' : 'translate-x-0'
                            }`} />
                        </div>

                        {/* Labels */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                {cobraPorHoras
                                    ? <Clock size={15} className="text-violet-400 flex-shrink-0" />
                                    : <ListChecks size={15} className="text-emerald-400 flex-shrink-0" />
                                }
                                <p className={`text-sm font-bold transition-colors duration-200 ${
                                    cobraPorHoras ? 'text-violet-300' : 'text-emerald-300'
                                }`}>
                                    {cobraPorHoras ? 'Cobra por horas' : 'Cobra por prestaciones'}
                                </p>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {cobraPorHoras
                                    ? 'Entra en la lógica de Horarios · Se usa el valor hora ARS'
                                    : 'Entra en la lógica de Lista de Prestaciones'
                                }
                            </p>
                        </div>
                    </button>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Valor Hora (ARS)</label>
                        <input name="valor_hora_ars" type="number" defaultValue={worker.valor_hora_ars || 0} className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white outline-none transition-all font-mono" />
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
                                value={linkedUserId}
                                onChange={(e) => {
                                    const nextUserId = e.target.value;
                                    setLinkedUserId(nextUserId);
                                }}
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

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Rol de App (permisos reales)</label>
                            <div className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-white">
                                {linkedUserId ? linkedAppRoleLabel : 'Sin usuario vinculado'}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 italic">
                                Para evitar inconsistencias, el rol de app se edita solo en Gestión de Usuarios.
                            </p>
                            <a href="/admin-users" className="inline-flex text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                                Ir a Gestión de Usuarios
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
