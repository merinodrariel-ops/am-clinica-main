'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import CategoriaGuard from '@/components/auth/CategoriaGuard';

interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

const SUGGESTIONS = [
    '¿Cómo está la agenda de mañana?',
    'Buscá a la paciente González',
    'Agendá un turno de limpieza',
];

const WELCOME =
    '¡Hola! Soy el asistente de agenda 🦷\n\nPuedo buscar pacientes, mostrarte la agenda de un día y agendar turnos. Contame qué necesitás.';

export default function AsistentePage() {
    const [messages, setMessages] = useState<ChatTurn[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, sending]);

    async function sendMessage(text: string) {
        const trimmed = text.trim();
        if (!trimmed || sending) return;

        const nextMessages: ChatTurn[] = [...messages, { role: 'user', content: trimmed }];
        setMessages(nextMessages);
        setInput('');
        setSending(true);

        try {
            const res = await fetch('/api/asistente', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: nextMessages }),
            });
            const data = await res.json();
            const reply = res.ok
                ? (data.reply as string)
                : (data.error as string) || 'Hubo un problema. Probá de nuevo.';
            setMessages([...nextMessages, { role: 'assistant', content: reply }]);
        } catch {
            setMessages([
                ...nextMessages,
                { role: 'assistant', content: 'No pude conectarme. Revisá la conexión y probá de nuevo.' },
            ]);
        } finally {
            setSending(false);
        }
    }

    return (
        <CategoriaGuard allowedCategorias={['reception', 'admin', 'dr', 'developer', 'recaptacion']}>
            <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-2xl flex-col p-3 sm:p-6">
                {/* Header */}
                <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                        <Sparkles size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">Asistente de agenda</h1>
                        <p className="text-xs text-slate-400">Buscar pacientes · ver agenda · agendar turnos</p>
                    </div>
                </div>

                {/* Messages */}
                <div className="glass-card flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/10 p-4">
                    <Bubble role="assistant" content={WELCOME} />
                    {messages.map((m, i) => (
                        <Bubble key={i} role={m.role} content={m.content} />
                    ))}
                    {sending && (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                            <Loader2 size={16} className="animate-spin" />
                            Pensando...
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Suggestions (only before first message) */}
                {messages.length === 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                onClick={() => sendMessage(s)}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        sendMessage(input);
                    }}
                    className="mt-3 flex items-center gap-2"
                >
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Escribí o dictá tu pedido..."
                        className="h-12 flex-1 rounded-xl border border-white/10 bg-navy-900/50 px-4 text-sm text-slate-200 placeholder:text-slate-500 backdrop-blur-sm focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                        type="submit"
                        disabled={sending || !input.trim()}
                        className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-opacity disabled:opacity-40"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </CategoriaGuard>
    );
}

function Bubble({ role, content }: ChatTurn) {
    const isUser = role === 'user';
    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isUser
                    ? 'bg-gradient-to-r from-emerald-600/80 to-teal-500/80 text-white'
                    : 'border border-white/10 bg-white/5 text-slate-200'
                    }`}
            >
                {isUser ? (
                    <p className="whitespace-pre-wrap">{content}</p>
                ) : (
                    <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                        <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
}
