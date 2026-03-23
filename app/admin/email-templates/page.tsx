'use client';

import { useState, useEffect } from 'react';

// ─── Template catalogue ────────────────────────────────────────────────────────

type TemplateEntry = {
    key: string;
    label: string;
    description: string;
    icon: string;
    category: 'notification' | 'transactional';
};

const TEMPLATES: TemplateEntry[] = [
    // Notification templates (from AM-Scheduler)
    { key: 'reminder_24h',           label: 'Recordatorio 24h',         description: 'Se envía 24h antes del turno',             icon: '🔔', category: 'notification' },
    { key: 'reminder_1h',            label: 'Recordatorio 1h',           description: 'Se envía 1h antes del turno',              icon: '⏰', category: 'notification' },
    { key: 'appointment_confirmed',  label: 'Turno confirmado',          description: 'Al agendar un turno nuevo',                icon: '✅', category: 'notification' },
    { key: 'appointment_cancelled',  label: 'Turno cancelado',           description: 'Cuando se cancela un turno',               icon: '❌', category: 'notification' },
    { key: 'survey_post_appointment',label: 'Encuesta post-turno',       description: 'Pedido de opinión tras la visita',         icon: '⭐', category: 'notification' },
    { key: 'birthday_greeting',      label: 'Saludo de cumpleaños',      description: 'Enviado el día del cumple del paciente',   icon: '🎉', category: 'notification' },
    { key: 'post_treatment_followup',label: 'Seguimiento post-tratamiento', description: 'Al día siguiente de cirugía/extracción', icon: '🩺', category: 'notification' },
    { key: 'recall_6_months',        label: 'Recall 6 meses',            description: 'Control preventivo a los 6 meses',         icon: '🦷', category: 'notification' },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
    const [selected, setSelected] = useState<TemplateEntry>(TEMPLATES[0]);
    const [preview, setPreview] = useState<{ subject: string; html: string; whatsapp: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'email' | 'whatsapp'>('email');
    const [testEmail, setTestEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

    // Load preview whenever selected template changes
    useEffect(() => {
        setPreview(null);
        setSendResult(null);
        setLoading(true);

        fetch(`/api/admin/email-templates?template=${selected.key}`)
            .then(r => r.json())
            .then(data => {
                setPreview(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [selected]);

    async function handleSendTest(e: React.FormEvent) {
        e.preventDefault();
        if (!testEmail || !preview) return;

        setSending(true);
        setSendResult(null);

        const res = await fetch('/api/admin/email-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: selected.key, to: testEmail }),
        });
        const data = await res.json();

        setSending(false);
        if (data.success) {
            setSendResult({ ok: true, msg: `Email enviado a ${testEmail}` });
        } else {
            setSendResult({ ok: false, msg: data.error || 'Error desconocido' });
        }
    }

    return (
        <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

            {/* Sidebar */}
            <aside className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
                <div className="px-5 py-5 border-b border-gray-800">
                    <h1 className="text-lg font-bold text-white">Templates de Email</h1>
                    <p className="text-xs text-gray-400 mt-1">Preview + envío de prueba</p>
                </div>

                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-gray-500 font-semibold mt-2">
                        Notificaciones automáticas
                    </p>
                    {TEMPLATES.filter(t => t.category === 'notification').map(t => (
                        <button
                            key={t.key}
                            onClick={() => setSelected(t)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                                selected.key === t.key
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-800'
                            }`}
                        >
                            <span className="mr-2">{t.icon}</span>
                            <span className="text-sm font-medium">{t.label}</span>
                            <p className={`text-xs mt-0.5 ml-6 ${selected.key === t.key ? 'text-blue-200' : 'text-gray-500'}`}>
                                {t.description}
                            </p>
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main area */}
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* Header bar */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/60 backdrop-blur">
                    <div>
                        <h2 className="font-semibold text-white flex items-center gap-2">
                            <span className="text-xl">{selected.icon}</span>
                            {selected.label}
                        </h2>
                        {preview && (
                            <p className="text-xs text-gray-400 mt-0.5">Asunto: {preview.subject}</p>
                        )}
                    </div>

                    {/* Test send form */}
                    <form onSubmit={handleSendTest} className="flex items-center gap-2">
                        <input
                            type="email"
                            placeholder="tu@email.com"
                            value={testEmail}
                            onChange={e => setTestEmail(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 w-52 focus:outline-none focus:border-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={sending || !testEmail}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                        >
                            {sending ? 'Enviando…' : '📨 Enviar prueba'}
                        </button>
                    </form>
                </div>

                {/* Send result banner */}
                {sendResult && (
                    <div className={`mx-6 mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
                        sendResult.ok ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-red-900/50 text-red-300 border border-red-700'
                    }`}>
                        {sendResult.ok ? '✅' : '❌'} {sendResult.msg}
                    </div>
                )}

                {/* Tab switcher */}
                <div className="flex gap-1 px-6 pt-4">
                    <button
                        onClick={() => setTab('email')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            tab === 'email' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                    >
                        📧 Email HTML
                    </button>
                    <button
                        onClick={() => setTab('whatsapp')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            tab === 'whatsapp' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                    >
                        💬 WhatsApp
                    </button>
                </div>

                {/* Preview content */}
                <div className="flex-1 overflow-hidden px-6 pb-6 pt-3">
                    {loading && (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <div className="animate-spin w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full mr-3" />
                            Cargando preview…
                        </div>
                    )}

                    {!loading && preview && tab === 'email' && (
                        <iframe
                            srcDoc={preview.html}
                            className="w-full h-full rounded-xl border border-gray-700 bg-white"
                            title="Email preview"
                            sandbox="allow-same-origin"
                        />
                    )}

                    {!loading && preview && tab === 'whatsapp' && (
                        <div className="h-full flex items-start justify-center pt-8">
                            <div className="max-w-sm w-full">
                                {/* WhatsApp bubble mock */}
                                <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg">
                                    <p className="text-xs text-green-400 font-semibold mb-2">AM Clínica</p>
                                    <p className="text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">
                                        {preview.whatsapp}
                                    </p>
                                    <p className="text-right text-xs text-gray-500 mt-2">10:00 ✓✓</p>
                                </div>
                                <p className="text-xs text-gray-600 text-center mt-4">
                                    Vista previa del mensaje de WhatsApp (Twilio)
                                </p>

                                {/* Raw text area for copy */}
                                <div className="mt-6">
                                    <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wider">Texto plano</p>
                                    <textarea
                                        readOnly
                                        value={preview.whatsapp}
                                        rows={8}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono resize-none focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
