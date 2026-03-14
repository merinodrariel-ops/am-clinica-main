'use client';

import { useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';

interface Mini3DPreviewProps {
    fileId: string;
    format: 'stl' | 'ply';
}

export default function Mini3DPreview({ fileId, format }: Mini3DPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    obs.disconnect();
                    void generate();
                }
            },
            { rootMargin: '150px' }
        );
        obs.observe(el);
        return () => obs.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileId, format]);

    async function generate() {
        setStatus('loading');
        const SIZE = 120;
        const url = `/api/drive/file/${fileId}`;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const THREE = await import('three' as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js' as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js' as any);

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0D0D12);

            const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
            camera.position.set(80, 60, 100);
            camera.lookAt(0, 0, 0);

            const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
            renderer.setSize(SIZE, SIZE);
            renderer.setPixelRatio(1);

            // Lights — same aesthetic as full STLViewer
            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            const key = new THREE.DirectionalLight(0xfff5e0, 1.2);
            key.position.set(100, 100, 100);
            scene.add(key);
            const fill = new THREE.DirectionalLight(0xe0f0ff, 0.6);
            fill.position.set(-100, 50, -100);
            scene.add(fill);
            const rim = new THREE.PointLight(0xC9A96E, 0.8, 500);
            rim.position.set(0, -80, -100);
            scene.add(rim);

            const material = new THREE.MeshPhysicalMaterial({
                color: 0xF7F3EE,
                roughness: 0.18,
                metalness: 0.02,
                clearcoat: 0.5,
                clearcoatRoughness: 0.05,
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await new Promise<void>((resolve, reject) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const onLoad = (geometry: any) => {
                    geometry.computeBoundingBox();
                    geometry.center();
                    geometry.computeVertexNormals();
                    const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
                    const size = box.getSize(new THREE.Vector3());
                    const scale = 80 / Math.max(size.x, size.y, size.z);
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.scale.setScalar(scale);
                    scene.add(mesh);
                    resolve();
                };
                if (format === 'ply') {
                    new PLYLoader().load(url, onLoad, undefined, reject);
                } else {
                    new STLLoader().load(url, onLoad, undefined, reject);
                }
            });

            renderer.render(scene, camera);
            const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.85);
            // Cleanup immediately — no ongoing animation
            material.dispose();
            renderer.dispose();
            setThumbnail(dataUrl);
            setStatus('done');
        } catch {
            setStatus('error');
        }
    }

    return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center relative">
            {status === 'done' && thumbnail ? (
                <img
                    src={thumbnail}
                    alt="3D preview"
                    className="w-full h-full object-cover rounded-lg"
                />
            ) : status === 'loading' ? (
                <>
                    <div className="h-12 w-12 rounded-xl text-[#C9A96E] bg-[#C9A96E]/10 flex items-center justify-center">
                        <Box size={22} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-[#0D0D12]/60">
                        <div className="h-5 w-5 rounded-full border-2 border-[#C9A96E]/30 border-t-[#C9A96E] animate-spin" />
                    </div>
                </>
            ) : (
                <div className="h-12 w-12 rounded-xl text-[#C9A96E] bg-[#C9A96E]/10 flex items-center justify-center">
                    <Box size={22} />
                </div>
            )}
        </div>
    );
}
