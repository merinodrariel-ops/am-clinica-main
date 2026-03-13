'use client';

import { useState, useRef, forwardRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { X, Upload, Trash2, Loader2, ExternalLink, FolderOpen, Wand2, Check } from 'lucide-react';
import type { PrestacionRealizada } from '@/lib/caja-admin-prestaciones';
import type { Personal } from '@/lib/caja-admin/types';
import DrivePhotoPicker from './DrivePhotoPicker';
import { uploadPhotoToPatientDrive, uploadPortfolioPdf } from '@/app/actions/portfolio';
import { toast } from 'sonner';

interface PortfolioPhoto {
    base64: string;
    mimeType: string;
    fileName: string;
    processed?: boolean;
}

interface PortfolioEntry {
    prestacion: PrestacionRealizada;
    photos: PortfolioPhoto[];
}

interface Props {
    profesional: Personal;
    prestaciones: PrestacionRealizada[];
    mes: string; // YYYY-MM
    onClose: () => void;
}

function formatDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-AR', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

function getMesLabel(mes: string) {
    const [y, m] = mes.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ---- Print Preview (hidden div used for PDF capture) ----
const PortfolioPrintPreview = forwardRef<HTMLDivElement, {
    entries: PortfolioEntry[];
    profesional: Personal;
    mes: string;
}>(function PortfolioPrintPreview({ entries, profesional, mes }, ref) {
    return (
        <div
            ref={ref}
            style={{ display: 'none', background: '#0a0a0a', padding: '40px', color: 'white', width: '794px', fontFamily: 'sans-serif' }}
        >
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
                    {profesional.nombre} {profesional.apellido}
                </h1>
                <p style={{ color: '#888', margin: '4px 0 0', textTransform: 'capitalize' }}>{getMesLabel(mes)}</p>
            </div>
            {entries.map((entry, idx) => (
                <div key={idx} style={{ marginBottom: 40, borderTop: '1px solid #222', paddingTop: 24 }}>
                    <div style={{ marginBottom: 12 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{entry.prestacion.prestacion_nombre}</h2>
                        <p style={{ color: '#888', margin: '4px 0 0', fontSize: 14 }}>
                            {entry.prestacion.paciente_nombre}
                            {entry.prestacion.fecha_realizacion && <> · {formatDate(entry.prestacion.fecha_realizacion)}</>}
                        </p>
                    </div>
                    {entry.photos.length > 0 && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {entry.photos.map((photo, pi) => (
                                // eslint-disable-next-line @next/next-image
                                <img
                                    key={pi}
                                    src={`data:${photo.mimeType};base64,${photo.base64}`}
                                    alt={photo.fileName}
                                    style={{ width: 220, height: 180, objectFit: 'cover', borderRadius: 8 }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
});

// ---- Export Button ----
interface ExportButtonProps {
    entries: PortfolioEntry[];
    profesional: Personal;
    mes: string;
    previewRef: React.RefObject<HTMLDivElement | null>;
}

function ExportButton({ entries, profesional, mes, previewRef }: ExportButtonProps) {
    const [exporting, setExporting] = useState(false);
    const [exportedUrl, setExportedUrl] = useState<string | null>(null);

    async function handleExport() {
        setExporting(true);
        try {
            const [html2canvas, { jsPDF }] = await Promise.all([
                import('html2canvas').then(m => m.default),
                import('jspdf'),
            ]);

            if (!previewRef.current) return;

            previewRef.current.style.display = 'block';
            await new Promise(r => setTimeout(r, 100));

            const canvas = await html2canvas(previewRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#0a0a0a',
            });

            previewRef.current.style.display = 'none';

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            const pageHeight = pdf.internal.pageSize.getHeight();

            let yOffset = 0;
            while (yOffset < pdfHeight) {
                if (yOffset > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, -yOffset, pdfWidth, pdfHeight);
                yOffset += pageHeight;
            }

            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            const profesionalNombre = `${profesional.nombre} ${profesional.apellido}`;
            const result = await uploadPortfolioPdf(profesionalNombre, mes, pdfBase64);

            if (result.error) {
                toast.error(`Error al subir PDF: ${result.error}`);
            } else {
                setExportedUrl(result.webViewLink || null);
                toast.success('Portfolio exportado a Drive');
            }
        } catch (err) {
            console.error(err);
            toast.error('Error al generar PDF');
        } finally {
            setExporting(false);
        }
    }

    if (exportedUrl) {
        return (
            <a
                href={exportedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors"
            >
                <Check className="w-4 h-4" />
                Ver en Drive
                <ExternalLink className="w-3 h-3" />
            </a>
        );
    }

    return (
        <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
        >
            {exporting && <Loader2 className="w-4 h-4 animate-spin" />}
            {exporting ? 'Generando PDF...' : 'Exportar a Drive'}
        </button>
    );
}

// ---- Main PortfolioEditor ----
export default function PortfolioEditor({ profesional, prestaciones, mes, onClose }: Props) {
    const sorted = [...prestaciones].sort((a, b) =>
        (a.fecha_realizacion || '').localeCompare(b.fecha_realizacion || '')
    );

    const [entries, setEntries] = useState<PortfolioEntry[]>(
        sorted.map(p => ({ prestacion: p, photos: [] }))
    );
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [showDrivePicker, setShowDrivePicker] = useState(false);
    const [processingBg, setProcessingBg] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    const currentEntry = entries[selectedIdx];

    function addPhoto(base64: string, mimeType: string, fileName: string) {
        setEntries(prev => prev.map((e, i) =>
            i === selectedIdx
                ? { ...e, photos: [...e.photos, { base64, mimeType, fileName }] }
                : e
        ));
    }

    function removePhoto(photoIdx: number) {
        setEntries(prev => prev.map((e, i) =>
            i === selectedIdx
                ? { ...e, photos: e.photos.filter((_, pi) => pi !== photoIdx) }
                : e
        ));
    }

    function handleFileUpload(files: FileList | null) {
        if (!files || files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            const base64 = dataUrl.split(',')[1];
            addPhoto(base64, file.type, file.name);
            if (currentEntry?.prestacion.paciente_nombre) {
                uploadPhotoToPatientDrive(
                    currentEntry.prestacion.paciente_nombre,
                    file.name,
                    base64,
                    file.type
                ).catch(() => { /* silent: Drive sync is best-effort */ });
            }
        };
        reader.readAsDataURL(file);
    }

    async function removeBackground(photoIdx: number) {
        setProcessingBg(photoIdx);
        try {
            const { removeBackground: removeBg } = await import('@imgly/background-removal');
            const photo = currentEntry.photos[photoIdx];
            const blob = base64ToBlob(photo.base64, photo.mimeType);
            const resultBlob = await removeBg(blob);
            const newBase64 = await blobToBase64(resultBlob);
            setEntries(prev => prev.map((e, i) =>
                i === selectedIdx
                    ? {
                        ...e,
                        photos: e.photos.map((p, pi) =>
                            pi === photoIdx
                                ? { ...p, base64: newBase64, mimeType: 'image/png', processed: true }
                                : p
                        )
                    }
                    : e
            ));
        } catch (err) {
            toast.error('Error al remover fondo');
            console.error(err);
        } finally {
            setProcessingBg(null);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-[#050505] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                <div>
                    <h2 className="text-white font-semibold text-lg">Portfolio Mensual</h2>
                    <p className="text-white/40 text-sm">
                        {profesional.nombre} {profesional.apellido} — {getMesLabel(mes)}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportButton entries={entries} profesional={profesional} mes={mes} previewRef={previewRef} />
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-2">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 shrink-0 border-r border-white/10 overflow-y-auto">
                    {entries.map((entry, idx) => (
                        <button
                            key={entry.prestacion.id}
                            onClick={() => setSelectedIdx(idx)}
                            className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                                idx === selectedIdx ? 'bg-white/10' : 'hover:bg-white/5'
                            }`}
                        >
                            <p className="text-white text-sm font-medium truncate">{entry.prestacion.prestacion_nombre}</p>
                            <p className="text-white/40 text-xs truncate">{entry.prestacion.paciente_nombre}</p>
                            {entry.prestacion.fecha_realizacion && (
                                <p className="text-white/30 text-xs">{formatDate(entry.prestacion.fecha_realizacion)}</p>
                            )}
                            {entry.photos.length > 0 && (
                                <span className="inline-block mt-1 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded">
                                    {entry.photos.length} foto{entry.photos.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Editor area */}
                {currentEntry && (
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="mb-6">
                            <h3 className="text-white text-xl font-semibold">{currentEntry.prestacion.prestacion_nombre}</h3>
                            <p className="text-white/50 text-sm mt-1">
                                {currentEntry.prestacion.paciente_nombre}
                                {currentEntry.prestacion.fecha_realizacion && (
                                    <> · {formatDate(currentEntry.prestacion.fecha_realizacion)}</>
                                )}
                            </p>
                            {currentEntry.prestacion.notas && (
                                <p className="text-white/40 text-sm mt-2 italic">{currentEntry.prestacion.notas}</p>
                            )}
                        </div>

                        {/* Photos grid */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            {currentEntry.photos.map((photo, photoIdx) => (
                                <div
                                    key={photoIdx}
                                    className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group"
                                >
                                    {/* eslint-disable-next-line @next/next-image */}
                                    <img
                                        src={`data:${photo.mimeType};base64,${photo.base64}`}
                                        alt={photo.fileName}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                        <button
                                            onClick={() => removeBackground(photoIdx)}
                                            disabled={processingBg === photoIdx}
                                            title="Remover fondo"
                                            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                                        >
                                            {processingBg === photoIdx
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Wand2 className="w-4 h-4" />
                                            }
                                        </button>
                                        <button
                                            onClick={() => removePhoto(photoIdx)}
                                            title="Eliminar"
                                            className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded-lg transition-colors text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {photo.processed && (
                                        <div className="absolute top-2 right-2">
                                            <span className="px-1.5 py-0.5 bg-purple-500/30 text-purple-300 text-[10px] rounded">sin fondo</span>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Upload slot */}
                            <div
                                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFileUpload(e.dataTransfer.files); }}
                                className="aspect-square rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer group"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="w-6 h-6 text-white/30 group-hover:text-white/60 transition-colors" />
                                <span className="text-white/30 text-xs group-hover:text-white/50 transition-colors text-center">
                                    Subir foto<br />o arrastrar
                                </span>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => handleFileUpload(e.target.files)}
                                />
                            </div>

                            {/* Drive picker slot */}
                            {currentEntry.prestacion.paciente_nombre && (
                                <button
                                    onClick={() => setShowDrivePicker(true)}
                                    className="aspect-square rounded-xl border-2 border-dashed border-blue-500/30 hover:border-blue-500/60 transition-colors flex flex-col items-center justify-center gap-2 group"
                                >
                                    <FolderOpen className="w-6 h-6 text-blue-400/50 group-hover:text-blue-400 transition-colors" />
                                    <span className="text-blue-400/50 text-xs group-hover:text-blue-400 transition-colors text-center">
                                        Desde Drive
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden preview for PDF */}
            <PortfolioPrintPreview ref={previewRef} entries={entries} profesional={profesional} mes={mes} />

            {/* Drive Picker Modal */}
            <AnimatePresence>
                {showDrivePicker && currentEntry?.prestacion.paciente_nombre && (
                    <DrivePhotoPicker
                        pacienteNombre={currentEntry.prestacion.paciente_nombre}
                        onSelect={(base64, mimeType, fileName) => {
                            addPhoto(base64, mimeType, fileName);
                            setShowDrivePicker(false);
                        }}
                        onClose={() => setShowDrivePicker(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
