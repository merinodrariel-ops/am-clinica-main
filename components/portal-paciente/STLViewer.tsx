'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Download, Video, StopCircle, Share2, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
type RecordFmt  = 'story' | 'post' | 'presentation';
type ViewerMode = 'idle' | 'selecting' | 'recording';
interface SelRect  { x: number; y: number; w: number; h: number }
interface VideoPreview {
    url: string;
    blob: Blob;
    mimeType: string;
    fmt: RecordFmt;
}

// Output dimensions per format — true 4K for post & presentation
const FMTS: Record<RecordFmt, { label: string; ratio: string; w: number; h: number; ar: number; bps: number }> = {
    story:        { label: 'Story',        ratio: '9:16',  w: 1080, h: 1920, ar:  9 / 16, bps: 15_000_000 },
    post:         { label: 'Post',         ratio: '1:1',   w: 2160, h: 2160, ar:  1,       bps: 40_000_000 },
    presentation: { label: 'Presentación', ratio: '16:9',  w: 3840, h: 2160, ar: 16 / 9,  bps: 80_000_000 },
};

function getOutDims(fmt: RecordFmt): { w: number; h: number; ar: number; label: string; ratio: string } {
    return FMTS[fmt];
}

const REC_SECS   = 8;
const CTRL_H     = 52; // top control bar height in selecting mode

function computeSel(cw: number, ch: number, ar: number): SelRect {
    const maxW = cw - 48;
    const maxH = ch - CTRL_H - 48;
    let w: number, h: number;
    if (maxW / maxH <= ar) { w = maxW; h = w / ar; }
    else                   { h = maxH; w = h * ar; }
    return { x: (cw - w) / 2, y: CTRL_H + (ch - CTRL_H - h) / 2, w, h };
}

function dlBlob(blobUrl: string, name: string) {
    const a = Object.assign(document.createElement('a'), { href: blobUrl, download: name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function STLViewer({ url, format = 'stl', onClose }: { url: string; format?: 'stl' | 'ply'; onClose?: () => void }) {
    const mountRef  = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sceneRef  = useRef<{
        renderer: any; camera: any; controls: any; animId: number;
        scene?: any;
        loadSecondModel?: (buf: ArrayBuffer, isPly: boolean) => Promise<void>;
        removeSecondModel?: () => void;
        setWireframeMode?: (on: boolean) => void;
        setPostRenderHook?: (fn: (() => void) | null) => void;
    } | null>(null);
    const dragRef            = useRef<{ sx: number; sy: number; orig: SelRect; resize: boolean } | null>(null);
    const mrRef              = useRef<MediaRecorder | null>(null);
    const chunksRef          = useRef<Blob[]>([]);
    const tickRef            = useRef<ReturnType<typeof setInterval> | null>(null);
    const firstModelInfoRef  = useRef<{ cx: number; cy: number; cz: number; scale: number } | null>(null);

    const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error' | 'no-three'>('loading');
    const [loadPct,    setLoadPct]    = useState(0);
    const [mode,       setMode]       = useState<ViewerMode>('idle');
    const [fmt,        setFmt]        = useState<RecordFmt>('story');
    const [sel,        setSel]        = useState<SelRect>({ x: 0, y: 0, w: 0, h: 0 });
    const [countdown,  setCdown]      = useState(0);
    const [vidPreview, setVidPreview] = useState<VideoPreview | null>(null);
    const [shareHint,  setShareHint]  = useState(false); // true when browser doesn't support file share
    const [wireframe,    setWireframe]   = useState(false);
    const [isDragOver,   setIsDragOver]  = useState(false);
    const [secondModel,  setSecondModel] = useState<'none' | 'loading' | 'loaded'>('none');

    // ── Enter selection mode ───────────────────────────────────────────────────
    const enterSelecting = useCallback(() => {
        const c = mountRef.current;
        if (!c) return;
        const dims = getOutDims(fmt);
        setSel(computeSel(c.clientWidth, c.clientHeight, dims.ar));
        setMode('selecting');
    }, [fmt]);

    // ── Change format ──────────────────────────────────────────────────────────
    const changeFmt = useCallback((newFmt: RecordFmt) => {
        setFmt(newFmt);
        const dims = getOutDims(newFmt);
        setSel(prev => {
            if (!prev.w) return prev;
            const nw = prev.w;
            const nh = nw / dims.ar;
            return { x: prev.x, y: prev.y + (prev.h - nh) / 2, w: nw, h: nh };
        });
    }, []);

    // ── Pointer drag (selection rect) ─────────────────────────────────────────
    const onSelPtrDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const isResize = !!(e.target as HTMLElement).closest('[data-resize]');
        dragRef.current = { sx: e.clientX, sy: e.clientY, orig: { ...sel }, resize: isResize };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
    }, [sel]);

    const onSelPtrMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current) return;
        const { sx, sy, orig, resize } = dragRef.current;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        const dims = getOutDims(fmt);
        if (resize) {
            const nw = Math.max(60, orig.w + dx);
            setSel({ ...orig, w: nw, h: nw / dims.ar });
        } else {
            setSel({ ...orig, x: orig.x + dx, y: orig.y + dy });
        }
    }, [fmt]);

    const onSelPtrUp = useCallback(() => { dragRef.current = null; }, []);

    // ── Start recording (offscreen canvas — never touches the main renderer) ──
    const startRecording = useCallback(async () => {
        const sr = sceneRef.current;
        if (!sr || mode !== 'selecting' || !sel.w) return;
        const { renderer } = sr;
        const dims = getOutDims(fmt);
        // Use current DPR — no boost needed; boosting enlentece el loop de animación
        const pr = renderer.getPixelRatio() as number;
        const sx = Math.max(0, sel.x) * pr;
        const sy = Math.max(0, sel.y) * pr;
        const sw = sel.w * pr;
        const sh = sel.h * pr;

        // Offscreen canvas at final resolution
        const oc  = document.createElement('canvas');
        oc.width  = dims.w;
        oc.height = dims.h;
        const ctx = oc.getContext('2d')!;

        // Hook into the main render loop — drawImage fires immediately after each Three.js frame,
        // eliminating the double-rAF competition that caused stuttering
        let drawOk = true;
        sr.setPostRenderHook?.(() => {
            try {
                ctx.drawImage(renderer.domElement, sx, sy, sw, sh, 0, 0, dims.w, dims.h);
            } catch (e) {
                if (drawOk) { drawOk = false; console.warn('[3DRecord] drawImage failed:', e); }
            }
        });

        // Pick best supported mime type
        const mimeType =
            MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' :
            MediaRecorder.isTypeSupported('video/mp4')             ? 'video/mp4' :
            MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
            'video/webm';

        let mr: MediaRecorder;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mr = new MediaRecorder((oc as any).captureStream(30), { mimeType, videoBitsPerSecond: FMTS[fmt].bps });
        } catch {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mr = new MediaRecorder((oc as any).captureStream(30));
            } catch (e2) {
                sr.setPostRenderHook?.(null);
                console.error('[3DRecord] MediaRecorder not supported:', e2);
                setMode('idle');
                return;
            }
        }

        chunksRef.current = [];
        mrRef.current = mr;
        const snapFmt = fmt;

        mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.onstop = () => {
            sceneRef.current?.setPostRenderHook?.(null);
            const finalMime = mr.mimeType || mimeType;
            const blob      = new Blob(chunksRef.current, { type: finalMime });
            const blobUrl   = URL.createObjectURL(blob);
            // Show preview — share/download triggered by user click (user gesture context)
            setVidPreview({ url: blobUrl, blob, mimeType: finalMime, fmt: snapFmt });
            setMode('idle');
            setCdown(0);
        };

        mr.start(100);
        setMode('recording');
        setCdown(REC_SECS);

        tickRef.current = setInterval(() => {
            setCdown(prev => {
                if (prev <= 1) { clearInterval(tickRef.current!); return 0; }
                return prev - 1;
            });
        }, 1000);
        setTimeout(() => {
            if (mrRef.current?.state === 'recording') mrRef.current.stop();
            if (tickRef.current) clearInterval(tickRef.current);
        }, REC_SECS * 1000);
    }, [mode, fmt, sel]);

    const stopRecording = useCallback(() => {
        if (mrRef.current?.state === 'recording') mrRef.current.stop();
        if (tickRef.current) clearInterval(tickRef.current);
        sceneRef.current?.setPostRenderHook?.(null);
    }, []);

    // ── Wireframe toggle (W key) ────────────────────────────────────────────────
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.code === 'KeyW' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                setWireframe(prev => !prev);
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        sceneRef.current?.setWireframeMode?.(wireframe);
    }, [wireframe, loadStatus]); // re-apply if model just loaded while wireframe was already on

    // ── Drag handlers (second model) ───────────────────────────────────────────
    const onViewerDragOver = useCallback((e: React.DragEvent) => {
        if (loadStatus !== 'ready') return;
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        setIsDragOver(true);
    }, [loadStatus]);

    const onViewerDragLeave = useCallback((e: React.DragEvent) => {
        if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
    }, []);

    const onViewerDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const name = file.name.toLowerCase();
        if (!name.endsWith('.ply') && !name.endsWith('.stl')) return;
        setSecondModel('loading');
        const buffer = await file.arrayBuffer();
        await sceneRef.current?.loadSecondModel?.(buffer, name.endsWith('.ply'));
        setSecondModel('loaded');
    }, []);

    const handleRemoveSecondModel = useCallback(() => {
        sceneRef.current?.removeSecondModel?.();
        setSecondModel('none');
    }, []);

    // ── Preview actions — called directly from click → user gesture context ──
    const discardPreview = useCallback(() => {
        if (vidPreview) URL.revokeObjectURL(vidPreview.url);
        setVidPreview(null);
        setShareHint(false);
    }, [vidPreview]);

    // ── Escape key — exit current mode or close viewer ─────────────────────────
    useEffect(() => {
        function onEscape(e: KeyboardEvent) {
            if (e.code !== 'Escape') return;
            if (vidPreview) { discardPreview(); }
            else if (mode === 'recording') { stopRecording(); }
            else if (mode === 'selecting') { setMode('idle'); }
            else { onClose?.(); }
        }
        window.addEventListener('keydown', onEscape);
        return () => window.removeEventListener('keydown', onEscape);
    }, [mode, vidPreview, discardPreview, stopRecording, onClose]);

    const downloadPreview = useCallback(() => {
        if (!vidPreview) return;
        const ext  = vidPreview.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        const name = `modelo3d-${vidPreview.fmt}.${ext}`;
        dlBlob(vidPreview.url, name);
    }, [vidPreview]);

    // Must be called directly from a user click (not async callback) for iOS/Safari share
    const sharePreview = useCallback(async () => {
        if (!vidPreview) return;
        // Strip codec info (e.g. "video/mp4;codecs=avc1" → "video/mp4") — required for canShare()
        const baseMime = vidPreview.mimeType.split(';')[0].trim();
        const ext  = baseMime === 'video/mp4' ? 'mp4' : 'webm';
        const name = `modelo3d-${vidPreview.fmt}.${ext}`;
        const file = new File([vidPreview.blob], name, { type: baseMime });

        // navigator.share with files = AirDrop on macOS Safari / iOS
        if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: 'Modelo 3D — AM Clínica' });
                // success: close preview
                URL.revokeObjectURL(vidPreview.url);
                setVidPreview(null);
                setShareHint(false);
            } catch (e: unknown) {
                const err = e as { name?: string };
                if (err?.name !== 'AbortError') {
                    // Share failed for unknown reason → download as fallback
                    dlBlob(vidPreview.url, name);
                }
                // AbortError = user cancelled AirDrop → do nothing, keep preview open
            }
        } else {
            // Browser doesn't support file sharing (Chrome desktop, Firefox)
            // Show hint instead of silently downloading
            setShareHint(true);
        }
    }, [vidPreview]);

    // ── Three.js setup ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mountRef.current) return;
        const container = mountRef.current;
        let animId = 0;

        async function init() {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const THREE          = await import('three' as any);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { STLLoader }   = await import('three/examples/jsm/loaders/STLLoader.js' as any);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js' as any);

                const w = container.clientWidth;
                const h = container.clientHeight;

                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0x0D0D12);
                const grid = new THREE.GridHelper(200, 30, 0x1a1a2a, 0x1a1a2a);
                grid.position.y = -30;
                scene.add(grid);

                const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
                // Elevated position → the model is seen slightly from above-front
                // (compensates the typical ~15-20° upward tilt of dental PLY exports)
                camera.position.set(0, 40, 140);

                // preserveDrawingBuffer NOT needed — drawImage fires in the same rAF callback,
                // before the browser compositor clears the buffer. Removing it restores GPU pipelining.
                const renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(w, h);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                container.appendChild(renderer.domElement);

                scene.add(new THREE.AmbientLight(0xffffff, 0.5));
                const key = new THREE.DirectionalLight(0xfff5e0, 1.2);
                key.position.set(100, 100, 100); key.castShadow = true; scene.add(key);
                const fill = new THREE.DirectionalLight(0xe0f0ff, 0.6);
                fill.position.set(-100, 50, -100); scene.add(fill);
                const rim = new THREE.PointLight(0xC9A96E, 0.8, 500);
                rim.position.set(0, -80, -100); scene.add(rim);

                const controls = new OrbitControls(camera, renderer.domElement);
                controls.enableDamping = false; // constant autoRotate — never slows down
                controls.autoRotate = true;     controls.autoRotateSpeed = 1.2;
                controls.minDistance = 20;      controls.maxDistance = 500;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                function loadMesh(geo: any) {
                    geo.computeBoundingBox();
                    geo.computeVertexNormals();
                    // Compute center BEFORE centering — saved for second-model alignment
                    const boxRaw = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
                    const cVec   = boxRaw.getCenter(new THREE.Vector3());
                    const sz     = boxRaw.getSize(new THREE.Vector3());
                    const s      = 80 / Math.max(sz.x, sz.y, sz.z);
                    firstModelInfoRef.current = { cx: cVec.x, cy: cVec.y, cz: cVec.z, scale: s };
                    // Center geometry
                    geo.translate(-cVec.x, -cVec.y, -cVec.z);
                    const mat = geo.attributes.color
                        ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05 })
                        : new THREE.MeshPhysicalMaterial({
                            color: 0xF7F3EE, roughness: 0.18, metalness: 0.02, reflectivity: 0.8,
                            clearcoat: 0.5, clearcoatRoughness: 0.05, transmission: 0.1, thickness: 0.5,
                        });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.scale.setScalar(s);
                    mesh.castShadow = mesh.receiveShadow = true;
                    scene.add(mesh);
                    setLoadStatus('ready');
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const onPrg = (e: any) => { if (e.total > 0) setLoadPct(Math.round(e.loaded / e.total * 100)); };
                const onErr = (e: unknown) => { console.error('[3DViewer]', e); setLoadStatus('error'); };

                if (format === 'ply') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js' as any);
                    new PLYLoader().load(url, loadMesh, onPrg, onErr);
                } else {
                    new STLLoader().load(url, loadMesh, onPrg, onErr);
                }

                let postRenderHook: (() => void) | null = null;

                function animate() {
                    animId = requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene, camera);
                    postRenderHook?.(); // copy frame to offscreen canvas if recording
                }
                animate();

                const ro = new ResizeObserver(() => {
                    const nw = container.clientWidth;
                    const nh = container.clientHeight;
                    camera.aspect = nw / nh;
                    camera.updateProjectionMatrix();
                    renderer.setSize(nw, nh);
                });
                ro.observe(container);
                // ── Wireframe mode — shows actual polygon triangles ─────────────────────────
                const origMaterials = new Map<string, any>();
                let wireframeActive = false;
                function setWireframeFn(on: boolean) {
                    wireframeActive = on;
                    scene.traverse((obj: any) => {
                        if (!obj.isMesh) return;
                        if (on) {
                            if (!origMaterials.has(obj.uuid)) origMaterials.set(obj.uuid, obj.material);
                            const orig = obj.material;
                            const hasVertexColors = !!obj.geometry?.attributes?.color;
                            obj.material = new THREE.MeshBasicMaterial({
                                wireframe: true,
                                ...(hasVertexColors
                                    ? { vertexColors: true }
                                    : { color: orig.color ?? 0xF7F3EE }),
                                opacity: 0.65,
                                transparent: true,
                            });
                        } else {
                            const orig = origMaterials.get(obj.uuid);
                            if (orig) {
                                if (obj.material !== orig) obj.material.dispose();
                                obj.material = orig;
                            }
                        }
                    });
                }

                // ── Load second model (lower arch) ──────────────────────────────────────────
                async function loadSecondModelFn(buf: ArrayBuffer, isPly: boolean) {
                    const info = firstModelInfoRef.current;
                    if (!info) return;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let geo2: any;
                    if (isPly) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { PLYLoader: PL } = await import('three/examples/jsm/loaders/PLYLoader.js' as any);
                        geo2 = new PL().parse(buf);
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { STLLoader: SL } = await import('three/examples/jsm/loaders/STLLoader.js' as any);
                        geo2 = new SL().parse(buf);
                    }
                    geo2.computeVertexNormals();
                    // Apply the exact same translation as the first model → preserves bite/occlusion
                    geo2.translate(-info.cx, -info.cy, -info.cz);
                    const mat2 = geo2.attributes.color
                        ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05 })
                        : new THREE.MeshPhysicalMaterial({
                            color: 0xD4C5B0, roughness: 0.22, metalness: 0.02,
                            clearcoat: 0.4, clearcoatRoughness: 0.08, transmission: 0.05, thickness: 0.5,
                        });
                    const mesh2 = new THREE.Mesh(geo2, mat2);
                    mesh2.scale.setScalar(info.scale);
                    mesh2.castShadow = mesh2.receiveShadow = true;
                    mesh2.userData.isSecondModel = true;
                    scene.add(mesh2);
                    // If wireframe was already active, apply to new mesh too
                    if (wireframeActive) setWireframeFn(true);
                }

                function removeSecondModelFn() {
                    const toRemove: any[] = [];
                    scene.traverse((obj: any) => { if (obj.userData?.isSecondModel) toRemove.push(obj); });
                    for (const obj of toRemove) {
                        origMaterials.delete(obj.uuid);
                        scene.remove(obj);
                        obj.geometry?.dispose?.();
                        const m = obj.material;
                        if (Array.isArray(m)) m.forEach((x: any) => x.dispose?.());
                        else m?.dispose?.();
                    }
                }

                sceneRef.current = {
                    renderer, camera, controls, animId, scene,
                    loadSecondModel: loadSecondModelFn,
                    removeSecondModel: removeSecondModelFn,
                    setWireframeMode: setWireframeFn,
                    setPostRenderHook: (fn) => { postRenderHook = fn; },
                };

                return () => {
                    ro.disconnect();
                    cancelAnimationFrame(animId);
                    renderer.dispose();
                    if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
                };
            } catch {
                setLoadStatus('no-three');
            }
        }

        const cleanup = init();
        return () => {
            cleanup.then(fn => fn?.());
            if (sceneRef.current) cancelAnimationFrame(sceneRef.current.animId);
        };
    }, [url, format]);

    // ── Render ─────────────────────────────────────────────────────────────────
    const dims = getOutDims(fmt);

    return (
        <div
            className="relative w-full h-full min-h-[400px] bg-[#0D0D12] rounded-none sm:rounded-2xl overflow-hidden"
            onDragOver={onViewerDragOver}
            onDragLeave={onViewerDragLeave}
            onDrop={onViewerDrop}
        >

            {/* Three.js mount */}
            <div ref={mountRef} className="w-full h-full" />

            {/* Drag-over overlay — drop second model here */}
            {isDragOver && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#C9A96E]/15 border-2 border-dashed border-[#C9A96E]/70 rounded-2xl pointer-events-none">
                    <Box size={38} className="text-[#C9A96E]" />
                    <p className="text-white font-semibold text-sm">Soltá para cargar modelo inferior</p>
                </div>
            )}

            {/* Second model loading spinner */}
            {secondModel === 'loading' && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white/70 text-xs flex items-center gap-1.5 pointer-events-none">
                    <div className="h-3 w-3 rounded-full border border-[#C9A96E]/40 border-t-[#C9A96E] animate-spin" />
                    Cargando modelo inferior…
                </div>
            )}

            {/* Loading */}
            {loadStatus === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0D0D12]">
                    <div className="relative">
                        <div className="h-20 w-20 rounded-full border-2 border-[#C9A96E]/20 border-t-[#C9A96E] animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Box size={22} className="text-[#C9A96E]/60" />
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-white/60 text-sm font-medium">Cargando modelo 3D</p>
                        {loadPct > 0 && <p className="text-[#C9A96E] text-xs mt-1">{loadPct}%</p>}
                    </div>
                </div>
            )}

            {/* No-three */}
            {loadStatus === 'no-three' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-[#0D0D12]">
                    <div className="h-16 w-16 rounded-2xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 flex items-center justify-center">
                        <Box size={28} className="text-[#C9A96E]" />
                    </div>
                    <p className="text-white font-bold">Modelo 3D disponible</p>
                    <p className="text-white/40 text-sm">El visor 3D requiere configuración adicional.</p>
                    <a href={url} download className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 text-[#C9A96E] text-sm font-medium">
                        <Download size={15} /> Descargar archivo 3D
                    </a>
                </div>
            )}

            {/* Error */}
            {loadStatus === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center bg-[#0D0D12]">
                    <p className="text-white/60 text-sm">No se pudo cargar el modelo.</p>
                    <a href={url} download className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/10">
                        <Download size={14} /> Descargar modelo 3D
                    </a>
                </div>
            )}

            {/* ── IDLE: hint + record button ── */}
            {loadStatus === 'ready' && mode === 'idle' && !vidPreview && (
                <>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/40 backdrop-blur border border-white/10 pointer-events-none">
                        <p className="text-white/50 text-xs">Arrastrá · Scroll · Pellizcá · <span className="font-mono">W</span> malla</p>
                    </div>
                    <button
                        onClick={enterSelecting}
                        className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/15 text-white/70 text-xs font-medium hover:bg-white/10 hover:text-white transition-all"
                    >
                        <Video size={13} /> Grabar
                    </button>

                    {/* Top-left badges: wireframe indicator + second model button */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                        {wireframe && (
                            <div className="px-2.5 py-1 rounded-full bg-white/10 border border-white/25 text-white/70 text-xs font-medium pointer-events-none">
                                W · Malla
                            </div>
                        )}
                        {secondModel === 'loaded' && (
                            <button
                                onClick={handleRemoveSecondModel}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/15 text-white/60 text-xs hover:text-white transition-all"
                                title="Quitar modelo inferior"
                            >
                                <X size={11} /> Inferior
                            </button>
                        )}
                        {secondModel === 'none' && !wireframe && (
                            <div className="px-2.5 py-1 rounded-full bg-black/30 border border-white/8 text-white/25 text-xs pointer-events-none">
                                + Soltá inferior
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── SELECTING: spotlight overlay ── */}
            {/* Container is pointer-events-none so OrbitControls (zoom/rotate) still works
                 everywhere except the control bar and the draggable selection rect */}
            {loadStatus === 'ready' && mode === 'selecting' && sel.w > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                    {/* Top control bar — pointer-events-auto so buttons are clickable.
                         Wheel forwarded so zoom works when cursor is over this bar. */}
                    <div
                        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 bg-black/80 backdrop-blur border-b border-white/10 z-10 pointer-events-auto"
                        style={{ height: CTRL_H }}
                        onWheel={(e) => {
                            const canvas = sceneRef.current?.renderer?.domElement;
                            if (!canvas) return;
                            canvas.dispatchEvent(new WheelEvent('wheel', {
                                deltaY: e.deltaY, deltaX: e.deltaX, deltaZ: e.deltaZ,
                                deltaMode: e.deltaMode, ctrlKey: e.ctrlKey,
                                bubbles: false, cancelable: true,
                            }));
                        }}
                    >
                        <div className="flex items-center gap-1.5">
                            {(Object.keys(FMTS) as RecordFmt[]).map(k => (
                                <button
                                    key={k}
                                    onClick={() => changeFmt(k)}
                                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                        fmt === k
                                            ? 'bg-[#C9A96E] text-[#0D0D12]'
                                            : 'text-white/50 hover:text-white border border-white/15'
                                    }`}
                                >
                                    {FMTS[k].label}
                                    <span className="ml-1 opacity-60">{FMTS[k].ratio}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMode('idle')}
                                className="px-3 py-1.5 rounded-full text-white/50 text-xs hover:text-white/80 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={startRecording}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#C9A96E] text-[#0D0D12] font-semibold text-xs hover:bg-[#d4b87e] transition-colors"
                            >
                                <Video size={12} /> Grabar {REC_SECS}s
                            </button>
                        </div>
                    </div>

                    {/* Four dim strips — pointer-events-none so 3D model stays interactive */}
                    <div className="absolute bg-black/55 pointer-events-none"
                        style={{ left: 0, top: CTRL_H, right: 0, height: Math.max(0, sel.y - CTRL_H) }} />
                    <div className="absolute bg-black/55 pointer-events-none"
                        style={{ left: 0, top: sel.y + sel.h, right: 0, bottom: 0 }} />
                    <div className="absolute bg-black/55 pointer-events-none"
                        style={{ left: 0, top: sel.y, width: sel.x, height: sel.h }} />
                    <div className="absolute bg-black/55 pointer-events-none"
                        style={{ left: sel.x + sel.w, top: sel.y, right: 0, height: sel.h }} />

                    {/* Draggable selection rect — pointer-events-auto so drag works.
                         Wheel events are forwarded to the canvas so zoom still works. */}
                    <div
                        className="absolute cursor-move select-none pointer-events-auto"
                        style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h, touchAction: 'none' }}
                        onPointerDown={onSelPtrDown}
                        onPointerMove={onSelPtrMove}
                        onPointerUp={onSelPtrUp}
                        onPointerCancel={onSelPtrUp}
                        onWheel={(e) => {
                            const canvas = sceneRef.current?.renderer?.domElement;
                            if (!canvas) return;
                            canvas.dispatchEvent(new WheelEvent('wheel', {
                                deltaY: e.deltaY, deltaX: e.deltaX, deltaZ: e.deltaZ,
                                deltaMode: e.deltaMode, ctrlKey: e.ctrlKey,
                                bubbles: false, cancelable: true,
                            }));
                        }}
                    >
                        <div className="absolute inset-0 border border-white/60" />
                        {/* Corner brackets */}
                        <div className="absolute top-0    left-0  w-5 h-5 border-t-2 border-l-2 border-white pointer-events-none" />
                        <div className="absolute top-0    right-0 w-5 h-5 border-t-2 border-r-2 border-white pointer-events-none" />
                        <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-white pointer-events-none" />
                        {/* Center label */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="text-white/75 text-xs font-medium bg-black/50 px-2.5 py-1 rounded-full backdrop-blur">
                                {dims.label} {dims.ratio} · arrastrá para mover
                            </span>
                        </div>
                        {/* Resize handle — bottom right */}
                        <div
                            data-resize="true"
                            className="absolute bottom-0 right-0 w-9 h-9 flex items-end justify-end p-2 cursor-se-resize"
                            style={{ touchAction: 'none' }}
                        >
                            <div className="w-4 h-4 border-b-2 border-r-2 border-white pointer-events-none" />
                        </div>
                    </div>

                </div>
            )}

            {/* ── RECORDING: show frame (no dim) + REC badge ── */}
            {mode === 'recording' && sel.w > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                    {/* Light dim outside frame */}
                    <div className="absolute bg-black/30" style={{ left: 0, top: 0, right: 0, height: sel.y }} />
                    <div className="absolute bg-black/30" style={{ left: 0, top: sel.y + sel.h, right: 0, bottom: 0 }} />
                    <div className="absolute bg-black/30" style={{ left: 0, top: sel.y, width: sel.x, height: sel.h }} />
                    <div className="absolute bg-black/30" style={{ left: sel.x + sel.w, top: sel.y, right: 0, height: sel.h }} />

                    {/* Frame border */}
                    <div className="absolute border-2 border-white/80" style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}>
                        {/* REC badge inside frame */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur border border-red-500/50">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-white text-[10px] font-bold tracking-wide">REC · {countdown}s</span>
                        </div>
                        {/* Corner brackets */}
                        <div className="absolute top-0    left-0  w-5 h-5 border-t-2 border-l-2 border-white" />
                        <div className="absolute top-0    right-0 w-5 h-5 border-t-2 border-r-2 border-white" />
                        <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-white" />
                        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white" />
                    </div>
                </div>
            )}
            {/* Stop button (needs pointer events) */}
            {mode === 'recording' && (
                <button
                    onClick={stopRecording}
                    className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white/70 text-xs hover:text-white transition-all"
                >
                    <StopCircle size={13} /> Detener
                </button>
            )}

            {/* ── VIDEO PREVIEW MODAL ── */}
            {vidPreview && (
                <div
                    className="absolute inset-0 z-20 bg-black/95 flex flex-col items-center justify-center gap-5 p-4"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Close */}
                    <button
                        onClick={discardPreview}
                        className="absolute top-3 right-3 p-2 rounded-full bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>

                    {/* Video preview */}
                    <div className="flex-1 flex items-center justify-center w-full min-h-0">
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video
                            src={vidPreview.url}
                            autoPlay
                            loop
                            playsInline
                            className="max-h-full max-w-full rounded-xl shadow-2xl"
                            style={{ maxHeight: 'calc(100% - 4rem)' }}
                        />
                    </div>

                    {/* Format label */}
                    <p className="text-white/40 text-xs">
                        {getOutDims(vidPreview.fmt).label} · {getOutDims(vidPreview.fmt).w}×{getOutDims(vidPreview.fmt).h} · {REC_SECS}s
                    </p>

                    {/* AirDrop not available hint */}
                    {shareHint && (
                        <div className="w-full max-w-xs px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                            <p className="text-amber-400 text-xs font-medium">AirDrop no disponible en este navegador</p>
                            <p className="text-amber-400/60 text-xs mt-0.5">Descargá el video y compartilo desde Safari o el Finder</p>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3 w-full max-w-xs">
                        <button
                            onClick={discardPreview}
                            className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/50 text-sm hover:text-white/80 transition-colors"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={downloadPreview}
                            className="py-2.5 px-4 rounded-xl border border-white/15 text-white/60 text-sm hover:text-white transition-colors flex items-center gap-1.5"
                            title="Descargar video"
                        >
                            <Download size={14} />
                        </button>
                        <button
                            onClick={sharePreview}
                            className="flex-1 py-2.5 rounded-xl bg-[#C9A96E] text-[#0D0D12] font-semibold text-sm hover:bg-[#d4b87e] transition-colors flex items-center justify-center gap-1.5"
                        >
                            <Share2 size={14} /> AirDrop
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
