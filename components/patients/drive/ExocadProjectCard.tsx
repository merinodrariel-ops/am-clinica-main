'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Edit3, Eye, FileCode2, Loader2, Play, Save, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { setExocadDisplayNameAction } from '@/app/actions/patient-files-drive';
import type { ExocadProjectPresentation } from '@/lib/exocad-project-presentation';

interface ExocadProjectCardProps {
    presentation: ExocadProjectPresentation;
    patientFolder: string;
    canManage: boolean;
    onDisplayNameSaved: (fileId: string, displayName: string) => void;
}

function protocolUrl(mode: 'open' | 'check', patientFolder: string, relativePath: string): string {
    return `am-clinica-exocad://open?mode=${mode}&patientFolder=${encodeURIComponent(patientFolder)}&path=${encodeURIComponent(relativePath)}`;
}

function projectDirectory(relativePath: string): string {
    const separator = relativePath.lastIndexOf('/');
    return separator >= 0 ? relativePath.slice(0, separator) : '';
}

export default function ExocadProjectCard({
    presentation,
    patientFolder,
    canManage,
    onDisplayNameSaved,
}: ExocadProjectCardProps) {
    const { project, displayName, htmlPreview, imagePreview } = presentation;
    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState(displayName);
    const [saving, setSaving] = useState(false);
    const [showHtmlPreview, setShowHtmlPreview] = useState(false);
    const imageUrl = imagePreview
        ? `/api/drive/file/${imagePreview.id}?v=${encodeURIComponent(imagePreview.modifiedTime || imagePreview.createdTime)}`
        : '';

    async function saveDisplayName() {
        const cleanName = draftName.replace(/\s+/g, ' ').trim();
        if (!cleanName) {
            toast.error('Escribí un nombre para identificar el proyecto');
            return;
        }

        setSaving(true);
        const result = await setExocadDisplayNameAction(project.id, cleanName);
        setSaving(false);
        if (!result.success) {
            toast.error(result.error || 'No se pudo guardar el nombre');
            return;
        }

        onDisplayNameSaved(project.id, cleanName);
        setEditing(false);
        toast.success('Nombre visible guardado');
    }

    return (
        <>
            <article className="overflow-hidden rounded-2xl border border-orange-500/20 bg-white shadow-sm dark:bg-white/[0.035]">
                <div className="relative aspect-[16/10] bg-gradient-to-br from-orange-500/10 via-slate-900/5 to-slate-950/20">
                    {imagePreview ? (
                        <Image
                            src={imageUrl}
                            alt={`Preview de ${displayName}`}
                            fill
                            unoptimized
                            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                            className="object-cover"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-orange-400">
                            <FileCode2 size={34} />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Proyecto Exocad</span>
                        </div>
                    )}
                    <div className="absolute left-2 top-2 flex gap-1.5">
                        {htmlPreview && (
                            <span className="rounded-full bg-emerald-500/90 px-2 py-1 text-[10px] font-bold text-white shadow">
                                HTML 3D
                            </span>
                        )}
                        {imagePreview && (
                            <span className="rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white shadow">
                                JPG
                            </span>
                        )}
                    </div>
                </div>

                <div className="space-y-3 p-3">
                    {editing ? (
                        <div className="space-y-2">
                            <input
                                value={draftName}
                                onChange={event => setDraftName(event.target.value)}
                                onKeyDown={event => {
                                    if (event.key === 'Enter') void saveDisplayName();
                                    if (event.key === 'Escape') {
                                        setDraftName(displayName);
                                        setEditing(false);
                                    }
                                }}
                                maxLength={100}
                                autoFocus
                                className="w-full rounded-lg border border-orange-400/35 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900 outline-none ring-orange-400/30 focus:ring-2 dark:bg-slate-950 dark:text-white"
                                aria-label="Nombre visible del proyecto Exocad"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => void saveDisplayName()}
                                    disabled={saving}
                                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                                >
                                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                    Guardar nombre
                                </button>
                                <button
                                    onClick={() => {
                                        setDraftName(displayName);
                                        setEditing(false);
                                    }}
                                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 dark:border-white/10 dark:text-white/50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white" title={displayName}>
                                    {displayName}
                                </h4>
                                <p className="mt-0.5 truncate text-[10px] text-slate-400" title={project.name}>
                                    Archivo técnico: {project.name}
                                </p>
                            </div>
                            {canManage && (
                                <button
                                    onClick={() => setEditing(true)}
                                    className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-orange-500/10 hover:text-orange-500"
                                    title="Cambiar nombre visible"
                                    aria-label={`Cambiar nombre visible de ${displayName}`}
                                >
                                    <Edit3 size={14} />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        {htmlPreview ? (
                            <button
                                onClick={() => setShowHtmlPreview(true)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                            >
                                <Eye size={13} />
                                Ver HTML 3D
                            </button>
                        ) : (
                            <div className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-2 text-[11px] text-slate-400 dark:border-white/10">
                                <Eye size={13} />
                                Sin preview
                            </div>
                        )}
                        <button
                            onClick={() => {
                                window.location.href = protocolUrl('check', patientFolder, projectDirectory(project.relativePath || project.name));
                            }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/25 bg-blue-500/10 px-2 py-2 text-[11px] font-semibold text-blue-600 hover:bg-blue-500/15 dark:text-blue-400"
                            title="Crear, renombrar y eliminar un archivo temporal en esta carpeta"
                        >
                            <ShieldCheck size={13} />
                            Probar guardado
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            window.location.href = protocolUrl('open', patientFolder, project.relativePath || project.name);
                        }}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600"
                    >
                        <Play size={13} fill="currentColor" />
                        Diseñar en Exocad
                    </button>
                </div>
            </article>

            {showHtmlPreview && htmlPreview && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{displayName}</p>
                            <p className="text-xs text-white/45">Vista 3D HTML · solo lectura</p>
                        </div>
                        <button
                            onClick={() => setShowHtmlPreview(false)}
                            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/15"
                            aria-label="Cerrar preview HTML"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex-1 p-2 sm:p-4">
                        <iframe
                            src={`/api/drive/file/${htmlPreview.id}?v=${encodeURIComponent(htmlPreview.modifiedTime || htmlPreview.createdTime)}`}
                            title={`Preview 3D de ${displayName}`}
                            sandbox="allow-scripts allow-downloads allow-pointer-lock"
                            className="h-full w-full rounded-xl bg-white"
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
