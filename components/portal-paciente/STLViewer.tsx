'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Box, Download, RotateCcw } from 'lucide-react';

interface STLViewerProps {
    url: string;
}

export default function STLViewer({ url }: STLViewerProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        renderer: unknown;
        animId: number;
        controls: unknown;
    } | null>(null);

    const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'no-three'>('loading');
    const [loadingPct, setLoadingPct] = useState(0);

    useEffect(() => {
        if (!mountRef.current) return;
        const container = mountRef.current;
        let animId = 0;

        async function init() {
            try {
                // Dynamic import — requiere npm install three
                const THREE = await import('three');
                const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js' as string);
                const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js' as string);

                const w = container.clientWidth;
                const h = container.clientHeight;

                // ── Scene ──
                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0x0D0D12);

                // Subtle grid
                const grid = new THREE.GridHelper(200, 30, 0x1a1a2a, 0x1a1a2a);
                grid.position.y = -30;
                scene.add(grid);

                // ── Camera ──
                const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
                camera.position.set(0, 0, 150);

                // ── Renderer ──
                const renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(w, h);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                container.appendChild(renderer.domElement);

                // ── Lights ──
                const ambient = new THREE.AmbientLight(0xffffff, 0.5);
                scene.add(ambient);

                // Key light (warm)
                const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
                keyLight.position.set(100, 100, 100);
                keyLight.castShadow = true;
                scene.add(keyLight);

                // Fill light (cool)
                const fillLight = new THREE.DirectionalLight(0xe0f0ff, 0.6);
                fillLight.position.set(-100, 50, -100);
                scene.add(fillLight);

                // Rim light (gold accent)
                const rimLight = new THREE.PointLight(0xC9A96E, 0.8, 500);
                rimLight.position.set(0, -80, -100);
                scene.add(rimLight);

                // ── Controls ──
                const controls = new OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.06;
                controls.autoRotate = true;
                controls.autoRotateSpeed = 1.2;
                controls.minDistance = 20;
                controls.maxDistance = 500;

                // ── Load STL ──
                const loader = new STLLoader();
                loader.load(
                    url,
                    (geometry: THREE.BufferGeometry) => {
                        geometry.computeBoundingBox();
                        geometry.center();
                        geometry.computeVertexNormals();

                        // Scale to fit view
                        const box = new THREE.Box3().setFromBufferAttribute(
                            geometry.attributes.position as THREE.BufferAttribute
                        );
                        const size = box.getSize(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const scale = 80 / maxDim;

                        const material = new THREE.MeshPhysicalMaterial({
                            color: 0xF0EDE8,        // Warm tooth-white
                            roughness: 0.25,
                            metalness: 0.05,
                            reflectivity: 0.5,
                            clearcoat: 0.3,
                            clearcoatRoughness: 0.1,
                        });

                        const mesh = new THREE.Mesh(geometry, material);
                        mesh.scale.setScalar(scale);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        scene.add(mesh);

                        setStatus('ready');
                    },
                    (event: ProgressEvent) => {
                        if (event.total > 0) {
                            setLoadingPct(Math.round((event.loaded / event.total) * 100));
                        }
                    },
                    (err: unknown) => {
                        console.error('[STLViewer] load error:', err);
                        setStatus('error');
                    }
                );

                // ── Animation loop ──
                function animate() {
                    animId = requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene, camera);
                }
                animate();

                // ── Resize ──
                const ro = new ResizeObserver(() => {
                    const nw = container.clientWidth;
                    const nh = container.clientHeight;
                    camera.aspect = nw / nh;
                    camera.updateProjectionMatrix();
                    renderer.setSize(nw, nh);
                });
                ro.observe(container);

                sceneRef.current = { renderer, animId, controls };

                return () => {
                    ro.disconnect();
                    cancelAnimationFrame(animId);
                    renderer.dispose();
                    if (container.contains(renderer.domElement)) {
                        container.removeChild(renderer.domElement);
                    }
                };
            } catch {
                setStatus('no-three');
            }
        }

        const cleanup = init();
        return () => {
            cleanup.then(fn => fn?.());
            if (sceneRef.current) {
                cancelAnimationFrame(sceneRef.current.animId);
            }
        };
    }, [url]);

    function resetView() {
        // Trigger re-mount by changing key (handled by parent)
    }

    return (
        <div className="relative w-full h-full min-h-[400px] bg-[#0D0D12] rounded-none sm:rounded-2xl overflow-hidden">

            {/* Three.js mount point */}
            <div ref={mountRef} className="w-full h-full" />

            {/* Loading overlay */}
            {status === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0D0D12]">
                    {/* Animated dental scan feel */}
                    <div className="relative">
                        <div className="h-20 w-20 rounded-full border-2 border-[#C9A96E]/20 border-t-[#C9A96E] animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Box size={22} className="text-[#C9A96E]/60" />
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-white/60 text-sm font-medium">Cargando modelo 3D</p>
                        {loadingPct > 0 && (
                            <p className="text-[#C9A96E] text-xs mt-1">{loadingPct}%</p>
                        )}
                    </div>
                </div>
            )}

            {/* No three.js installed fallback */}
            {status === 'no-three' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-[#0D0D12]">
                    <div className="h-16 w-16 rounded-2xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 flex items-center justify-center">
                        <Box size={28} className="text-[#C9A96E]" />
                    </div>
                    <div>
                        <p className="text-white font-bold">Modelo 3D disponible</p>
                        <p className="text-white/40 text-sm mt-1">El visor 3D requiere configuración adicional.</p>
                    </div>
                    <a
                        href={url}
                        download
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 text-[#C9A96E] text-sm font-medium hover:bg-[#C9A96E]/15 transition-colors"
                    >
                        <Download size={15} />
                        Descargar archivo STL
                    </a>
                </div>
            )}

            {/* Error fallback */}
            {status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center bg-[#0D0D12]">
                    <p className="text-white/60 text-sm">No se pudo cargar el modelo.</p>
                    <a
                        href={url}
                        download
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/10"
                    >
                        <Download size={14} />
                        Descargar STL
                    </a>
                </div>
            )}

            {/* Controls overlay (shown when ready) */}
            {status === 'ready' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur border border-white/10">
                    <p className="text-white/50 text-xs">Arrastrá · Scroll · Pellizcá</p>
                </div>
            )}
        </div>
    );
}
