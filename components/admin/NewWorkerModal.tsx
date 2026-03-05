'use client';

import { useEffect, useState } from 'react';
import { X, UserPlus, Save } from 'lucide-react';
import { createProviderCompany, createWorkerWithInvite, getProviderCompanies, type CreateWorkerInput } from '@/app/actions/worker-portal';
import { toast } from 'sonner';

const AREAS = [
    'Odontología',
    'Laboratorio',
    'Limpieza',
    'Staff General',
];

const CONDICION_AFIP = [
    { value: 'monotributista', label: 'Monotributista' },
    { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { value: 'relacion_dependencia', label: 'Relación de Dependencia' },
    { value: 'otro', label: 'Otro' },
];

interface Props {
    onClose: () => void;
    onCreated: () => void;
}

export default function NewWorkerModal({ onClose, onCreated }: Props) {
    const [saving, setSaving] = useState(false);
    const [tipo, setTipo] = useState<'prestador' | 'odontologo'>('prestador');
    const [companies, setCompanies] = useState<Array<{ id: string; nombre: string; area_default?: string | null }>>([]);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [creatingCompany, setCreatingCompany] = useState(false);

    const [form, setForm] = useState<CreateWorkerInput>({
        nombre: '',
        apellido: '',
        categoria: '',
        area: 'Odontología',
        tipo: 'prestador',
        email: '',
        whatsapp: '',
        documento: '',
        condicion_afip: 'monotributista',
        valor_hora_ars: 0,
        porcentaje_honorarios: 0,
        fecha_ingreso: new Date().toISOString().split('T')[0],
        especialidad: '',
        empresa_prestadora_id: '',
    });

    useEffect(() => {
        getProviderCompanies().then(setCompanies).catch(() => setCompanies([]));
    }, []);

    function setField<K extends keyof CreateWorkerInput>(key: K, val: CreateWorkerInput[K]) {
        setForm(prev => ({ ...prev, [key]: val }));
    }

    async function handleCreateCompany() {
        const nombre = newCompanyName.trim();
        if (!nombre) return;

        setCreatingCompany(true);
        try {
            const empresa = await createProviderCompany({
                nombre,
                area_default: form.area || undefined,
            });

            setCompanies(prev => [...prev, empresa].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })));
            setField('empresa_prestadora_id', empresa.id);
            setNewCompanyName('');
            toast.success('Empresa prestadora creada');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'No se pudo crear la empresa');
        } finally {
            setCreatingCompany(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
        if (!form.email?.trim()) { toast.error('Email obligatorio: todo prestador/odontólogo tiene acceso al portal'); return; }

        setSaving(true);
        try {
            const payload: CreateWorkerInput = { ...form, tipo };
            await createWorkerWithInvite(payload);
            toast.success('Prestador creado e invitación enviada');
            onCreated();
            onClose();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al crear prestador');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-800">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 bg-indigo-500/10 border border-indigo-500/20 rounded-xl md:rounded-2xl flex items-center justify-center">
                            <UserPlus size={18} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-base md:text-lg font-bold text-white leading-tight">Nuevo Prestador</h2>
                            <p className="text-[10px] md:text-xs text-slate-500">Completá los datos de la ficha</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 md:p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-5 md:space-y-6">
                    {/* (all fields content remains the same but with improved parent spacing) */}
                    {/* ... */}

                    {/* Tipo toggle */}
                    <div className="flex gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl md:rounded-2xl">
                        {(['prestador', 'odontologo'] as const).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTipo(t)}
                                className={`flex-1 py-1.5 md:py-2 text-[13px] md:text-sm font-bold rounded-lg md:rounded-xl capitalize transition-all ${tipo === t
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'text-slate-500 hover:text-white'
                                    }`}
                            >
                                {t === 'odontologo' ? 'Odontólogo' : 'Staff'}
                            </button>
                        ))}
                    </div>

                    {/* Basic info */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Datos Básicos</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Nombre *" required>
                                <input
                                    type="text"
                                    value={form.nombre}
                                    onChange={e => setField('nombre', e.target.value)}
                                    placeholder="Ana"
                                    required
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="Apellido">
                                <input
                                    type="text"
                                    value={form.apellido}
                                    onChange={e => setField('apellido', e.target.value)}
                                    placeholder="García"
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="Área">
                                <select
                                    value={form.area}
                                    onChange={e => setField('area', e.target.value)}
                                    className={inputClass}
                                >
                                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </Field>
                            <Field label="Categoría">
                                <input
                                    type="text"
                                    value={form.categoria}
                                    onChange={e => setField('categoria', e.target.value)}
                                    placeholder="Ej: Odontólogo, Socio, Administrativo..."
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="Empresa Prestadora">
                                <select
                                    value={form.empresa_prestadora_id || ''}
                                    onChange={e => setField('empresa_prestadora_id', e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="">Sin empresa (liquidación individual)</option>
                                    {companies.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                            </Field>
                            {tipo === 'odontologo' && (
                                <Field label="Especialidad">
                                    <input
                                        type="text"
                                        value={form.especialidad}
                                        onChange={e => setField('especialidad', e.target.value)}
                                        placeholder="Ej: Ortodoncia, Implantología..."
                                        className={inputClass}
                                    />
                                </Field>
                            )}
                            <Field label="Fecha de Ingreso">
                                <input
                                    type="date"
                                    value={form.fecha_ingreso}
                                    onChange={e => setField('fecha_ingreso', e.target.value)}
                                    className={inputClass}
                                />
                            </Field>
                        </div>

                        <div className="mt-3 flex gap-2">
                            <input
                                type="text"
                                value={newCompanyName}
                                onChange={(e) => setNewCompanyName(e.target.value)}
                                placeholder="Crear nueva empresa prestadora..."
                                className={`${inputClass} flex-1`}
                            />
                            <button
                                type="button"
                                onClick={handleCreateCompany}
                                disabled={creatingCompany || !newCompanyName.trim()}
                                className="px-3 py-2 rounded-xl border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50 text-xs font-bold"
                            >
                                {creatingCompany ? 'Creando...' : 'Crear empresa'}
                            </button>
                        </div>
                    </div>

                    {/* Contact & Legal */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Contacto y Legal</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Email">
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={e => setField('email', e.target.value)}
                                    placeholder="ana@ejemplo.com"
                                    required
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="WhatsApp">
                                <input
                                    type="text"
                                    value={form.whatsapp}
                                    onChange={e => setField('whatsapp', e.target.value)}
                                    placeholder="+54 9 11..."
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="DNI / Documento">
                                <input
                                    type="text"
                                    value={form.documento}
                                    onChange={e => setField('documento', e.target.value)}
                                    placeholder="12.345.678"
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="Condición AFIP">
                                <select
                                    value={form.condicion_afip}
                                    onChange={e => setField('condicion_afip', e.target.value)}
                                    className={inputClass}
                                >
                                    {CONDICION_AFIP.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                    </div>

                    {/* Financial */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Datos de Pago</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Valor Hora ARS">
                                <input
                                    type="number"
                                    min={0}
                                    value={form.valor_hora_ars || ''}
                                    onChange={e => setField('valor_hora_ars', parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className={inputClass}
                                />
                            </Field>
                            {tipo === 'odontologo' && (
                                <Field label="% Honorarios">
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        value={form.porcentaje_honorarios || ''}
                                        onChange={e => setField('porcentaje_honorarios', parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        className={inputClass}
                                    />
                                </Field>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border p-4 bg-indigo-900/20 border-indigo-500/30">
                        <p className="text-sm font-bold text-white">Acceso al portal obligatorio</p>
                        <p className="mt-1 text-xs text-indigo-300/90">
                            Todo prestador/odontólogo se crea con usuario de portal. Se enviará invitación a <strong>{form.email || 'su email'}</strong>.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 rounded-2xl text-sm font-bold transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-sm font-bold transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {saving ? (
                                <span className="animate-pulse">Guardando...</span>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Crear y enviar invitación
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const inputClass = "w-full bg-slate-900 border border-slate-800 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 text-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none transition-all placeholder:text-slate-600";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {label}{required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}
