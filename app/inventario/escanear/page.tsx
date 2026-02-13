'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Camera,
    History,
    Loader2,
    Package,
    Search,
    ScanLine,
    StopCircle,
    Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import RoleGuard from '@/components/auth/RoleGuard';
import type { ProductRecord } from '@/app/actions/inventory-products';
import {
    lookupInventoryProductByCode,
    listInventoryVisualMatchCandidates,
    registerInventoryIngress,
    searchInventoryProductsQuick,
} from '@/app/actions/inventory-stock';
import {
    rankInventoryVisualMatches,
    type VisualMatchResult,
} from '@/lib/inventory-visual-match';

type BarcodeResult = { rawValue?: string | null };

type BarcodeDetectorLike = {
    detect: (source: ImageBitmapSource) => Promise<BarcodeResult[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type SelectionMeta =
    | { mode: 'barcode' }
    | { mode: 'manual' }
    | { mode: 'visual'; score: number; confidence: 'ALTO' | 'MEDIO' | 'BAJO' }
    | { mode: 'unknown' };

const SUPPORTED_FORMATS = [
    'qr_code',
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'code_128',
    'code_39',
    'itf',
];

const VISUAL_MATCH_BETA_ENABLED =
    process.env.NEXT_PUBLIC_INVENTORY_VISUAL_MATCH_BETA === '1' ||
    process.env.NEXT_PUBLIC_INVENTORY_VISUAL_MATCH_BETA === 'true';

export default function InventoryScannerPage() {
    return (
        <RoleGuard allowedRoles={['owner', 'admin', 'reception', 'laboratorio', 'developer']}>
            <ScannerScreen />
        </RoleGuard>
    );
}

function ScannerScreen() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<BarcodeDetectorLike | null>(null);
    const timerRef = useRef<number | null>(null);

    const [scannerSupported, setScannerSupported] = useState(false);
    const [cameraRunning, setCameraRunning] = useState(false);
    const [cameraBusy, setCameraBusy] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [detectedCode, setDetectedCode] = useState('');

    const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<ProductRecord[]>([]);
    const [visualMatching, setVisualMatching] = useState(false);
    const [visualMatches, setVisualMatches] = useState<VisualMatchResult[]>([]);
    const [selectionMeta, setSelectionMeta] = useState<SelectionMeta>({ mode: 'unknown' });

    const [qty, setQty] = useState('1');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const detectorCtor = getBarcodeDetectorCtor();
        setScannerSupported(Boolean(detectorCtor));

        if (detectorCtor) {
            detectorRef.current = new detectorCtor({ formats: SUPPORTED_FORMATS });
        }

        return () => {
            stopCamera();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const lowStockAlert = useMemo(() => {
        if (!selectedProduct) return false;
        if (selectedProduct.threshold_min === null) return false;
        return Number(selectedProduct.stock_current) <= Number(selectedProduct.threshold_min);
    }, [selectedProduct]);

    function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
        if (typeof window === 'undefined') return null;

        const maybeWindow = window as Window & {
            BarcodeDetector?: BarcodeDetectorCtor;
        };

        return maybeWindow.BarcodeDetector || null;
    }

    function clearTimer() {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }

    function stopCamera() {
        clearTimer();
        setCameraRunning(false);

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }

    const runScanTick = useCallback(async () => {
        if (!cameraRunning || !videoRef.current || !detectorRef.current) return;

        try {
            const video = videoRef.current;
            if (video.readyState >= 2) {
                const result = await detectorRef.current.detect(video);
                const code = (result[0]?.rawValue || '').trim();

                if (code) {
                    setDetectedCode(code);
                    await resolveCode(code);
                    timerRef.current = window.setTimeout(() => {
                        void runScanTick();
                    }, 1200);
                    return;
                }
            }
        } catch (error) {
            console.warn('Scanner tick error:', error);
        }

        timerRef.current = window.setTimeout(() => {
            void runScanTick();
        }, 420);
    }, [cameraRunning]);

    async function startCamera() {
        if (!scannerSupported || cameraBusy) return;

        setCameraBusy(true);
        setScanError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            setCameraRunning(true);
            timerRef.current = window.setTimeout(() => {
                void runScanTick();
            }, 350);
        } catch (error) {
            setScanError(error instanceof Error ? error.message : 'No se pudo abrir la camara');
        } finally {
            setCameraBusy(false);
        }
    }

    async function resolveCode(code: string) {
        const normalized = code.trim();
        if (!normalized) return;

        const result = await lookupInventoryProductByCode(normalized);
        if (!result.success) {
            setScanError(result.error || 'No se pudo validar el codigo');
            return;
        }

        if (result.product) {
            setSelectedProduct(result.product);
            setSearchResults([]);
            setVisualMatches([]);
            setSelectionMeta({ mode: 'barcode' });
            setSearchTerm('');
            toast.success(`Producto detectado: ${result.product.name}`);
        } else {
            setSelectedProduct(null);
            setVisualMatches([]);
            setSelectionMeta({ mode: 'unknown' });
            setSearchTerm(normalized);
            const fallback = await searchInventoryProductsQuick(normalized);
            if (fallback.success) {
                setSearchResults(fallback.products);
            }
            toast.info('Codigo sin match exacto. Usa busqueda manual.');
        }
    }

    async function runVisualMatch(file: File) {
        if (!VISUAL_MATCH_BETA_ENABLED) return;

        setVisualMatching(true);
        setVisualMatches([]);

        const candidatesRes = await listInventoryVisualMatchCandidates(80);
        if (!candidatesRes.success) {
            setVisualMatching(false);
            toast.error(candidatesRes.error || 'No se pudieron cargar candidatos para busqueda visual');
            return;
        }

        if (candidatesRes.products.length === 0) {
            setVisualMatching(false);
            toast.info('No hay productos con imagen para comparar');
            return;
        }

        let ranked: VisualMatchResult[] = [];
        try {
            ranked = await rankInventoryVisualMatches({
                file,
                candidates: candidatesRes.products,
                maxCandidates: 80,
                topK: 3,
            });
        } catch (error) {
            setVisualMatching(false);
            toast.error(error instanceof Error ? error.message : 'No se pudo ejecutar busqueda visual');
            return;
        }

        setVisualMatching(false);

        if (ranked.length === 0) {
            toast.info('No hubo coincidencias visuales utiles. Usa busqueda manual.');
            return;
        }

        setSelectedProduct(null);
        setSearchResults([]);
        setVisualMatches(ranked);
        setSelectionMeta({ mode: 'unknown' });
        toast.info('Sugerencias visuales listas. Confirma producto manualmente.');
    }

    async function handleManualSearch(term?: string) {
        const query = (term ?? searchTerm).trim();
        if (!query) return;

        setSearching(true);
        const result = await searchInventoryProductsQuick(query);
        setSearching(false);

        if (!result.success) {
            toast.error(result.error || 'Error buscando productos');
            return;
        }

        setSearchResults(result.products);
        if (result.products.length === 0) {
            toast.info('No hay coincidencias para esa busqueda');
        }
    }

    async function handleImageScan(file?: File | null) {
        if (!file) return;

        try {
            if (detectorRef.current) {
                const imageBitmap = await createImageBitmap(file);
                const result = await detectorRef.current.detect(imageBitmap);
                imageBitmap.close();
                const code = (result[0]?.rawValue || '').trim();

                if (code) {
                    setDetectedCode(code);
                    setVisualMatches([]);
                    await resolveCode(code);
                    return;
                }
            }

            if (VISUAL_MATCH_BETA_ENABLED) {
                await runVisualMatch(file);
                return;
            }

            if (!detectorRef.current) {
                toast.error('Tu navegador no soporta deteccion desde imagen');
                return;
            }

            toast.info('No se detecto barcode/QR en la imagen');
        } catch (error) {
            if (VISUAL_MATCH_BETA_ENABLED) {
                await runVisualMatch(file);
                return;
            }

            toast.error(error instanceof Error ? error.message : 'No se pudo escanear imagen');
        }
    }

    async function selectVisualMatch(match: VisualMatchResult) {
        setSelectedProduct(match.product);
        setSearchResults([]);
        setVisualMatches([]);
        setSelectionMeta({
            mode: 'visual',
            score: match.score,
            confidence: match.confidence,
        });
        toast.success(`Seleccionado por foto: ${match.product.name}`);
    }

    async function handleRegisterIngress() {
        if (!selectedProduct) return;

        const parsedQty = Number(qty || 0);
        if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
            toast.error('Ingresa una cantidad valida mayor a 0');
            return;
        }

        setSaving(true);
        const result = await registerInventoryIngress({
            productId: selectedProduct.id,
            qty: parsedQty,
            note,
            deviceInfo: {
                source: 'inventario-escanear',
                match_mode: selectionMeta.mode,
                visual_score: selectionMeta.mode === 'visual' ? Number(selectionMeta.score.toFixed(4)) : undefined,
                visual_confidence: selectionMeta.mode === 'visual' ? selectionMeta.confidence : undefined,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                platform: typeof navigator !== 'undefined' ? navigator.platform : '',
                screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
            },
        });
        setSaving(false);

        if (!result.success) {
            toast.error(result.error || 'No se pudo registrar el ingreso');
            return;
        }

        const nextStock = result.stock_current ?? selectedProduct.stock_current;
        setSelectedProduct({
            ...selectedProduct,
            stock_current: Number(nextStock),
        });

        setQty('1');
        setNote('');
        toast.success('Ingreso registrado correctamente');
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wide text-cyan-600 font-semibold">PR2 - Escaneo rapido</p>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ScanLine className="text-cyan-600" />
                        Escanear para ingreso de stock
                    </h1>
                    <p className="text-sm text-gray-500">
                        Barcode/QR primero. Si no hay match, usa busqueda manual
                        {VISUAL_MATCH_BETA_ENABLED ? ' o sugerencias por foto (Beta).' : '.'}
                    </p>
                </div>

                <div className="flex gap-2">
                    <Link href="/inventario/productos" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm inline-flex items-center gap-1.5">
                        <ArrowLeft size={15} /> Productos
                    </Link>
                    <Link href="/inventario/movimientos" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm inline-flex items-center gap-1.5">
                        <History size={15} /> Movimientos
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Camara de escaneo</p>
                        <div className="flex items-center gap-2">
                            {!cameraRunning ? (
                                <button
                                    onClick={startCamera}
                                    disabled={!scannerSupported || cameraBusy}
                                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {cameraBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                                    Iniciar
                                </button>
                            ) : (
                                <button
                                    onClick={stopCamera}
                                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
                                >
                                    <StopCircle size={14} />
                                    Detener
                                </button>
                            )}

                            <label className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                <Upload size={14} />
                                {VISUAL_MATCH_BETA_ENABLED ? 'Imagen (Beta)' : 'Imagen'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                        void handleImageScan(event.target.files?.[0]);
                                        event.currentTarget.value = '';
                                    }}
                                />
                            </label>
                        </div>
                    </div>

                    {!scannerSupported && (
                        <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                            Este navegador no soporta BarcodeDetector nativo. Usa busqueda manual (MVP requiere conexion).
                        </p>
                    )}

                    {VISUAL_MATCH_BETA_ENABLED && (
                        <p className="text-xs text-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2">
                            Beta visual activa: si la foto no tiene barcode/QR, se sugieren hasta 3 candidatos por similitud.
                        </p>
                    )}

                    {scanError && (
                        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                            {scanError}
                        </p>
                    )}

                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black aspect-video relative">
                        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                        {!cameraRunning && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
                                Camara detenida
                            </div>
                        )}
                    </div>

                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                        Ultimo codigo detectado: <span className="font-semibold">{detectedCode || 'N/D'}</span>
                    </div>

                    <div className="flex gap-2">
                        <input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Buscar manual por codigo/nombre"
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                        />
                        <button
                            onClick={() => {
                                void handleManualSearch();
                            }}
                            disabled={searching}
                            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm inline-flex items-center gap-1.5"
                        >
                            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar
                        </button>
                    </div>

                    {searchResults.length > 0 && (
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                            {searchResults.map(product => (
                                <button
                                    key={product.id}
                                    onClick={() => {
                                        setSelectedProduct(product);
                                        setSearchResults([]);
                                        setVisualMatches([]);
                                        setSelectionMeta({ mode: 'manual' });
                                    }}
                                    className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{product.name}</p>
                                    <p className="text-xs text-gray-500">{product.category} - Stock {product.stock_current} {product.unit}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    {(visualMatching || visualMatches.length > 0) && (
                        <div className="space-y-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 p-3">
                            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Buscar por foto (Beta)</p>

                            {visualMatching ? (
                                <div className="text-xs text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-2">
                                    <Loader2 size={13} className="animate-spin" />
                                    Comparando contra catalogo con imagen...
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {visualMatches.map(match => (
                                        <button
                                            key={match.product.id}
                                            onClick={() => {
                                                void selectVisualMatch(match);
                                            }}
                                            className="w-full text-left rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-900 px-3 py-2 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30"
                                        >
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{match.product.name}</p>
                                            <p className="text-xs text-gray-500">
                                                {match.product.category} - Stock {match.product.stock_current} {match.product.unit}
                                            </p>
                                            <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-1">
                                                Score {Math.round(match.score * 100)}% - {match.confidence}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </section>

                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                    {!selectedProduct ? (
                        <div className="h-full min-h-56 flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                            <Package size={28} />
                            <p className="text-sm">Escanea un codigo o busca manual para seleccionar producto.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                    {selectedProduct?.image_thumb_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={selectedProduct.image_thumb_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <Package size={20} className="text-gray-400" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs uppercase tracking-wide text-cyan-600 font-semibold">Producto detectado</p>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{selectedProduct.name}</h2>
                                    <p className="text-xs text-gray-500">{selectedProduct.category} - {selectedProduct.brand || 'Sin marca'}</p>
                                    <p className="text-xs text-gray-500 mt-1">Stock actual: <span className="font-semibold">{selectedProduct.stock_current} {selectedProduct.unit}</span></p>
                                    {lowStockAlert && (
                                        <p className="text-xs text-red-600 mt-1">Stock bajo para este producto</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium mb-1">Cantidad a ingresar *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={qty}
                                        onChange={(event) => setQty(event.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Unidad</label>
                                    <div className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm">
                                        {selectedProduct.unit}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1">Nota</label>
                                <textarea
                                    value={note}
                                    onChange={(event) => setNote(event.target.value)}
                                    placeholder="Ej: reposicion semanal, ingreso proveedor X"
                                    className="w-full min-h-[90px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        void handleRegisterIngress();
                                    }}
                                    disabled={saving}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60"
                                >
                                    {saving ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />}
                                    Registrar ingreso
                                </button>

                                <button
                                    onClick={() => {
                                        setSelectedProduct(null);
                                        setQty('1');
                                        setNote('');
                                        setSelectionMeta({ mode: 'unknown' });
                                    }}
                                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm"
                                >
                                    Limpiar
                                </button>
                            </div>

                            <p className="text-[11px] text-gray-500 border-t border-gray-200 dark:border-gray-700 pt-3">
                                MVP online: si no hay conexion, no registra movimiento. En PR3 se puede evaluar cola offline.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
