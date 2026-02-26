'use client';

/**
 * DoctorScheduleConfig
 * Manages doctor working hours (doctor_schedules) and
 * notification rules (notification_rules) from the Agenda > Config tab.
 */

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Save, Plus, Trash2, Loader2, Bell, Clock, UserCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Doctor {
    id: string;
    full_name: string;
    role: string;
}

interface DoctorSchedule {
    id?: string;
    doctor_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_appointments: number;
    is_active: boolean;
}

interface NotificationRule {
    id?: string;
    name: string;
    description?: string;
    trigger_offset_hours: number;
    trigger_on_statuses: string[];
    channel: string;
    template_key: string;
    is_active: boolean;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const CHANNELS = [
    { value: 'email',     label: 'Email' },
    { value: 'whatsapp',  label: 'WhatsApp' },
    { value: 'both',      label: 'Ambos' },
];
const STATUSES_OPTIONS = ['confirmed', 'pending', 'arrived', 'in_progress', 'completed', 'cancelled'];

// ─── Doctor Schedule Editor ───────────────────────────────────────────────────

function ScheduleRow({
    schedule,
    onChange,
    onDelete,
}: {
    schedule: DoctorSchedule;
    onChange: (s: DoctorSchedule) => void;
    onDelete: () => void;
}) {
    return (
        <div className="grid grid-cols-[80px_1fr_1fr_80px_80px_80px_40px] gap-2 items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {DAYS[schedule.day_of_week]}
            </span>
            <input
                type="time"
                value={schedule.start_time}
                onChange={e => onChange({ ...schedule, start_time: e.target.value })}
                className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
            <input
                type="time"
                value={schedule.end_time}
                onChange={e => onChange({ ...schedule, end_time: e.target.value })}
                className="text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
            <div className="flex flex-col items-center">
                <input
                    type="number" min={5} max={120} step={5}
                    value={schedule.slot_duration_minutes}
                    onChange={e => onChange({ ...schedule, slot_duration_minutes: +e.target.value })}
                    className="w-full text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-center"
                />
                <span className="text-[10px] text-gray-400 mt-0.5">turno</span>
            </div>
            <div className="flex flex-col items-center">
                <input
                    type="number" min={0} max={30} step={5}
                    value={schedule.buffer_minutes}
                    onChange={e => onChange({ ...schedule, buffer_minutes: +e.target.value })}
                    className="w-full text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-center"
                />
                <span className="text-[10px] text-gray-400 mt-0.5">buffer</span>
            </div>
            <label className="flex items-center justify-center cursor-pointer">
                <input
                    type="checkbox"
                    checked={schedule.is_active}
                    onChange={e => onChange({ ...schedule, is_active: e.target.checked })}
                    className="sr-only peer"
                />
                <div className="relative w-9 h-5 bg-gray-200 peer-checked:bg-blue-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
            </label>
            <button
                onClick={onDelete}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}

// ─── Notification Rule Row ────────────────────────────────────────────────────

function NotificationRuleRow({
    rule,
    onChange,
    onDelete,
}: {
    rule: NotificationRule;
    onChange: (r: NotificationRule) => void;
    onDelete: () => void;
}) {
    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
            <div className="grid grid-cols-[1fr_120px_120px_120px_40px] gap-3 items-start">
                <div>
                    <input
                        type="text"
                        value={rule.name}
                        onChange={e => onChange({ ...rule, name: e.target.value })}
                        placeholder="Nombre de la regla"
                        className="w-full text-sm font-semibold px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                    <input
                        type="text"
                        value={rule.description ?? ''}
                        onChange={e => onChange({ ...rule, description: e.target.value })}
                        placeholder="Descripción (opcional)"
                        className="w-full mt-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-blue-500/20 focus:border-blue-400 outline-none"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                        Offset (horas)
                    </label>
                    <input
                        type="number" step={0.5}
                        value={rule.trigger_offset_hours}
                        onChange={e => onChange({ ...rule, trigger_offset_hours: +e.target.value })}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-center"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5 text-center">
                        {rule.trigger_offset_hours < 0
                            ? `${Math.abs(rule.trigger_offset_hours)}h antes`
                            : rule.trigger_offset_hours > 0
                            ? `${rule.trigger_offset_hours}h después`
                            : 'Al momento'}
                    </p>
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                        Canal
                    </label>
                    <select
                        value={rule.channel}
                        onChange={e => onChange({ ...rule, channel: e.target.value })}
                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none appearance-none"
                    >
                        {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>
                <div className="flex flex-col items-center pt-5">
                    <label className="flex items-center gap-1 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={rule.is_active}
                            onChange={e => onChange({ ...rule, is_active: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="relative w-9 h-5 bg-gray-200 peer-checked:bg-blue-600 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
                        <span className="text-xs text-gray-500">{rule.is_active ? 'Activa' : 'Inactiva'}</span>
                    </label>
                </div>
                <button
                    onClick={onDelete}
                    className="mt-5 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DoctorScheduleConfig() {
    const [doctors, setDoctors]               = useState<Doctor[]>([]);
    const [activeDoctorId, setActiveDoctorId] = useState<string>('');
    const [schedules, setSchedules]           = useState<DoctorSchedule[]>([]);
    const [rules, setRules]                   = useState<NotificationRule[]>([]);
    const [loading, setLoading]               = useState(true);
    const [saving, setSaving]                 = useState(false);
    const [savingRules, setSavingRules]       = useState(false);

    const supabase = createClient();

    useEffect(() => {
        async function loadDoctors() {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .in('role', ['owner', 'admin', 'developer', 'odontologo'])
                .order('full_name');
            setDoctors(data ?? []);
            if (data?.length) setActiveDoctorId(data[0].id);
        }
        async function loadRules() {
            const { data } = await supabase
                .from('notification_rules')
                .select('*')
                .order('trigger_offset_hours');
            setRules((data ?? []) as NotificationRule[]);
        }
        Promise.all([loadDoctors(), loadRules()]).then(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!activeDoctorId) return;
        supabase
            .from('doctor_schedules')
            .select('*')
            .eq('doctor_id', activeDoctorId)
            .order('day_of_week')
            .then(({ data }) => setSchedules((data ?? []) as DoctorSchedule[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDoctorId]);

    const addScheduleDay = () => {
        const existingDays = new Set(schedules.map(s => s.day_of_week));
        const nextDay = [1, 2, 3, 4, 5, 0, 6].find(d => !existingDays.has(d)) ?? 1;
        setSchedules(prev => [...prev, {
            doctor_id: activeDoctorId,
            day_of_week: nextDay,
            start_time: '08:00',
            end_time: '18:00',
            slot_duration_minutes: 30,
            buffer_minutes: 5,
            max_appointments: 12,
            is_active: true,
        }]);
    };

    const saveSchedules = async () => {
        setSaving(true);
        try {
            // Delete existing for this doctor, then upsert all
            await supabase.from('doctor_schedules').delete().eq('doctor_id', activeDoctorId);
            if (schedules.length > 0) {
                const { error } = await supabase
                    .from('doctor_schedules')
                    .insert(schedules.map(s => ({ ...s, id: undefined })));
                if (error) throw error;
            }
            toast.success('Horarios guardados correctamente');
        } catch (err) {
            console.error(err);
            toast.error('Error al guardar horarios');
        } finally {
            setSaving(false);
        }
    };

    const saveRules = async () => {
        setSavingRules(true);
        try {
            for (const rule of rules) {
                if (rule.id) {
                    await supabase.from('notification_rules').update(rule).eq('id', rule.id);
                } else {
                    await supabase.from('notification_rules').insert({ ...rule, id: undefined });
                }
            }
            toast.success('Reglas de recordatorio actualizadas');
        } catch (err) {
            console.error(err);
            toast.error('Error al guardar reglas');
        } finally {
            setSavingRules(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="animate-spin mr-2" size={18} />
                Cargando configuración...
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">

            {/* ── Doctor Schedules ──────────────────────────────────── */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Clock size={18} className="text-blue-600" />
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                            Horarios de atención por doctor
                        </h2>
                    </div>
                </div>

                {/* Doctor selector */}
                <div className="flex gap-2 mb-4 flex-wrap">
                    {doctors.map(doc => (
                        <button
                            key={doc.id}
                            onClick={() => setActiveDoctorId(doc.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                                activeDoctorId === doc.id
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                            }`}
                        >
                            <UserCircle2 size={16} />
                            {doc.full_name}
                        </button>
                    ))}
                </div>

                {activeDoctorId && (
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                        {/* Column headers */}
                        <div className="grid grid-cols-[80px_1fr_1fr_80px_80px_80px_40px] gap-2 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            <span>Día</span>
                            <span>Inicio</span>
                            <span>Fin</span>
                            <span className="text-center">Turno (min)</span>
                            <span className="text-center">Buffer</span>
                            <span className="text-center">Activo</span>
                            <span />
                        </div>

                        {schedules.length === 0 ? (
                            <p className="text-sm text-gray-400 italic py-4 text-center">
                                Sin horarios configurados. Agregá un día para comenzar.
                            </p>
                        ) : (
                            schedules
                                .sort((a, b) => a.day_of_week - b.day_of_week)
                                .map((s, idx) => (
                                    <ScheduleRow
                                        key={idx}
                                        schedule={s}
                                        onChange={(updated) => {
                                            setSchedules(prev => prev.map((x, i) => i === idx ? updated : x));
                                        }}
                                        onDelete={() => setSchedules(prev => prev.filter((_, i) => i !== idx))}
                                    />
                                ))
                        )}

                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <button
                                onClick={addScheduleDay}
                                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                                <Plus size={15} /> Agregar día
                            </button>
                            <button
                                onClick={saveSchedules}
                                disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Guardar horarios
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* ── Notification Rules ────────────────────────────────── */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Bell size={18} className="text-blue-600" />
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                                Reglas de recordatorio
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Configurá cuándo y cómo se envían los avisos al paciente.
                                Offset negativo = antes del turno · Positivo = después.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setRules(prev => [...prev, {
                            name: 'Nueva regla',
                            trigger_offset_hours: -24,
                            trigger_on_statuses: ['confirmed', 'pending'],
                            channel: 'both',
                            template_key: 'reminder_24h',
                            is_active: true,
                        }])}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                        <Plus size={15} /> Nueva regla
                    </button>
                </div>

                <div className="space-y-3">
                    {rules.map((rule, idx) => (
                        <NotificationRuleRow
                            key={rule.id ?? idx}
                            rule={rule}
                            onChange={(updated) => setRules(prev => prev.map((r, i) => i === idx ? updated : r))}
                            onDelete={() => setRules(prev => prev.filter((_, i) => i !== idx))}
                        />
                    ))}
                </div>

                <div className="flex justify-end mt-4">
                    <button
                        onClick={saveRules}
                        disabled={savingRules}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
                    >
                        {savingRules ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Guardar reglas
                    </button>
                </div>
            </section>

            {/* ── Integration Status ────────────────────────────────── */}
            <section>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                    Estado de integraciones
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { name: 'Google Calendar', key: 'GOOGLE_SERVICE_ACCOUNT_EMAIL',    desc: 'Importación histórica + sync incremental' },
                        { name: 'Calendly Webhook', key: 'CALENDLY_WEBHOOK_SECRET',         desc: 'Endpoint: /api/webhooks/calendly' },
                        { name: 'WhatsApp (Twilio)', key: 'TWILIO_ACCOUNT_SID',             desc: 'Recordatorios y encuestas post-turno' },
                    ].map(item => (
                        <div key={item.name} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-green-400" />
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                            </div>
                            <p className="text-xs text-gray-500">{item.desc}</p>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    Configurar variables de entorno en <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env.local</code> para activar cada integración.
                </p>
            </section>
        </div>
    );
}
