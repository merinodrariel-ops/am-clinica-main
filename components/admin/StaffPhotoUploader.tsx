'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { uploadWorkerPhoto } from '@/app/actions/worker-portal';
import { toast } from 'sonner';

interface StaffPhotoUploaderProps {
    workerId: string;
    initialPhotoUrl?: string | null;
    workerName: string;
    initials: string;
}

export default function StaffPhotoUploader({ workerId, initialPhotoUrl, workerName, initials }: StaffPhotoUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const result = await uploadWorkerPhoto(workerId, file);
            if (result.success) {
                setPhotoUrl(result.url);
                toast.success('Foto de perfil actualizada correctamente');
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            toast.error('Error al subir la foto');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="relative inline-block">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-indigo-500/20 flex-shrink-0 overflow-hidden relative group">
                {photoUrl ? (
                    <img src={photoUrl} alt={workerName} className="w-full h-full object-cover" />
                ) : (
                    initials || '?'
                )}

                {uploading && (
                    <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>
            <label className="absolute -bottom-1 -right-1 p-2 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 transition-all shadow-lg border-2 border-slate-950 cursor-pointer">
                <Camera size={14} />
                <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleUpload}
                    disabled={uploading}
                />
            </label>
        </div>
    );
}
