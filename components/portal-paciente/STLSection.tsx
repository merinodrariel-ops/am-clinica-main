'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Box, ChevronRight, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import of STL viewer to avoid SSR issues
const STLViewer = dynamic(() => import('./STLViewer'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-64 rounded-2xl bg-white/5 border border-white/10">
            <Loader2 size={28} className="text-[#C9A96E] animate-spin" />
        </div>
    ),
});

interface STLFile {
    id: string;
    file_type: string;
    label: string;
    file_url: string;
    thumbnail_url: string | null;
    created_at: string;
}

interface STLSectionProps {
    stlFiles: STLFile[];
}

export default function STLSection({ stlFiles }: STLSectionProps) {
    const [activeStl, setActiveStl] = useState<{ url: string; label: string } | null>(null);

    if (stlFiles.length === 0) return null;

    return (
        <div className="rounded-3xl bg-[#14141A] border border-white/5 p-6 space-y-4">
            <div className="flex items-center gap-2">
                <Box size={16} className="text-[#C9A96E]" />
                <h2 className="text-white font-bold text-lg">Tus Modelos 3D</h2>
            </div>
            <p className="text-white/40 text-sm">Tus escaneados dentales en 3D. Rotá el modelo con el mouse o dedo.</p>

            {/* STL grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stlFiles.map(f => (
                    <motion.button
                        key={f.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setActiveStl({ url: f.file_url, label: f.label })}
                        className="text-left rounded-2xl bg-white/5 border border-white/10 p-4 hover:border-[#C9A96E]/30 hover:bg-[#C9A96E]/5 transition-all group"
                    >
                        <div className="h-20 flex items-center justify-center mb-3">
                            <div className="h-14 w-14 rounded-2xl bg-[#C9A96E]/10 flex items-center justify-center group-hover:bg-[#C9A96E]/20 transition-colors">
                                <Box size={24} className="text-[#C9A96E]" />
                            </div>
                        </div>
                        <p className="text-white text-sm font-semibold truncate">{f.label}</p>
                        <p className="text-white/40 text-xs mt-1">
                            {format(parseISO(f.created_at), 'd MMM yyyy', { locale: es })}
                        </p>
                        <div className="mt-2 flex items-center gap-1 text-[#C9A96E] text-xs font-medium">
                            <span>Ver en 3D</span>
                            <ChevronRight size={12} />
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Inline STL viewer modal */}
            <AnimatePresence>
                {activeStl && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col"
                        onClick={() => setActiveStl(null)}
                    >
                        <div className="flex items-center justify-between px-6 py-4" onClick={e => e.stopPropagation()}>
                            <div>
                                <p className="text-white font-bold">{activeStl.label}</p>
                                <p className="text-white/40 text-xs">Arrastrá para rotar · Scroll para zoom</p>
                            </div>
                            <button
                                onClick={() => setActiveStl(null)}
                                className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="flex-1" onClick={e => e.stopPropagation()}>
                            <STLViewer url={activeStl.url} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
