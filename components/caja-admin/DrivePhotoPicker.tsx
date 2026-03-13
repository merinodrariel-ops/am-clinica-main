'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ImageOff } from 'lucide-react';
import { getPatientDrivePhotos, getDriveImageBase64 } from '@/app/actions/portfolio';

interface DrivePhoto {
    id: string;
    name: string;
    thumbnailLink?: string;
    webViewLink: string;
}

interface Props {
    pacienteNombre: string;
    onSelect: (base64: string, mimeType: string, fileName: string) => void;
    onClose: () => void;
}

export default function DrivePhotoPicker({ pacienteNombre, onSelect, onClose }: Props) {
    const [photos, setPhotos] = useState<DrivePhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getPatientDrivePhotos(pacienteNombre).then(res => {
            if (res.error) setError(res.error);
            else setPhotos(res.photos || []);
            setLoading(false);
        });
    }, [pacienteNombre]);

    async function handleSelect(photo: DrivePhoto) {
        setLoadingId(photo.id);
        const res = await getDriveImageBase64(photo.id);
        setLoadingId(null);
        if (res.error || !res.base64) {
            setError(res.error || 'No se pudo cargar la imagen');
            return;
        }
        onSelect(res.base64, res.mimeType || 'image/jpeg', photo.name);
    }

    return (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div>
                        <p className="text-white font-medium">Fotos de Drive</p>
                        <p className="text-white/40 text-sm">{pacienteNombre}</p>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading && (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                        </div>
                    )}
                    {error && <p className="text-red-400 text-sm text-center py-8">{error}</p>}
                    {!loading && !error && photos.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-white/30">
                            <ImageOff className="w-8 h-8 mb-2" />
                            <p className="text-sm">No se encontraron fotos en Drive</p>
                        </div>
                    )}
                    {!loading && photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                            {photos.map(photo => (
                                <button
                                    key={photo.id}
                                    onClick={() => handleSelect(photo)}
                                    disabled={loadingId === photo.id}
                                    className="relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-white/40 transition-all group"
                                >
                                    {photo.thumbnailLink ? (
                                        // eslint-disable-next-line @next/next-image
                                        <img
                                            src={photo.thumbnailLink}
                                            alt={photo.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                            <ImageOff className="w-6 h-6 text-white/20" />
                                        </div>
                                    )}
                                    {loadingId === photo.id && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
