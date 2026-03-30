'use client';

import { Camera, Image as ImageIcon, Maximize2 } from 'lucide-react';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import type { PhotoTag } from '@/app/actions/photo-tags';
import Image from 'next/image';

interface ClinicalPresentationGridProps {
    files: DriveFile[];
    photoTags: Record<string, PhotoTag>;
    onPreview: (file: DriveFile) => void;
}

interface Slot {
    id: string;
    label: string;
    category: string;
    subcategory: string;
}

const EXTRAORAL_SLOTS: Slot[] = [
    { id: 'ex_frente',   label: 'Rostro Frente',       category: 'rostro',    subcategory: 'frente' },
    { id: 'ex_sonrisa',  label: 'Rostro Sonrisa',      category: 'labios',    subcategory: 'sonrisa' },
    { id: 'ex_perfil',   label: 'Rostro Perfil',       category: 'rostro',    subcategory: 'perfil_der' },
];

const INTRAORAL_SLOTS: Slot[] = [
    { id: 'in_frente',   label: 'Intraoral Frente',     category: 'intraoral', subcategory: 'frente' },
    { id: 'in_lat_der',  label: 'Mordida Der.',        category: 'intraoral', subcategory: 'mordida_der' },
    { id: 'in_lat_izq',  label: 'Mordida Izq.',        category: 'intraoral', subcategory: 'mordida_izq' },
    { id: 'lab_reposo',  label: 'Labios Reposo',       category: 'labios',    subcategory: 'reposo' },
    { id: 'in_ocl_sup',  label: 'Oclusal Sup.',        category: 'intraoral', subcategory: 'oclusal_sup' },
    { id: 'in_ocl_inf',  label: 'Oclusal Inf.',        category: 'intraoral', subcategory: 'oclusal_inf' },
];

export default function ClinicalPresentationGrid({ files, photoTags, onPreview }: ClinicalPresentationGridProps) {
    const findFileForSlot = (slot: Slot) => {
        const fileId = Object.keys(photoTags).find(id => {
            const tag = photoTags[id];
            return tag.category === slot.category && tag.subcategory === slot.subcategory;
        });
        if (!fileId) return null;
        return files.find(f => f.id === fileId);
    };

    const RenderSlot = (slot: Slot) => {
        const file = findFileForSlot(slot);
        return (
            <div 
                key={slot.id}
                className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 shadow-sm transition-all hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50"
            >
                {file ? (
                    <div 
                        className="absolute inset-0 cursor-pointer"
                        onClick={() => onPreview(file)}
                    >
                        <Image
                            src={file.thumbnailLink?.replace(/=s[0-9]+/, '=s800') || file.webViewLink || ''}
                            alt={slot.label}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="bg-white/20 backdrop-blur-md p-2 rounded-full transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                <Maximize2 className="text-white w-5 h-5" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 p-4 h-full justify-center text-center opacity-40 group-hover:opacity-100 transition-opacity">
                        <Camera className="w-8 h-8 text-gray-300 dark:text-white/20" />
                        <span className="text-[10px] font-bold text-gray-400 dark:text-white/30 uppercase tracking-widest">{slot.label}</span>
                    </div>
                )}
                
                <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-lg z-10 pointer-events-none">
                    <span className="text-[9px] font-bold text-white/90 uppercase tracking-wider">
                        {slot.label}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-4 w-1 bg-blue-500 rounded-full" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">Extraoral</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {EXTRAORAL_SLOTS.map(RenderSlot)}
                </div>
            </section>

            <section>
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-4 w-1 bg-emerald-500 rounded-full" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">Intraoral</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {INTRAORAL_SLOTS.map(RenderSlot)}
                </div>
            </section>
        </div>
    );
}
