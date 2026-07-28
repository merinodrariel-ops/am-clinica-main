'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function CajaClient() {
    const router = useRouter();
    const { categoria } = useAuth();

    useEffect(() => {
        if (!categoria) return;
        const destination = ['owner', 'admin', 'developer'].includes(categoria)
            ? '/caja-admin'
            : '/caja-recepcion';
        router.replace(destination);
    }, [categoria, router]);

    return (
        <div className="min-h-[50vh] grid place-items-center text-slate-400">
            <div className="flex items-center gap-3">
                <Loader2 className="animate-spin" />
                Abriendo la caja correspondiente…
            </div>
        </div>
    );
}
