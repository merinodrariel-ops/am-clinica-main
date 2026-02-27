'use client';

import { useState } from 'react';
import { Upload, Loader2, FileCheck2, ExternalLink } from 'lucide-react';
import { uploadWorkerDocument } from '@/app/actions/worker-portal';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface StaffDocumentUploaderProps {
    workerId: string;
    docKey: string;
    docLabel: string;
    existingUrl?: string | null;
}

export default function StaffDocumentUploader({ workerId, docKey, docLabel, existingUrl }: StaffDocumentUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const router = useRouter();

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const result = await uploadWorkerDocument(workerId, file, docKey);
            if (result.success) {
                toast.success(`${docLabel} subido correctamente`);
                router.refresh(); // Refresh the page to show the new document status
            }
        } catch (error) {
            console.error('Error uploading doc:', error);
            toast.error(`Error al subir ${docLabel}`);
        } finally {
            setUploading(false);
            // reset input
            e.target.value = '';
        }
    };

    return (
        <label className={`relative flex items-center justify-center rounded-lg transition-all cursor-pointer ${existingUrl ? 'p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800' : 'p-1.5 px-3 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20'}`}>
            {uploading ? <Loader2 size={16} className="animate-spin" /> : (
                <>
                    <Upload size={16} />
                    {!existingUrl && <span className="ml-2 text-xs font-bold">Subir</span>}
                </>
            )}
            <input
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                onChange={handleUpload}
                disabled={uploading}
            />
        </label>
    );
}
