'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, Download, Eye, Instagram, Link, Loader2, Mail, MapPin, Search, UserCheck } from 'lucide-react';
import {
    createJobApplicationCvSignedUrl,
    type GroupedJobApplicationRow,
    updateJobApplicationReview,
} from '@/app/actions/job-applications';
import {
    JOB_APPLICATION_AREAS,
    JOB_APPLICATION_STATUSES,
    JOB_APPLICATION_STATUS_LABELS,
    type JobApplicationStatus,
} from '@/lib/job-applications';

type Draft = {
    status: JobApplicationStatus;
    review_notes: string;
};

function formatDate(value: string) {
    return new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function fileSizeLabel(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInstagramHref(handleOrUrl: string) {
    if (!handleOrUrl) return '';
    const trimmed = handleOrUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    const username = trimmed.startsWith('@') ? trimmed.substring(1) : trimmed;
    return `https://instagram.com/${encodeURIComponent(username)}`;
}

function getInstagramLabel(handleOrUrl: string) {
    if (!handleOrUrl) return '';
    const trimmed = handleOrUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const url = new URL(trimmed);
            return url.pathname.replace(/\//g, '') || trimmed;
        } catch {
            return trimmed;
        }
    }
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

export default function JobApplicationsAdminPanel({ initialRows }: { initialRows: GroupedJobApplicationRow[] }) {
    const [rows, setRows] = useState(initialRows);
    const [statusFilter, setStatusFilter] = useState('todos');
    const [areaFilter, setAreaFilter] = useState('todas');
    const [search, setSearch] = useState('');
    const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(
        initialRows.map((row) => [row.id, { status: row.status, review_notes: row.review_notes || '' }])
    ));
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [copied, setCopied] = useState(false);

    function copyFormLink() {
        const link = areaFilter && areaFilter !== 'todas'
            ? `https://www.amesteticadental.com/trabaja-en-am?area=${encodeURIComponent(areaFilter)}`
            : `https://www.amesteticadental.com/trabaja-en-am`;

        navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch((err) => {
            console.error('Failed to copy text: ', err);
        });
    }

    const [cvUrls, setCvUrls] = useState<Record<string, string>>({});
    const [activePreviews, setActivePreviews] = useState<Record<string, boolean>>({});
    const [loadingCvId, setLoadingCvId] = useState<string | null>(null);

    async function togglePreview(row: GroupedJobApplicationRow) {
        if (activePreviews[row.id]) {
            setActivePreviews((prev) => ({ ...prev, [row.id]: false }));
            return;
        }

        if (cvUrls[row.id]) {
            setActivePreviews((prev) => ({ ...prev, [row.id]: true }));
            return;
        }

        setLoadingCvId(row.id);
        const result = await createJobApplicationCvSignedUrl(row.id);
        setLoadingCvId(null);

        if (!result.success || !result.url) {
            window.alert(result.error || 'No se pudo abrir la vista previa.');
            return;
        }

        // Append a dummy parameter ending in .pdf to help browser PDF plugins render it inline
        const previewUrl = result.url.includes('?') ? `${result.url}&file=.pdf` : `${result.url}?file=.pdf`;

        setCvUrls((prev) => ({ ...prev, [row.id]: previewUrl }));
        setActivePreviews((prev) => ({ ...prev, [row.id]: true }));
    }

    const filtered = useMemo(() => {
        const rawSearch = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (statusFilter !== 'todos' && row.status !== statusFilter) return false;
            if (areaFilter !== 'todas' && !row.applications.some((application) => application.area === areaFilter)) return false;
            if (!rawSearch) return true;
            return `${row.full_name} ${row.email}`.toLowerCase().includes(rawSearch);
        });
    }, [areaFilter, rows, search, statusFilter]);

    const counts = useMemo(() => {
        return JOB_APPLICATION_STATUSES.reduce((acc, status) => {
            acc[status] = rows.filter((row) => row.status === status).length;
            return acc;
        }, {} as Record<JobApplicationStatus, number>);
    }, [rows]);

    function updateDraft(id: string, patch: Partial<Draft>) {
        setDrafts((prev) => ({
            ...prev,
            [id]: {
                status: prev[id]?.status || 'nuevo',
                review_notes: prev[id]?.review_notes || '',
                ...patch,
            },
        }));
    }

    function saveReview(row: GroupedJobApplicationRow) {
        const draft = drafts[row.id];
        if (!draft) return;

        setPendingId(row.id);
        startTransition(async () => {
            const result = await updateJobApplicationReview({
                id: row.id,
                status: draft.status,
                review_notes: draft.review_notes,
            });

            if (result.success) {
                setRows((prev) => prev.map((item) => item.id === row.id
                    ? { ...item, status: draft.status, review_notes: draft.review_notes || null, reviewed_at: new Date().toISOString() }
                    : item
                ));
            } else {
                window.alert(result.error || 'No se pudo actualizar.');
            }
            setPendingId(null);
        });
    }

    async function openCv(row: GroupedJobApplicationRow) {
        setPendingId(row.id);
        const result = await createJobApplicationCvSignedUrl(row.id);
        setPendingId(null);

        if (!result.success || !result.url) {
            window.alert(result.error || 'No se pudo abrir el CV.');
            return;
        }

        window.open(result.url, '_blank', 'noopener,noreferrer');
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {JOB_APPLICATION_STATUSES.map((status) => (
                    <div key={status} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{JOB_APPLICATION_STATUS_LABELS[status]}</p>
                        <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{counts[status] || 0}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:grid-cols-[1fr_200px_200px_auto]">
                <label className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar por nombre o email"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    />
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                    <option value="todos">Todos los estados</option>
                    {JOB_APPLICATION_STATUSES.map((status) => (
                        <option key={status} value={status}>{JOB_APPLICATION_STATUS_LABELS[status]}</option>
                    ))}
                </select>
                <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                    <option value="todas">Todas las áreas</option>
                    {JOB_APPLICATION_AREAS.map((area) => (
                        <option key={area} value={area}>{area}</option>
                    ))}
                </select>
                <button
                    onClick={copyFormLink}
                    title="Copiar el link del formulario público de postulación"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                    {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Link className="h-4 w-4" />}
                    <span>{copied ? '¡Copiado!' : 'Copiar link'}</span>
                </button>
            </div>

            <div className="space-y-4">
                {filtered.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-800">
                        No hay postulaciones para estos filtros.
                    </div>
                ) : filtered.map((row) => {
                    const draft = drafts[row.id] || { status: row.status, review_notes: row.review_notes || '' };
                    const savingThis = pendingId === row.id && isPending;

                    return (
                        <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-xl font-bold text-slate-950 dark:text-white">{row.full_name}</h2>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                            {JOB_APPLICATION_STATUS_LABELS[row.status]}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-500">{formatDate(row.created_at)} · {row.area}{row.other_area ? ` · ${row.other_area}` : ''}</p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Postulaciones</span>
                                        {row.applications.map((application) => (
                                            <span
                                                key={application.id}
                                                title={formatDate(application.created_at)}
                                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                    application.isDuplicate
                                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                                                        : 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200'
                                                }`}
                                            >
                                                {application.area}{application.other_area ? ` · ${application.other_area}` : ''}
                                                {application.isDuplicate ? ' · duplicada' : ''}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-y-2 gap-x-4 text-sm">
                                        <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition">
                                            <Mail className="h-4 w-4 text-slate-400" />
                                            <span>{row.email}</span>
                                        </a>
                                        <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                            <MapPin className="h-4 w-4 text-slate-400" />
                                            <span>{row.location}</span>
                                        </span>
                                        {row.instagram_url && (
                                            <a
                                                href={getInstagramHref(row.instagram_url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-pink-600 hover:text-pink-700 dark:text-pink-400 dark:hover:text-pink-300 transition"
                                            >
                                                <Instagram className="h-4 w-4" />
                                                <span>{getInstagramLabel(row.instagram_url)}</span>
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => togglePreview(row)}
                                        disabled={loadingCvId === row.id}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                                    >
                                        {loadingCvId === row.id ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                                        {activePreviews[row.id] ? 'Cerrar' : 'Previsualizar'}
                                    </button>
                                    <button onClick={() => openCv(row)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                                        {pendingId === row.id && !isPending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                        Descargar CV ({fileSizeLabel(row.cv_size_bytes)})
                                    </button>
                                </div>
                            </div>

                            <div className="mt-5 grid gap-4 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-2">
                                <p><strong>Experiencia:</strong> {row.experience}</p>
                                <p><strong>Funciones del área:</strong> {row.area_responsibilities}</p>
                                <p><strong>Equipo:</strong> {row.teamwork_answer}</p>
                                <p><strong>Aprendizaje:</strong> {row.learning_interest}</p>
                                <p><strong>Metas:</strong> {row.long_term_goals}</p>
                                <p><strong>Aporte:</strong> {row.team_contribution}</p>
                                <p className="md:col-span-2"><strong>Por qué elegirle:</strong> {row.why_choose_you}</p>
                            </div>

                            {activePreviews[row.id] && (
                                <div className="mt-5 border border-slate-200 rounded-xl overflow-hidden bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                                    {(row.cv_mime_type === 'application/pdf' || row.cv_original_filename.toLowerCase().endsWith('.pdf')) ? (
                                        <div className="flex flex-col">
                                            <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs flex justify-between items-center text-slate-500 border-b border-slate-200 dark:border-slate-800">
                                                <span className="font-semibold">Vista previa en pantalla</span>
                                                <a
                                                    href={cvUrls[row.id]}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold transition"
                                                >
                                                    Abrir en pestaña nueva ↗
                                                </a>
                                            </div>
                                            <iframe
                                                src={cvUrls[row.id]}
                                                className="w-full h-[600px] border-0 bg-white"
                                                title={`Vista previa CV - ${row.full_name}`}
                                            />
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-slate-500">
                                            <p className="font-semibold text-slate-700 dark:text-slate-300">Previsualización no disponible</p>
                                            <p className="mt-1 text-sm text-slate-400">
                                                Navegadores web solo pueden previsualizar archivos PDF en pantalla.
                                            </p>
                                            <p className="mt-2 text-sm text-slate-400">
                                                Para ver este archivo ({row.cv_original_filename}), podés descargarlo usando el botón superior.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 md:grid-cols-[220px_1fr_auto]">
                                <select value={draft.status} onChange={(event) => updateDraft(row.id, { status: event.target.value as JobApplicationStatus })} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                                    {JOB_APPLICATION_STATUSES.map((status) => (
                                        <option key={status} value={status}>{JOB_APPLICATION_STATUS_LABELS[status]}</option>
                                    ))}
                                </select>
                                <input
                                    value={draft.review_notes}
                                    onChange={(event) => updateDraft(row.id, { review_notes: event.target.value })}
                                    placeholder="Nota interna"
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                                />
                                <button onClick={() => saveReview(row)} disabled={savingThis} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                                    {savingThis ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                                    Guardar
                                </button>
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
