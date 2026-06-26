'use client';

import { useState } from 'react';
import { Clipboard, Cpu, FileCode2, MonitorCog } from 'lucide-react';
import { toast } from 'sonner';

import { EXOCAD_WINDOWS_GUIDE } from '@/lib/exocad-windows-guide';

function joinLines(lines: string[]) {
    return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

async function copyText(label: string, text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${label} copiado`);
    } catch {
        toast.error(`No se pudo copiar ${label.toLowerCase()}`);
    }
}

export default function ExocadWindowsGuide() {
    const [activeBlock, setActiveBlock] = useState<'human' | 'agent'>('human');

    const humanText = joinLines(EXOCAD_WINDOWS_GUIDE.humanSteps);
    const agentText = EXOCAD_WINDOWS_GUIDE.agentPrompt.join('\n');

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        <MonitorCog className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold">{EXOCAD_WINDOWS_GUIDE.title}</h3>
                        <p className="text-sm leading-6 opacity-90">{EXOCAD_WINDOWS_GUIDE.summary}</p>
                        <p className="text-xs font-medium uppercase tracking-wide">
                            Solo Windows
                        </p>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/60">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Ruta recomendada hoy</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Queda documentado lo que vimos en la instalacion actual hasta encontrar el MD definitivo.
                        </p>
                    </div>
                </div>
                <div className="space-y-3">
                    {EXOCAD_WINDOWS_GUIDE.technicalNotes.map((note) => (
                        <div
                            key={note}
                            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
                        >
                            {note}
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/60">
                <div className="mb-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveBlock('human')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                            activeBlock === 'human'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Clipboard className="h-4 w-4" />
                        Paso a paso humano
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveBlock('agent')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                            activeBlock === 'agent'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Cpu className="h-4 w-4" />
                        Prompt para agente
                    </button>
                </div>

                {activeBlock === 'human' ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Instrucciones operativas</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Para cuando lo haga una persona en una PC nueva con ExoCAD.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => copyText('Paso a paso', humanText)}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                <Clipboard className="h-4 w-4" />
                                Copiar
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={humanText}
                            className="min-h-[260px] w-full rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm leading-6 text-gray-800 dark:border-gray-700 dark:bg-gray-950/60 dark:text-gray-100"
                        />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Prompt de trabajo</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Para darselo a un agente y que prepare la PC Windows.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => copyText('Prompt', agentText)}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                <FileCode2 className="h-4 w-4" />
                                Copiar
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={agentText}
                            className="min-h-[260px] w-full rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm leading-6 text-gray-800 dark:border-gray-700 dark:bg-gray-950/60 dark:text-gray-100"
                        />
                    </div>
                )}
            </section>
        </div>
    );
}
