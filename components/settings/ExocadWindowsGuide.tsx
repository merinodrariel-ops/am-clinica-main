'use client';

import { useState } from 'react';
import { Clipboard, Cpu, FileCode2, MonitorCog, Download, Check, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

import { EXOCAD_WINDOWS_GUIDE } from '@/lib/exocad-windows-guide';

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
    const [copiedCommand, setCopiedCommand] = useState(false);

    const agentText = EXOCAD_WINDOWS_GUIDE.agentPrompt.join('\n');
    const runCommandText = "Set-ExecutionPolicy Bypass -Scope Process -Force; .\\install-protocol.ps1";

    const handleCopyCommand = async () => {
        await copyText('Comando de instalación', runCommandText);
        setCopiedCommand(true);
        setTimeout(() => setCopiedCommand(false), 2000);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header info */}
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="mt-0.5 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        <MonitorCog className="h-6 w-6" />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-lg font-bold">{EXOCAD_WINDOWS_GUIDE.title}</h3>
                        <p className="text-sm leading-6 opacity-90">{EXOCAD_WINDOWS_GUIDE.summary}</p>
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            Solo Windows
                        </span>
                    </div>
                </div>
            </section>

            {/* Selector */}
            <div className="flex border-b border-gray-200 dark:border-gray-800">
                <button
                    onClick={() => setActiveBlock('human')}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                        activeBlock === 'human'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                >
                    Guía para Usuarios (Humano)
                </button>
                <button
                    onClick={() => setActiveBlock('agent')}
                    className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                        activeBlock === 'agent'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                    }`}
                >
                    Prompt para Agentes (AI)
                </button>
            </div>

            {activeBlock === 'human' ? (
                <div className="space-y-6">
                    {/* Descargas */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/60 space-y-4">
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Paso 1: Descargar archivos de instalación</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Guarda ambos scripts en la misma carpeta local de la PC donde deseas configurar Exocad.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <a
                                href="/setup-exocad/install-protocol.ps1"
                                download="install-protocol.ps1"
                                className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-blue-500 dark:border-gray-700 dark:hover:border-blue-500 bg-gray-50 dark:bg-gray-800/40 transition-all group"
                            >
                                <div className="flex items-center gap-2.5">
                                    <FileCode2 className="h-5 w-5 text-blue-500" />
                                    <div className="text-left">
                                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">install-protocol.ps1</p>
                                        <p className="text-[10px] text-gray-400">Instalador de registro</p>
                                    </div>
                                </div>
                                <Download className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </a>
                            <a
                                href="/setup-exocad/open-exocad.ps1"
                                download="open-exocad.ps1"
                                className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-blue-500 dark:border-gray-700 dark:hover:border-blue-500 bg-gray-50 dark:bg-gray-800/40 transition-all group"
                            >
                                <div className="flex items-center gap-2.5">
                                    <FileCode2 className="h-5 w-5 text-orange-500" />
                                    <div className="text-left">
                                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">open-exocad.ps1</p>
                                        <p className="text-[10px] text-gray-400">Script lanzador local</p>
                                    </div>
                                </div>
                                <Download className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </a>
                        </div>
                    </div>

                    {/* Pasos a seguir */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Paso 2: Seguir las instrucciones de instalación</h4>
                        <div className="space-y-3">
                            {EXOCAD_WINDOWS_GUIDE.humanSteps.slice(2).map((step, idx) => (
                                <div
                                    key={step}
                                    className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/20"
                                >
                                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 text-xs font-bold">
                                        {idx + 1}
                                    </div>
                                    <p className="text-sm leading-6 text-gray-700 dark:text-gray-300 font-medium">
                                        {step}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Comando rápido */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/60 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Alternativa: Ejecución por consola</h4>
                            <button
                                onClick={handleCopyCommand}
                                className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                            >
                                {copiedCommand ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                                {copiedCommand ? 'Copiado' : 'Copiar comando'}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Abre PowerShell en la carpeta donde descargaste los scripts y ejecuta:
                        </p>
                        <code className="block p-3 rounded-lg bg-gray-900 text-gray-100 text-xs font-mono select-all overflow-x-auto border border-gray-800">
                            {runCommandText}
                        </code>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Prompt de trabajo</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Copia y pega esto para que un agente AI (como Hermes) configure la PC de forma programática.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => copyText('Prompt', agentText)}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            <Clipboard className="h-4 w-4" />
                            Copiar Prompt
                        </button>
                    </div>
                    <textarea
                        readOnly
                        value={agentText}
                        className="min-h-[300px] w-full rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-5 text-gray-800 dark:border-gray-700 dark:bg-gray-950/60 dark:text-gray-100"
                    />
                </div>
            )}

            {/* Notas técnicas */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900/60">
                <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3">Notas Técnicas de la Integración</h4>
                <div className="space-y-2">
                    {EXOCAD_WINDOWS_GUIDE.technicalNotes.map((note) => (
                        <div
                            key={note}
                            className="flex gap-2.5 items-start text-xs text-gray-600 dark:text-gray-400"
                        >
                            <HelpCircle className="h-4 w-4 mt-0.5 text-gray-400 flex-shrink-0" />
                            <p className="leading-5">{note}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
