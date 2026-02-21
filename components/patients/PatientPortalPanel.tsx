'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Link2,
    Copy,
    Check,
    Upload,
    Trash2,
    Eye,
    EyeOff,
    Loader2,
    RefreshCw,
    Box,
    Image,
    FileText,
    Smile,
    ExternalLink,
    Plus,
    Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Image compression constants ──────────────────────────────────────────────
const WEBP_QUALITY = 0.80;   // 80 % quality
const MAX_WIDTH_PX = 1920;   // max dimension
const IMAGE_TYPES = new Set(['smile_design', 'photo_before', 'photo_after']);

/** Compress any image File → WebP Blob using the Canvas API */
async function compressToWebP(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            const scale = img.width > MAX_WIDTH_PX ? MAX_WIDTH_PX / img.width : 1;
            const targetW = Math.round(img.width * scale);
            const targetH = Math.round(img.height * scale);

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas 2D not available')); return; }

            ctx.drawImage(img, 0, 0, targetW, targetH);
            canvas.toBlob(
                blob => blob ? resolve(blob) : reject(new Error('Compression failed')),
                'image/webp',
                WEBP_QUALITY,
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Image load failed'));
        };

        img.src = objectUrl;
    });
}


const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FILE_TYPES = [
    { key: 'stl', label: 'Modelo 3D (STL)', icon: Box, accept: '.stl', color: 'text-violet-500 bg-violet-50 dark:bg-violet-900/20' },
    { key: 'smile_design', label: 'Diseño de Sonrisa', icon: Smile, accept: 'image/*,.pdf', color: 'text-pink-500 bg-pink-50 dark:bg-pink-900/20' },
    { key: 'photo_before', label: 'Foto Antes', icon: Image, accept: 'image/*', color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
    { key: 'photo_after', label: 'Foto Después', icon: Image, accept: 'image/*', color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
    { key: 'document', label: 'Documento / Informe', icon: FileText, accept: '*', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
];

interface PatientFile {
    id: string;
    file_type: string;
    label: string;
    file_url: string;
    thumbnail_url: string | null;
    is_visible_to_patient: boolean;
    created_at: string;
    uploaded_by_name: string | null;
}

interface Props {
    patientId: string;
    patientName: string;
}

export default function PatientPortalPanel({ patientId, patientName }: Props) {
    const [portalToken, setPortalToken] = useState<string | null>(null);
    const [tokenLoading, setTokenLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const [files, setFiles] = useState<PatientFile[]>([]);
    const [filesLoading, setFilesLoading] = useState(true);

    const [uploading, setUploading] = useState(false);
    const [uploadType, setUploadType] = useState<string>('stl');
    const [uploadLabel, setUploadLabel] = useState('');
    const [showUploadForm, setShowUploadForm] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Load token ──
    useEffect(() => {
        async function loadToken() {
            const { data } = await supabase
                .from('patient_portal_tokens')
                .select('token, expires_at, is_active')
                .eq('patient_id', patientId)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data && new Date(data.expires_at) > new Date()) {
                setPortalToken(data.token);
            }
            setTokenLoading(false);
        }
        loadToken();
    }, [patientId]);

    // ── Load files ──
    useEffect(() => {
        loadFiles();
    }, [patientId]);

    async function loadFiles() {
        setFilesLoading(true);
        const { data } = await supabase
            .from('patient_files')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false });
        setFiles(data || []);
        setFilesLoading(false);
    }

    // ── Generate portal link ──
    async function generateToken() {
        setGenerating(true);
        try {
            // Deactivate old tokens
            await supabase
                .from('patient_portal_tokens')
                .update({ is_active: false })
                .eq('patient_id', patientId);

            // Create new token
            const { data, error } = await supabase
                .from('patient_portal_tokens')
                .insert({ patient_id: patientId })
                .select('token')
                .single();

            if (error) throw error;
            setPortalToken(data.token);
            toast.success('Enlace del portal generado');
        } catch (err) {
            console.error(err);
            toast.error('Error al generar el enlace');
        } finally {
            setGenerating(false);
        }
    }

    function getPortalUrl(token: string) {
        const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        return `${base}/mi-clinica/${token}`;
    }

    async function copyLink() {
        if (!portalToken) return;
        await navigator.clipboard.writeText(getPortalUrl(portalToken));
        setCopied(true);
        toast.success('Enlace copiado');
        setTimeout(() => setCopied(false), 2000);
    }

    // ── Upload file ──
    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !uploadLabel.trim()) {
            toast.error('Completá el nombre del archivo primero');
            return;
        }

        setUploading(true);
        try {
            const isImage = IMAGE_TYPES.has(uploadType);

            // ── Compress images to WebP before upload ──────────────────────────
            let uploadBlob: Blob | File = file;
            let storagePath: string;

            if (isImage) {
                uploadBlob = await compressToWebP(file);
                storagePath = `portal/${patientId}/${Date.now()}_${uploadType}.webp`;
            } else {
                const ext = file.name.split('.').pop() ?? 'bin';
                storagePath = `portal/${patientId}/${Date.now()}_${uploadType}.${ext}`;
            }

            // ── Upload to Supabase Storage (bucket: patient-portal-files) ──────
            const { data: storageData, error: storageError } = await supabase.storage
                .from('patient-portal-files')
                .upload(storagePath, uploadBlob, {
                    upsert: false,
                    contentType: isImage ? 'image/webp' : undefined,
                });

            if (storageError) throw storageError;

            const { data: urlData } = supabase.storage
                .from('patient-portal-files')
                .getPublicUrl(storageData.path);

            // ── Save file record ───────────────────────────────────────────────
            const { error: dbError } = await supabase
                .from('patient_files')
                .insert({
                    patient_id: patientId,
                    file_type: uploadType,
                    label: uploadLabel.trim(),
                    file_url: urlData.publicUrl,
                    is_visible_to_patient: true,
                });

            if (dbError) throw dbError;

            const sizeKb = Math.round(uploadBlob.size / 1024);
            toast.success(`Archivo subido · ${sizeKb} KB${isImage ? ' (WebP)' : ''}`);
            setUploadLabel('');
            setShowUploadForm(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            await loadFiles();
        } catch (err) {
            console.error('[Portal upload]', err);
            toast.error('Error al subir el archivo');
        } finally {
            setUploading(false);
        }
    }

    async function toggleVisibility(fileId: string, current: boolean) {
        await supabase
            .from('patient_files')
            .update({ is_visible_to_patient: !current })
            .eq('id', fileId);
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, is_visible_to_patient: !current } : f));
        toast.success(current ? 'Archivo oculto al paciente' : 'Archivo visible al paciente');
    }

    async function deleteFile(fileId: string, fileUrl: string) {
        if (!confirm('¿Eliminar este archivo del portal?')) return;

        // Extract storage path from URL
        try {
            const path = fileUrl.split('/patient-portal-files/')[1];
            if (path) {
                await supabase.storage.from('patient-portal-files').remove([path]);
            }
        } catch {
            // Continue even if storage delete fails
        }

        await supabase.from('patient_files').delete().eq('id', fileId);
        setFiles(prev => prev.filter(f => f.id !== fileId));
        toast.success('Archivo eliminado');
    }

    const selectedTypeCfg = FILE_TYPES.find(t => t.key === uploadType)!;

    return (
        <div className="space-y-6">

            {/* ── Portal Link Section ── */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-indigo-500" />
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Portal del Paciente</h3>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                        Generá un enlace privado para que {patientName.split(' ')[0]} vea su tratamiento, pagos y modelos 3D.
                    </p>
                </div>

                <div className="p-5">
                    {tokenLoading ? (
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Loader2 size={14} className="animate-spin" />
                            Verificando...
                        </div>
                    ) : portalToken ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                <Link2 size={14} className="text-gray-400 flex-shrink-0" />
                                <p className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate flex-1">
                                    {getPortalUrl(portalToken)}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={copyLink}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    {copied ? <Check size={15} /> : <Copy size={15} />}
                                    {copied ? 'Copiado' : 'Copiar enlace'}
                                </button>
                                <a
                                    href={getPortalUrl(portalToken)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
                                    title="Vista previa"
                                >
                                    <ExternalLink size={15} />
                                </a>
                                <button
                                    onClick={generateToken}
                                    className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-amber-600 hover:border-amber-300 dark:hover:border-amber-600 transition-colors"
                                    title="Regenerar enlace (el anterior quedará inválido)"
                                >
                                    <RefreshCw size={15} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4 space-y-3">
                            <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mx-auto">
                                <Link2 size={20} className="text-indigo-500" />
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Sin enlace activo todavía</p>
                            <button
                                onClick={generateToken}
                                disabled={generating}
                                className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                            >
                                {generating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                                Generar enlace del portal
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Files Section ── */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Archivos del Portal</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">STL, fotos, diseños y documentos visibles al paciente</p>
                    </div>
                    <button
                        onClick={() => setShowUploadForm(!showUploadForm)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={13} />
                        Subir archivo
                    </button>
                </div>

                {/* Upload form */}
                <AnimatePresence>
                    {showUploadForm && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-b border-gray-200 dark:border-gray-700"
                        >
                            <div className="p-5 bg-blue-50/50 dark:bg-blue-900/10 space-y-4">
                                {/* Type selector */}
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 block">Tipo de archivo</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {FILE_TYPES.map(t => {
                                            const Icon = t.icon;
                                            return (
                                                <button
                                                    key={t.key}
                                                    type="button"
                                                    onClick={() => setUploadType(t.key)}
                                                    className={clsx(
                                                        'flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-medium transition-all',
                                                        uploadType === t.key
                                                            ? `border-blue-400 ${t.color} scale-[1.02]`
                                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                                                    )}
                                                >
                                                    <Icon size={14} />
                                                    <span className="truncate">{t.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Label */}
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block">Nombre descriptivo</label>
                                    <input
                                        type="text"
                                        value={uploadLabel}
                                        onChange={e => setUploadLabel(e.target.value)}
                                        placeholder={`Ej: ${uploadType === 'stl' ? 'Maxilar superior Ene 2025' : uploadType === 'photo_before' ? 'Foto antes inicio tratamiento' : 'Diseño final aprobado'}`}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                    />
                                </div>

                                {/* File input */}
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block">Archivo</label>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer transition-colors"
                                    >
                                        <Upload size={22} className="text-gray-400" />
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {uploading ? 'Subiendo...' : 'Hacé clic o arrastrá el archivo acá'}
                                        </p>
                                        <p className="text-xs text-gray-400">{selectedTypeCfg.accept}</p>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={selectedTypeCfg.accept}
                                        onChange={handleUpload}
                                        className="hidden"
                                        disabled={uploading}
                                    />
                                </div>

                                {uploading && (
                                    <div className="flex items-center gap-2 text-blue-600 text-sm">
                                        <Loader2 size={16} className="animate-spin" />
                                        Subiendo archivo a Supabase Storage...
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Files list */}
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {filesLoading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-sm">Cargando archivos...</span>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <Upload size={20} className="text-gray-400" />
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Sin archivos todavía</p>
                        </div>
                    ) : (
                        files.map(file => {
                            const typeCfg = FILE_TYPES.find(t => t.key === file.file_type);
                            const Icon = typeCfg?.icon || FileText;

                            return (
                                <motion.div
                                    key={file.id}
                                    layout
                                    className="flex items-center gap-3 px-5 py-3.5"
                                >
                                    <div className={clsx('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs', typeCfg?.color || 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
                                        <Icon size={16} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.label}</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">
                                            {typeCfg?.label} · {format(parseISO(file.created_at), 'd MMM yyyy', { locale: es })}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <a
                                            href={file.file_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                            title="Ver archivo"
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                        <button
                                            onClick={() => toggleVisibility(file.id, file.is_visible_to_patient)}
                                            className={clsx(
                                                'p-1.5 rounded-lg transition-colors',
                                                file.is_visible_to_patient
                                                    ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                                            )}
                                            title={file.is_visible_to_patient ? 'Visible al paciente (clic para ocultar)' : 'Oculto al paciente (clic para mostrar)'}
                                        >
                                            {file.is_visible_to_patient ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button
                                            onClick={() => deleteFile(file.id, file.file_url)}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            title="Eliminar"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
