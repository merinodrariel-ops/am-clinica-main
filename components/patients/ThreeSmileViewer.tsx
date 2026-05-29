'use client';

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ThreeSmileViewerProps {
  modelUrl?: string; // Por si se desea cargar un modelo STL real en el futuro
}

export function ThreeSmileViewer({ modelUrl }: ThreeSmileViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [teethColor, setTeethColor] = useState('#F1F5F9'); // Blanco Natural por defecto
  const [activeTone, setActiveTone] = useState<'natural' | 'aesthetic' | 'hollywood'>('natural');
  const [loading, setLoading] = useState(true);

  // Selector de tonos
  const tones = [
    { id: 'natural', name: 'Blanco Natural (A1)', color: '#ECEFF1' },
    { id: 'aesthetic', name: 'Blanco Estético (BL3)', color: '#F8FAFC' },
    { id: 'hollywood', name: 'Blanco Hollywood (BL1)', color: '#FFFFFF' }
  ];

  const handleToneChange = (toneId: 'natural' | 'aesthetic' | 'hollywood', colorHex: string) => {
    setActiveTone(toneId);
    setTeethColor(colorHex);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    setLoading(true);

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 400;

    // 1. Inicializar Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030712'); // Fondo oscuro premium matching slate-950

    // 2. Inicializar Cámara
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 18);

    // 3. Inicializar Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // 4. Inicializar Controles (Orbit)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 1.5;
    controls.minPolarAngle = Math.PI / 3;
    controls.minDistance = 8;
    controls.maxDistance = 25;

    // 5. Luces Premium Clínicas
    const ambientLight = new THREE.AmbientLight('#1e293b', 1.5);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight('#ffffff', 3.0);
    mainLight.position.set(5, 8, 10);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight('#38bdf8', 1.2); // Acento celeste de iluminación dental
    fillLight.position.set(-8, -4, 5);
    scene.add(fillLight);

    const topLight = new THREE.DirectionalLight('#ffffff', 2.0);
    topLight.position.set(0, 12, 0);
    scene.add(topLight);

    // 6. Material de Porcelana Dental Estilizado
    const toothMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(teethColor),
      roughness: 0.12,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transmission: 0.08, // Leve translucidez del esmalte
      thickness: 0.5,
    });

    const gumMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#FDA4AF'), // Rosado encías suave
      roughness: 0.35,
      metalness: 0.0,
    });

    const teethGroup = new THREE.Group();

    // 7. Generar Arcada Dental Estilizada Procedural (100% Robusta)
    // Usamos curvas parabólicas para modelar las encías e insertar los dientes
    const generateArcade = (yOffset: number, isUpper: boolean) => {
      const teethCount = 14;
      const arcWidth = 5.2;
      const arcDepth = 4.8;

      // Grupo de encía
      const gumGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1); // Solo para iniciar
      
      for (let i = 0; i < teethCount; i++) {
        const t = (i / (teethCount - 1)) * 2 - 1; // Rango [-1, 1]
        
        // Ecuación de parábola para el arco dental
        const x = arcWidth * t;
        const z = -arcDepth * (t * t) + 2.5;
        const y = yOffset + (isUpper ? -0.15 : 0.15) * (t * t);

        // Diferenciar tamaños de dientes (Incisivos centrales, laterales, caninos, premolares)
        const distanceToCenter = Math.abs(t);
        let toothWidth = 0.52;
        let toothHeight = 0.72;
        let toothDepth = 0.42;

        if (distanceToCenter < 0.15) {
          // Incisivos Centrales (Grandes)
          toothWidth = 0.65;
          toothHeight = 0.85;
          toothDepth = 0.45;
        } else if (distanceToCenter < 0.35) {
          // Incisivos Laterales (Un poco más pequeños)
          toothWidth = 0.55;
          toothHeight = 0.75;
          toothDepth = 0.42;
        } else if (distanceToCenter < 0.55) {
          // Caninos (Puntiagudos/Estilizados)
          toothWidth = 0.58;
          toothHeight = 0.82;
          toothDepth = 0.52;
        } else {
          // Premolares/Molares (Anchos y chatos)
          toothWidth = 0.52;
          toothHeight = 0.62;
          toothDepth = 0.58;
        }

        // Crear geometría del diente estilizado (Caja suavizada o Cilindro + Esfera)
        const toothGeo = new THREE.CylinderGeometry(
          toothWidth * 0.9, 
          toothWidth * 0.7, 
          toothHeight, 
          8, 
          2
        );
        // Escalar y aplastar levemente para dar forma de carilla anatómica
        toothGeo.scale(1.0, 1.0, 0.7);

        const toothMesh = new THREE.Mesh(toothGeo, toothMaterial);
        toothMesh.position.set(x, y, z);
        
        // Orientación del diente siguiendo la tangente del arco parabólico
        const angle = Math.atan2(2 * arcDepth * t, arcWidth);
        toothMesh.rotation.y = -angle + Math.PI / 2;
        
        // Rotación vertical para encajar mordida
        if (!isUpper) {
          toothMesh.rotation.x = 0.05;
        } else {
          toothMesh.rotation.x = -0.05;
          toothMesh.rotation.z = Math.PI; // Invertir para la arcada superior
        }

        teethGroup.add(toothMesh);
      }

      // Modelar una base de encía simplificada (Arco curvo elegante)
      const gumCurve = new THREE.CatmullRomCurve3([]);
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * 2 - 1;
        const x = arcWidth * 1.05 * t;
        const z = -arcDepth * 1.05 * (t * t) + 2.5;
        gumCurve.points.push(new THREE.Vector3(x, yOffset + (isUpper ? 0.35 : -0.35), z));
      }
      
      const gumTubeGeo = new THREE.TubeGeometry(gumCurve, 40, 0.45, 8, false);
      const gumMesh = new THREE.Mesh(gumTubeGeo, gumMaterial);
      teethGroup.add(gumMesh);
    };

    // Generar arcada superior e inferior
    generateArcade(0.65, true);
    generateArcade(-0.65, false);

    scene.add(teethGroup);
    setLoading(false);

    // Animación inicial de rotación suave (efecto exhibición)
    let initialRotation = true;

    // Detener la rotación inicial cuando el usuario arrastra o interactúa con el mouse/dedo
    controls.addEventListener('start', () => {
      initialRotation = false;
    });
    
    // 8. Loop de Renderizado
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (initialRotation && teethGroup) {
        teethGroup.rotation.y += 0.003;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    
    animate();

    // 9. Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 400;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Limpieza al desmontar
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, [teethColor]);

  return (
    <div className="relative w-full h-[420px] bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 flex flex-col justify-between">
      
      {/* Indicador de carga */}
      {loading && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-20">
          <div className="text-slate-400 text-sm animate-pulse flex items-center gap-2">
            <svg className="animate-spin h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Inicializando simulación 3D...
          </div>
        </div>
      )}

      {/* Header del visor */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-xl px-3 py-1.5 pointer-events-auto">
          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
            Visor 3D Interactivo
          </span>
        </div>
        
        <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-xl px-2.5 py-1 text-[10px] text-slate-400 font-medium pointer-events-auto">
          Arrastra para rotar · Pellizca para zoom
        </div>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} className="w-full flex-1" style={{ minHeight: '340px' }} />

      {/* Footer / Controlador de Tono de Esmalte (Marketing Interactivo) */}
      <div className="bg-slate-900/90 backdrop-blur-md border-t border-slate-800/80 p-4 flex flex-col md:flex-row items-center justify-between gap-4 z-10">
        <div className="text-center md:text-left">
          <p className="text-white text-xs font-bold uppercase tracking-wider">Simulador de Tono Estético</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Elige el color ideal para tus lentes de contacto de porcelana</p>
        </div>

        <div className="flex items-center gap-2">
          {tones.map((t) => (
            <button
              key={t.id}
              onClick={() => handleToneChange(t.id as any, t.color)}
              className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold tracking-wider transition-all duration-200 ${
                activeTone === t.id
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10 scale-105'
                  : 'bg-slate-800 border-slate-700 text-slate-350 hover:bg-slate-750 hover:text-white'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      
    </div>
  );
}
