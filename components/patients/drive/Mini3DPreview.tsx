'use client';

import { useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';

interface Mini3DPreviewProps {
    fileId: string;
    format: 'stl' | 'ply';
}

export default function Mini3DPreview({ fileId, format }: Mini3DPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const animRef      = useRef<number>(0);
    const visibleRef   = useRef(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        let cleanup: (() => void) | undefined;

        // Only start when card scrolls into view
        const startObs = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    startObs.disconnect();
                    void initScene(el).then(fn => { cleanup = fn; });
                }
            },
            { rootMargin: '150px' },
        );
        startObs.observe(el);

        return () => {
            startObs.disconnect();
            cleanup?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileId, format]);

    async function initScene(container: HTMLDivElement): Promise<() => void> {
        setStatus('loading');
        const url = `/api/drive/file/${fileId}`;

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const THREE          = await import('three' as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { STLLoader }    = await import('three/examples/jsm/loaders/STLLoader.js' as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { PLYLoader }    = await import('three/examples/jsm/loaders/PLYLoader.js' as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js' as any);

            const w = container.clientWidth  || 120;
            const h = container.clientHeight || 120;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0D0D12);

            // Subtle grid — same as full viewer
            const grid = new THREE.GridHelper(200, 20, 0x1a1a2a, 0x1a1a2a);
            grid.position.y = -30;
            scene.add(grid);

            const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
            camera.position.set(0, 40, 140); // same elevated angle as full viewer

            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(w, h);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            // Fill the card thumbnail area
            renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
            container.appendChild(renderer.domElement);

            // Lights — identical to full STLViewer
            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            const key = new THREE.DirectionalLight(0xfff5e0, 1.2);
            key.position.set(100, 100, 100); key.castShadow = true; scene.add(key);
            const fill = new THREE.DirectionalLight(0xe0f0ff, 0.6);
            fill.position.set(-100, 50, -100); scene.add(fill);
            const rim = new THREE.PointLight(0xC9A96E, 0.8, 500);
            rim.position.set(0, -80, -100); scene.add(rim);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping    = true; controls.dampingFactor  = 0.06;
            controls.autoRotate       = true; controls.autoRotateSpeed = 1.2;
            controls.enableZoom       = false;
            controls.enablePan        = false;
            controls.minDistance      = 20;   controls.maxDistance    = 500;

            // Load geometry
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await new Promise<void>((resolve, reject) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const onLoad = (geo: any) => {
                    geo.computeBoundingBox();
                    geo.center();
                    geo.computeVertexNormals();
                    const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
                    const sz  = box.getSize(new THREE.Vector3());
                    const s   = 80 / Math.max(sz.x, sz.y, sz.z);
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
                    resolve();
                };
                if (format === 'ply') {
                    new PLYLoader().load(url, onLoad, undefined, reject);
                } else {
                    new STLLoader().load(url, onLoad, undefined, reject);
                }
            });

            // Pause render when card is scrolled out — saves GPU
            const pauseObs = new IntersectionObserver(
                entries => { visibleRef.current = entries[0].isIntersecting; },
                { rootMargin: '50px' },
            );
            pauseObs.observe(container);
            visibleRef.current = true;

            function animate() {
                animRef.current = requestAnimationFrame(animate);
                if (!visibleRef.current) return; // skip render while off-screen
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            setStatus('done');

            return () => {
                pauseObs.disconnect();
                cancelAnimationFrame(animRef.current);
                renderer.dispose();
                if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
            };
        } catch (err) {
            console.error('[Mini3D]', err);
            setStatus('error');
            return () => {};
        }
    }

    return (
        <div ref={containerRef} className="w-full h-full relative bg-[#0D0D12] rounded-lg overflow-hidden">
            {/* Loading / error overlay — disappears once canvas is live */}
            {status !== 'done' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    {status === 'loading' ? (
                        <div className="h-5 w-5 rounded-full border-2 border-[#C9A96E]/30 border-t-[#C9A96E] animate-spin" />
                    ) : (
                        <div className="h-12 w-12 rounded-xl text-[#C9A96E] bg-[#C9A96E]/10 flex items-center justify-center">
                            <Box size={22} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
