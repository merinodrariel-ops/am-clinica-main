'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Camera,
    CheckCircle2,
    Loader2,
    PackagePlus,
    Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import CategoriaGuard from '@/components/auth/CategoriaGuard';
import {
    createInventoryProduct,
    listInventoryProducts,
} from '@/app/actions/inventory-products';
import { buildInventoryImagePayload } from '@/lib/inventory-image-pipeline';
import {
    detectInventoryColorFromFile,
    type DetectedInventoryColor,
} from '@/lib/inventory-color-ai';

const UNIT_OPTIONS = ['unidad', 'caja', 'ml', 'gr', 'pack', 'kit'];
const DENTAL_COLOR_OPTIONS = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'C1', 'C2', 'D2', 'D3', 'BL1', 'BL2'];

export default function InventoryQuickProductPage() {
    return (
        <CategoriaGuard allowedCategorias={['owner', 'admin']}>
            <QuickProductScreen />
        </CategoriaGuard>
    );
}

function QuickProductScreen() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [processingImage, setProcessingImage] = useState(false);
    const [categories, setCategories] = useState<string[]>(['Insumos Clinicos']);
    const [colors, setColors] = useState<string[]>(DENTAL_COLOR_OPTIONS);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [keepLoading, setKeepLoading] = useState(true);
    const [removeBackgroundEnabled, setRemoveBackgroundEnabled] = useState(true);
    const [detectingColor, setDetectingColor] = useState(false);
    const [detectedColor, setDetectedColor] = useState<DetectedInventoryColor | null>(null);

    const [form, setForm] = useState({
        name: '',
        category: 'Insumos Clinicos',
        color: '',
        unit: 'unidad',
        brand: '',
        barcode: '',
        stockInitial: '0',
        notes: '',
    });

    const canSubmit = useMemo(() => {
        return Boolean(form.name.trim() && form.category.trim() && form.unit.trim());
    }, [form.name, form.category, form.unit]);

    const loadCatalogHints = useCallback(async () => {
        const result = await listInventoryProducts({ activeOnly: true });
        if (!result.success) return;

        const nextCategories = Array.from(new Set(result.products.map(item => item.category).filter(Boolean))).sort();
        const nextColors = Array.from(new Set(result.products.map(item => item.color).filter(Boolean) as string[])).sort();

        if (nextCategories.length > 0) {
            setCategories(nextCategories);
        }
        setColors(nextColors.length > 0 ? Array.from(new Set([...DENTAL_COLOR_OPTIONS, ...nextColors])) : DENTAL_COLOR_OPTIONS);
    }, []);

    useEffect(() => {
        void loadCatalogHints();
    }, [loadCatalogHints]);

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    async function onPhotoSelected(file?: File | null) {
        if (!file) return;

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        setPhotoFile(file);
        setPreviewUrl(URL.createObjectURL(file));

        setDetectingColor(true);
        try {
            const suggestion = await detectInventoryColorFromFile(file);
            setDetectedColor(suggestion);

            if (suggestion) {
                setForm(prev => {
                    if (prev.color.trim()) return prev;
                    return { ...prev, color: suggestion.label };
                });
                toast.success(`Color dental sugerido por IA: ${suggestion.label}`);
            }
        } catch {
            setDetectedColor(null);
        } finally {
            setDetectingColor(false);
        }
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!canSubmit) return;

        setSaving(true);
        try {
            let imagePayload = null;

            if (photoFile) {
                setProcessingImage(true);
                imagePayload = await buildInventoryImagePayload(photoFile, {
                    removeBackground: removeBackgroundEnabled,
                    thumbSize: 320,
                    fullMaxWidth: 1080,
                    thumbMaxKB: 45,
                    fullMaxKB: 220,
                });
                setProcessingImage(false);

                if (removeBackgroundEnabled && !imagePayload.backgroundRemoved) {
                    toast.info('La foto se guardo optimizada, sin recorte de fondo IA.');
                }
            }

            const serverImagePayload = imagePayload
                ? {
                    thumbBase64: imagePayload.thumbBase64,
                    fullBase64: imagePayload.fullBase64,
                    thumbMimeType: imagePayload.thumbMimeType,
                    fullMimeType: imagePayload.fullMimeType,
                }
                : null;

            const result = await createInventoryProduct({
                name: form.name,
                category: form.category,
                color: form.color,
                unit: form.unit,
                brand: form.brand,
                barcode: form.barcode,
                stockInitial: Number(form.stockInitial || 0),
                notes: form.notes,
                imagePayload: serverImagePayload,
            });

            if (!result.success || !result.productId) {
                throw new Error(result.error || 'No se pudo crear el producto');
            }

            toast.success('Producto cargado en inventario');

            if (keepLoading) {
                setForm(prev => ({
                    ...prev,
                    name: '',
                    color: '',
                    brand: '',
                    barcode: '',
                    stockInitial: '0',
                    notes: '',
                }));
                setPhotoFile(null);
                setDetectedColor(null);
                if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                }
                setPreviewUrl(null);
                return;
            }

            router.push(`/inventario/productos/${result.productId}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo cargar el producto');
        } finally {
            setSaving(false);
            setProcessingImage(false);
        }
    }

    return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Link href="/inventario/productos" className="text-sm inline-flex items-center gap-1.5 text-blue-600">
                    <ArrowLeft size={15} /> Volver a productos
                </Link>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                    Flujo 30s
                </span>
            </div>

            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-4">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <PackagePlus className="text-blue-600" size={20} />
                    Alta rapida de producto
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Nombre + categoria + color dental + foto. El sistema optimiza para web y puede quitar fondo automaticamente.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
                <div className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium mb-1">Nombre *</label>
                        <input
                            value={form.name}
                            onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                            placeholder="Ej: Composite Flow A2"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Categoria *</label>
                            <input
                                value={form.category}
                                onChange={event => setForm(prev => ({ ...prev, category: event.target.value }))}
                                list="quick-category-options"
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                required
                            />
                            <datalist id="quick-category-options">
                                {categories.map(category => (
                                    <option key={category} value={category} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Color dental</label>
                            <input
                                value={form.color}
                                onChange={event => setForm(prev => ({ ...prev, color: event.target.value }))}
                                list="quick-color-options"
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                placeholder="Ej: A2"
                            />
                            <datalist id="quick-color-options">
                                {colors.map(color => (
                                    <option key={color} value={color} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Unidad *</label>
                            <select
                                value={form.unit}
                                onChange={event => setForm(prev => ({ ...prev, unit: event.target.value }))}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                                {UNIT_OPTIONS.map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Stock inicial</label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={form.stockInitial}
                                onChange={event => setForm(prev => ({ ...prev, stockInitial: event.target.value }))}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Barcode</label>
                            <input
                                value={form.barcode}
                                onChange={event => setForm(prev => ({ ...prev, barcode: event.target.value }))}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                placeholder="Opcional"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Marca</label>
                            <input
                                value={form.brand}
                                onChange={event => setForm(prev => ({ ...prev, brand: event.target.value }))}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                placeholder="Opcional"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Foto del producto</label>
                            <label className="w-full px-3 py-2.5 rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm inline-flex items-center justify-center gap-2 cursor-pointer">
                                <Camera size={16} />
                                {photoFile ? 'Cambiar foto' : 'Tomar / subir foto'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={event => {
                                        void onPhotoSelected(event.target.files?.[0]);
                                    }}
                                />
                            </label>

                            {detectingColor && (
                                <p className="mt-1 text-[11px] text-gray-500 inline-flex items-center gap-1.5">
                                    <Loader2 size={11} className="animate-spin" />
                                    Detectando color IA...
                                </p>
                            )}

                            {!detectingColor && detectedColor && (
                                <div className="mt-1 flex items-center gap-2 text-[11px]">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-semibold">
                                        IA: {detectedColor.label} ({Math.round(detectedColor.confidence * 100)}%)
                                    </span>
                                    <span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: detectedColor.hex }} />
                                    <button
                                        type="button"
                                        onClick={() => setForm(prev => ({ ...prev, color: detectedColor.label }))}
                                        className="text-blue-600 hover:underline"
                                    >
                                        Usar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {previewUrl && (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/60">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewUrl} alt="Preview" className="h-40 w-full object-contain rounded-lg" />
                        </div>
                    )}

                    <textarea
                        value={form.notes}
                        onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-[68px]"
                        placeholder="Nota opcional"
                    />

                    <div className="space-y-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={removeBackgroundEnabled}
                                onChange={event => setRemoveBackgroundEnabled(event.target.checked)}
                            />
                            <Sparkles size={14} className="text-violet-500" />
                            Quitar fondo con IA
                        </label>

                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={keepLoading}
                                onChange={event => setKeepLoading(event.target.checked)}
                            />
                            Seguir cargando varios productos (modo lote)
                        </label>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={!canSubmit || saving || processingImage}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                    {saving || processingImage ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                    {saving || processingImage ? 'Guardando...' : 'Guardar producto rapido'}
                </button>
            </form>
        </div>
    );
}
