'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Eye,
    Mail,
    RefreshCw,
    Search,
    Send,
    Server,
    XCircle,
} from 'lucide-react';
import {
    EmailMessageDetail,
    EmailMessageListRow,
    ScheduledEmailRow,
    getEmailMessageDetailAction,
    getEmailProviderStatusAction,
    listEmailMessagesAction,
} from '@/app/actions/email-messages';
import {
    EMAIL_MESSAGE_STATUS_LABELS,
    EMAIL_MESSAGE_TYPE_LABELS,
    EmailProviderStatus,
    resolveEmailMessageStatusLabel,
    resolveEmailMessageTypeLabel,
} from '@/lib/email-message-tracking';

type TabKey = 'outbox' | 'scheduled' | 'templates' | 'providers';

type TemplateEntry = {
    key: string;
    label: string;
    description: string;
};

const TEMPLATES: TemplateEntry[] = [
    { key: 'reminder_24h', label: 'Recordatorio 24h', description: 'Se envia 24h antes del turno' },
    { key: 'reminder_1h', label: 'Recordatorio 1h', description: 'Se envia 1h antes del turno' },
    { key: 'appointment_confirmed', label: 'Turno confirmado', description: 'Al agendar un turno nuevo' },
    { key: 'appointment_cancelled', label: 'Turno cancelado', description: 'Cuando se cancela un turno' },
    { key: 'survey_post_appointment', label: 'Encuesta post-turno', description: 'Pedido de opinion tras la visita' },
    { key: 'survey_first_visit', label: 'Encuesta primera visita', description: 'Pedido de opinion para pacientes nuevos' },
    { key: 'birthday_greeting', label: 'Cumpleanos', description: 'Saludo automatico de cumpleanos' },
    { key: 'post_treatment_followup', label: 'Seguimiento post-tratamiento', description: 'Control posterior a cirugia o extraccion' },
    { key: 'recall_6_months', label: 'Recall 6 meses', description: 'Control preventivo semestral' },
    { key: 'recall_cleaning', label: 'Recall limpieza', description: 'Invita a agendar limpieza preventiva' },
    { key: 'upgrade_cleaning_laser', label: 'Upgrade a laser', description: 'Ofrece pasar de limpieza convencional a laser' },
    { key: 'recall_veneer_control', label: 'Control carillas', description: 'Recordatorio de control para pacientes con carillas' },
    { key: 'cross_sell_cleaning_after_veneers', label: 'Carillas + limpieza', description: 'Venta cruzada de limpieza desde control de carillas' },
    { key: 'recall_whitening', label: 'Recall blanqueamiento', description: 'Seguimiento para repetir o mantener blanqueamiento' },
    { key: 'recall_orthodontic_control', label: 'Control ortodoncia', description: 'Recordatorio para controles de ortodoncia y recambio' },
];

function patientName(row: { patient?: { nombre: string | null; apellido: string | null } | null; to_name?: string | null }) {
    const name = row.patient ? `${row.patient.nombre ?? ''} ${row.patient.apellido ?? ''}`.trim() : '';
    return name || row.to_name || 'Sin paciente';
}

function formatDate(value: string | null) {
    if (!value) return '-';
    return new Date(value).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
    });
}

function statusClasses(status: string) {
    if (status === 'sent') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'delivered') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'failed' || status === 'bounced') return 'bg-red-50 text-red-700 border-red-200';
    if (status === 'opened' || status === 'clicked') return 'bg-violet-50 text-violet-700 border-violet-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default function EmailsAdminClient({
    initialRows,
    initialScheduledRows,
    initialProviderStatus,
    initialTab = 'outbox',
}: {
    initialRows: EmailMessageListRow[];
    initialScheduledRows: ScheduledEmailRow[];
    initialProviderStatus: EmailProviderStatus;
    initialTab?: TabKey;
}) {
    const [tab, setTab] = useState<TabKey>(initialTab);
    const [rows, setRows] = useState(initialRows);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('');
    const [messageType, setMessageType] = useState('');
    const [providerStatus, setProviderStatus] = useState(initialProviderStatus);
    const [selected, setSelected] = useState<EmailMessageDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [template, setTemplate] = useState(TEMPLATES[0]);
    const [preview, setPreview] = useState<{ subject: string; html: string; whatsapp: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [sendingTest, setSendingTest] = useState(false);

    const monthlySummary = useMemo(() => {
        const byTemplate = new Map<string, number>();
        let sent = 0;
        let failed = 0;

        for (const row of rows) {
            if (row.status === 'sent' || row.status === 'delivered' || row.status === 'opened' || row.status === 'clicked') sent += 1;
            if (row.status === 'failed' || row.status === 'bounced') failed += 1;
            const key = row.template_label || row.template_key || 'Sin plantilla';
            byTemplate.set(key, (byTemplate.get(key) || 0) + 1);
        }

        const topTemplates = Array.from(byTemplate.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);

        return {
            total: rows.length,
            sent,
            failed,
            topTemplates,
        };
    }, [rows]);

    const filteredRows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return rows.filter((row) => {
            if (status && row.status !== status) return false;
            if (messageType && row.message_type !== messageType) return false;
            if (!needle) return true;
            return [
                row.to_email,
                row.to_name,
                row.subject,
                row.template_key,
                row.template_label,
                patientName(row),
            ].some((value) => (value || '').toLowerCase().includes(needle));
        });
    }, [rows, query, status, messageType]);

    useEffect(() => {
        if (tab !== 'templates') return;
        let cancelled = false;
        fetch(`/api/admin/email-templates?template=${template.key}`)
            .then((response) => response.json())
            .then((data) => {
                if (!cancelled) setPreview(data);
            })
            .catch(() => {
                if (!cancelled) setPreview(null);
            })
            .finally(() => {
                if (!cancelled) setPreviewLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tab, template]);

    async function refreshRows() {
        const nextRows = await listEmailMessagesAction({});
        const nextStatus = await getEmailProviderStatusAction();
        setRows(nextRows);
        setProviderStatus(nextStatus);
    }

    async function openDetail(id: string) {
        setDetailLoading(true);
        const detail = await getEmailMessageDetailAction(id);
        setSelected(detail);
        setDetailLoading(false);
    }

    async function sendTemplateTest(event: React.FormEvent) {
        event.preventDefault();
        if (!testEmail.trim()) return;
        setSendingTest(true);
        setTestResult(null);
        const response = await fetch('/api/admin/email-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: template.key, to: testEmail.trim() }),
        });
        const data = await response.json();
        setSendingTest(false);
        setTestResult(data.success ? `Prueba enviada a ${testEmail.trim()}` : data.error || 'No se pudo enviar la prueba');
        if (data.success) await refreshRows();
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-950">
            <div className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 md:px-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Comunicaciones</p>
                            <h1 className="mt-1 text-2xl font-bold tracking-tight">Emails</h1>
                            <p className="mt-1 text-sm text-slate-500">
                                Bandeja de salida, plantillas y proveedores. Enviado significa aceptado por proveedor, no entregado.
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                                El historial combina `email_messages` con `notification_logs` para recuperar al menos el ultimo mes operativo.
                            </p>
                        </div>
                        <button
                            onClick={refreshRows}
                            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            <RefreshCw size={16} />
                            Actualizar
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {[
                            ['outbox', 'Salida', Mail],
                            ['scheduled', 'Programados', Clock3],
                            ['templates', 'Plantillas', Send],
                            ['providers', 'Proveedores', Server],
                        ].map(([key, label, Icon]) => (
                            <button
                                key={key as string}
                                onClick={() => setTab(key as TabKey)}
                                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                                    tab === key
                                        ? 'bg-slate-950 text-white'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                <Icon size={15} />
                                {label as string}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
                {tab === 'outbox' && (
                    <div className="space-y-4">
                        <section className="grid gap-3 md:grid-cols-4">
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ultimo mes</p>
                                <p className="mt-2 text-2xl font-bold text-slate-950">{monthlySummary.total}</p>
                                <p className="mt-1 text-xs text-slate-500">emails visibles en bandeja</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Aceptados</p>
                                <p className="mt-2 text-2xl font-bold text-slate-950">{monthlySummary.sent}</p>
                                <p className="mt-1 text-xs text-slate-500">sent, delivered, opened o clicked</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Con fallo</p>
                                <p className="mt-2 text-2xl font-bold text-slate-950">{monthlySummary.failed}</p>
                                <p className="mt-1 text-xs text-slate-500">failed o bounced</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Top plantillas</p>
                                <div className="mt-2 space-y-1">
                                    {monthlySummary.topTemplates.length > 0 ? monthlySummary.topTemplates.map(([label, count]) => (
                                        <div key={label} className="flex items-center justify-between text-sm text-slate-700">
                                            <span className="truncate pr-3">{label}</span>
                                            <strong>{count}</strong>
                                        </div>
                                    )) : (
                                        <p className="text-xs text-slate-500">Sin datos</p>
                                    )}
                                </div>
                            </div>
                        </section>

                        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
                        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <div className="flex flex-col gap-3 border-b border-slate-200 p-3 md:flex-row md:items-center">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
                                    <input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Buscar paciente, email, asunto o plantilla"
                                        className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-slate-500"
                                    />
                                </div>
                                <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm">
                                    <option value="">Todos los estados</option>
                                    {Object.entries(EMAIL_MESSAGE_STATUS_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                <select value={messageType} onChange={(event) => setMessageType(event.target.value)} className="h-10 rounded-md border border-slate-300 px-3 text-sm">
                                    <option value="">Todos los tipos</option>
                                    {Object.entries(EMAIL_MESSAGE_TYPE_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                        <tr>
                                            <th className="px-3 py-3 text-left">Fecha</th>
                                            <th className="px-3 py-3 text-left">Estado</th>
                                            <th className="px-3 py-3 text-left">Paciente / Email</th>
                                            <th className="px-3 py-3 text-left">Tipo</th>
                                            <th className="px-3 py-3 text-left">Asunto</th>
                                            <th className="px-3 py-3 text-left">Proveedor</th>
                                            <th className="px-3 py-3 text-right">Detalle</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredRows.map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-50">
                                                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(row.created_at)}</td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(row.status)}`}>
                                                        {resolveEmailMessageStatusLabel(row.status)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <p className="font-semibold text-slate-900">{patientName(row)}</p>
                                                    <p className="text-xs text-slate-500">{row.to_email}</p>
                                                </td>
                                                <td className="px-3 py-3 text-slate-700">{resolveEmailMessageTypeLabel(row.message_type)}</td>
                                                <td className="max-w-[320px] truncate px-3 py-3 text-slate-700">{row.subject}</td>
                                                <td className="px-3 py-3 text-slate-600">{row.provider}</td>
                                                <td className="px-3 py-3 text-right">
                                                    <button
                                                        onClick={() => openDetail(row.id)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100"
                                                        title="Ver detalle"
                                                    >
                                                        <Eye size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredRows.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">
                                                    No hay emails para esos filtros.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <aside className="rounded-lg border border-slate-200 bg-white">
                            <div className="border-b border-slate-200 p-4">
                                <h2 className="text-sm font-bold">Detalle</h2>
                                <p className="mt-1 text-xs text-slate-500">Snapshot tecnico del intento seleccionado.</p>
                            </div>
                            {detailLoading && <p className="p-4 text-sm text-slate-500">Cargando detalle...</p>}
                            {!detailLoading && !selected && <p className="p-4 text-sm text-slate-500">Selecciona un email para inspeccionarlo.</p>}
                            {!detailLoading && selected && (
                                <div className="space-y-4 p-4 text-sm">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-slate-500">Asunto</p>
                                        <p className="font-semibold">{selected.subject}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Fuente: {selected.data_source === 'notification_logs' ? 'notification_logs' : 'email_messages'} · Origen: {selected.source_module}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                                            <p>{resolveEmailMessageStatusLabel(selected.status)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Proveedor</p>
                                            <p>{selected.provider}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Enviado</p>
                                            <p>{formatDate(selected.sent_at)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Entregado</p>
                                            <p>{formatDate(selected.delivered_at)}</p>
                                        </div>
                                    </div>
                                    {selected.error_message && (
                                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                                            {selected.error_message}
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-slate-500">Provider ID</p>
                                        <p className="break-all font-mono text-xs text-slate-600">{selected.provider_message_id || '-'}</p>
                                    </div>
                                    {selected.html_snapshot && (
                                        <iframe
                                            srcDoc={selected.html_snapshot}
                                            className="h-[360px] w-full rounded-md border border-slate-200 bg-white"
                                            sandbox="allow-same-origin"
                                            title="Preview email enviado"
                                        />
                                    )}
                                    {!selected.html_snapshot && (
                                        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
                                            Este registro viene de auditoria historica. Todavia no hay snapshot HTML guardado para ese envio.
                                        </div>
                                    )}
                                </div>
                            )}
                        </aside>
                        </div>
                    </div>
                )}

                {tab === 'scheduled' && (
                    <section className="rounded-lg border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 p-4">
                            <h2 className="text-sm font-bold">Emails programados</h2>
                            <p className="mt-1 text-xs text-slate-500">Lectura de `scheduled_messages` para emails pendientes.</p>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {initialScheduledRows.map((row) => (
                                <div key={row.id} className="grid gap-2 p-4 text-sm md:grid-cols-[160px_1fr_1fr]">
                                    <span className="font-semibold text-slate-700">{formatDate(row.scheduled_for)}</span>
                                    <span>
                                        <strong>{patientName(row)}</strong>
                                        <br />
                                        <span className="text-xs text-slate-500">{row.email || 'Sin email'}</span>
                                    </span>
                                    <span className="text-slate-600">{row.subject || row.message.slice(0, 90)}</span>
                                </div>
                            ))}
                            {initialScheduledRows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No hay emails programados pendientes.</p>}
                        </div>
                    </section>
                )}

                {tab === 'templates' && (
                    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                        <aside className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="space-y-1">
                                {TEMPLATES.map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => {
                                            setPreview(null);
                                            setPreviewLoading(true);
                                            setTemplate(item);
                                        }}
                                        className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                                            template.key === item.key ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100'
                                        }`}
                                    >
                                        <span className="font-semibold">{item.label}</span>
                                        <span className={`mt-0.5 block text-xs ${template.key === item.key ? 'text-slate-300' : 'text-slate-500'}`}>
                                            {item.description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </aside>
                        <section className="rounded-lg border border-slate-200 bg-white">
                            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h2 className="text-sm font-bold">{template.label}</h2>
                                    <p className="mt-1 text-xs text-slate-500">{preview?.subject || 'Cargando asunto...'}</p>
                                </div>
                                <form onSubmit={sendTemplateTest} className="flex gap-2">
                                    <input
                                        type="email"
                                        value={testEmail}
                                        onChange={(event) => setTestEmail(event.target.value)}
                                        placeholder="email de prueba"
                                        className="h-10 w-56 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                                    />
                                    <button
                                        disabled={sendingTest || !testEmail.trim()}
                                        className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white disabled:opacity-50"
                                    >
                                        <Send size={15} />
                                        {sendingTest ? 'Enviando' : 'Probar'}
                                    </button>
                                </form>
                            </div>
                            {testResult && <p className="border-b border-slate-200 px-4 py-2 text-sm text-slate-600">{testResult}</p>}
                            {previewLoading && <p className="p-8 text-sm text-slate-500">Cargando preview...</p>}
                            {!previewLoading && preview && (
                                <iframe
                                    srcDoc={preview.html}
                                    className="h-[680px] w-full bg-white"
                                    sandbox="allow-same-origin"
                                    title="Preview plantilla"
                                />
                            )}
                        </section>
                    </div>
                )}

                {tab === 'providers' && (
                    <section className="grid gap-4 md:grid-cols-2">
                        {providerStatus.providers.map((provider) => (
                            <div key={provider.key} className="rounded-lg border border-slate-200 bg-white p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{provider.mode}</p>
                                        <h2 className="mt-1 text-xl font-bold">{provider.label}</h2>
                                    </div>
                                    {provider.configured ? (
                                        <CheckCircle2 className="text-emerald-600" size={22} />
                                    ) : (
                                        <XCircle className="text-red-600" size={22} />
                                    )}
                                </div>
                                <p className="mt-4 text-sm text-slate-600">{provider.notes}</p>
                                <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
                                    <p><strong>Estado:</strong> {provider.configured ? 'Configurado' : 'Falta configurar'}</p>
                                    <p><strong>Remitente:</strong> {provider.from || '-'}</p>
                                    <p><strong>Activo:</strong> {provider.key === providerStatus.activeProvider ? 'Si' : 'No'}</p>
                                </div>
                                {provider.key !== providerStatus.activeProvider && (
                                    <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                        <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                                        No se usa como proveedor transaccional en este corte.
                                    </div>
                                )}
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </div>
    );
}
