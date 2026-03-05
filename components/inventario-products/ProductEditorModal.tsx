'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Sparkles, X } from 'lucide-react';
import MoneyInput from '@/components/ui/MoneyInput';
import { toast } from 'sonner';
import {
    createInventoryProduct,
    type ProductRecord,
    updateInventoryProduct,
} from '@/app/actions/inventory-products';
import {
    buildInventoryImagePayload,
    type InventoryImagePayload,
} from '@/lib/inventory-image-pipeline';
import {
    detectInventoryColorFromFile,
    type DetectedInventoryColor,
} from '@/lib/inventory-color-ai';

interface ProductEditorModalProps {
    isOpen: boolean;
    mode: 'create' | 'edit';
    product?: ProductRecord | null;
    onClose: () => void;
    onSaved: () => void;
}

const UNIT_OPTIONS = ['unidad', 'caja', 'ml', 'gr', 'pack', 'kit'];
const COLOR_SUGGESTIONS = [
    'A1',
    'A2',
    'A3',
    'A3.5',
    'A4',
    'B1',
    'B2',
    'B3',
    'C1',
    'C2',
    'D2',
    'D3',
    'BL1',
    'BL2',
];

export default function ProductEditorModal({
    isOpen,
    mode,
    product,
    onClose,
    onSaved,
}: ProductEditorModalProps) {
    const [saving, setSaving] = useState(false);
    const [processingImage, setProcessingImage] = useState(false);
    const [imagePayload, setImagePayload] = useState<InventoryImagePayload | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [removeBackgroundEnabled, setRemoveBackgroundEnabled] = useState(true);
    const [detectingColor, setDetectingColor] = useState(false);
    const [detectedColor, setDetectedColor] = useState<DetectedInventoryColor | null>(null);

    const [form, setForm] = useState(() => ({
        name: product?.name || '',
        brand: product?.brand || '',
        category: product?.category || 'Insumos Clinicos',
        color: product?.color || '',
        unit: product?.unit || 'unidad',
        barcode: product?.link || '',
        qrCode: '',
        thresholdMin: product?.threshold_min ?? 0,
        stockInitial: mode === 'create' ? 0 : (product?.stock_current ?? 0),
        notes: product?.notes || '',
    }));

    const title = mode === 'create' ? 'Nuevo producto' : 'Editar producto';
    const submitLabel = mode === 'create' ? 'Crear producto' : 'Guardar cambios';

    useEffect(() => {
        setForm({
            name: product?.name || '',
            brand: product?.brand || '',
            category: product?.category || 'Insumos Clinicos',
            color: product?.color || '',
            unit: product?.unit || 'unidad',
            barcode: product?.link || '',
            qrCode: '',
            thresholdMin: product?.threshold_min ?? 0,
            stockInitial: mode === 'create' ? 0 : (product?.stock_current ?? 0),
            notes: product?.notes || '',
        });
        setImagePayload(null);
        setPreviewUrl(null);
        setRemoveBackgroundEnabled(true);
        setDetectingColor(false);
        setDetectedColor(null);
    }, [product, mode, isOpen]);

    const thumbStats = useMemo(() => {
        if (!imagePayload) return null;
        return `${imagePayload.thumbWidth}x${imagePayload.thumbHeight} - ${imagePayload.thumbSizeKB}KB`;
    }, [imagePayload]);

    if (!isOpen) return null;

    async function handleImageChange(file?: File | null) {
        if (!file) return;

        setProcessingImage(true);
        setDetectingColor(true);
        try {
            const colorSuggestion = await detectInventoryColorFromFile(file);
            setDetectedColor(colorSuggestion);

            if (colorSuggestion) {
                setForm(prev => {
                    if (prev.color.trim()) return prev;
                    return { ...prev, color: colorSuggestion.label };
                });
            }

            const payload = await buildInventoryImagePayload(file, {
                removeBackground: removeBackgroundEnabled,
                thumbSize: 320,
                fullMaxWidth: 1080,
                thumbMaxKB: 45,
                fullMaxKB: 220,
            });
            setImagePayload(payload);
            setPreviewUrl(URL.createObjectURL(file));

            if (removeBackgroundEnabled && !payload.backgroundRemoved) {
                toast.info('No se pudo quitar fondo automaticamente. Se guarda la foto optimizada original.');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo procesar imagen');
        } finally {
            setProcessingImage(false);
            setDetectingColor(false);
        }
    }

    async function submitForm() {
        const serverImagePayload = imagePayload
            ? {
                thumbBase64: imagePayload.thumbBase64,
                fullBase64: imagePayload.fullBase64,
                thumbMimeType: imagePayload.thumbMimeType,
                fullMimeType: imagePayload.fullMimeType,
            }
            : null;

        const payloadBase = {
            name: form.name,
            brand: form.brand,
            category: form.category,
            color: form.color,
            unit: form.unit,
            link: form.barcode,
            notes: form.notes,
            thresholdMin: form.thresholdMin ? Number(form.thresholdMin) : 0,
            imagePayload: serverImagePayload,
        };

        setSaving(true);
        try {
            if (mode === 'create') {
                const result = await createInventoryProduct({
                    ...payloadBase,
                    stockInitial: Number(form.stockInitial || 0),
                });

                if (!result.success) {
                    throw new Error(result.error || 'No se pudo crear el producto');
                }
            } else if (product) {
                const result = await updateInventoryProduct({
                    id: product.id,
                    ...payloadBase,
                });

                if (!result.success) {
                    throw new Error(result.error || 'No se pudo actualizar el producto');
                }
            }

            toast.success(mode === 'create' ? 'Producto creado' : 'Producto actualizado');
            onSaved();
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo guardar el producto');
        } finally {
            setSaving(false);
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        void submitForm();
    }

    return (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                        <p className="text-xs text-gray-500">Imagen optimizada + datos operativos de inventario</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Nombre *</label>
                            <input
                                value={form.name}
                                onChange={(event) => setForm(prev => ({ ...prev, name: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Marca</label>
                            <input
                                value={form.brand}
                                onChange={(event) => setForm(prev => ({ ...prev, brand: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Categoria *</label>
                            <input
                                value={form.category}
                                onChange={(event) => setForm(prev => ({ ...prev, category: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Color dental</label>
                            <input
                                value={form.color}
                                onChange={(event) => setForm(prev => ({ ...prev, color: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                placeholder="Ej: A2"
                                list="inventory-color-options"
                            />
                            <datalist id="inventory-color-options">
                                {COLOR_SUGGESTIONS.map(color => (
                                    <option key={color} value={color} />
                                ))}
                            </datalist>

                            {detectingColor && (
                                <p className="mt-1 text-[11px] text-gray-500 inline-flex items-center gap-1.5">
                                    <Loader2 size={11} className="animate-spin" />
                                    Detectando color sugerido...
                                </p>
                            )}

                            {!detectingColor && detectedColor && (
                                <div className="mt-2 flex items-center gap-2 text-[11px]">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-semibold">
                                        IA: {detectedColor.label} ({Math.round(detectedColor.confidence * 100)}%)
                                    </span>
                                    <span
                                        className="w-3 h-3 rounded-full border border-gray-300"
                                        style={{ backgroundColor: detectedColor.hex }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setForm(prev => ({ ...prev, color: detectedColor.label }))}
                                        className="text-blue-600 hover:underline"
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Unidad *</label>
                            <select
                                value={form.unit}
                                onChange={(event) => setForm(prev => ({ ...prev, unit: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                required
                            >
                                {UNIT_OPTIONS.map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Stock minimo</label>
                            <MoneyInput
                                value={form.thresholdMin}
                                onChange={(val) => setForm(prev => ({ ...prev, thresholdMin: val }))}
                                hideSymbol
                                className="w-full text-sm"
                            />
                        </div>

                        {mode === 'create' && (
                            <div>
                                <label className="block text-sm font-medium mb-1">Stock inicial</label>
                                <MoneyInput
                                    value={form.stockInitial}
                                    onChange={(val) => setForm(prev => ({ ...prev, stockInitial: val }))}
                                    hideSymbol
                                    className="w-full text-sm"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium mb-1">Barcode</label>
                            <input
                                value={form.barcode}
                                onChange={(event) => setForm(prev => ({ ...prev, barcode: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                placeholder="EAN/UPC/Code128"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">QR interno (opcional)</label>
                            <input
                                value={form.qrCode}
                                onChange={(event) => setForm(prev => ({ ...prev, qrCode: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                placeholder="Si se omite, se genera automaticamente"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Notas</label>
                            <textarea
                                value={form.notes}
                                onChange={(event) => setForm(prev => ({ ...prev, notes: event.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-[70px]"
                            />
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Packshot del producto</p>
                            {thumbStats && <p className="text-xs text-emerald-600">Thumb {thumbStats}</p>}
                        </div>

                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(event) => handleImageChange(event.target.files?.[0])}
                            className="w-full text-sm"
                        />

                        <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={removeBackgroundEnabled}
                                onChange={(event) => setRemoveBackgroundEnabled(event.target.checked)}
                            />
                            <Sparkles size={13} className="text-violet-500" />
                            Quitar fondo con IA (beta)
                        </label>

                        {processingImage && (
                            <p className="text-xs text-gray-500 flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                                Procesando miniatura optimizada...
                            </p>
                        )}

                        {(previewUrl || product?.image_thumb_url) && (
                            <div className="w-32 h-32 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={previewUrl || product?.image_thumb_url || ''}
                                    alt="Preview producto"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </div>

                </form>

                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void submitForm();
                        }}
                        disabled={saving || processingImage}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60 inline-flex items-center gap-2"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
