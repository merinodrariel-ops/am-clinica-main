'use client';

import { useState } from 'react';
import { refreshSignedUrl } from '@/lib/supabase-storage';
import { FileText, Loader2 } from 'lucide-react';

type Area = 'caja-recepcion' | 'caja-admin';

interface ComprobanteLinkProps {
    storedValue: string;  // puede ser URL firmada (expirada o no) o path directo
    area: Area;
    className?: string;
    iconSize?: number;
    label?: string;
    showLabel?: boolean;
}

/**
 * Botón que regenera la URL firmada de Supabase Storage antes de abrir el comprobante.
 * Resuelve el error 400 "InvalidJWT exp claim timestamp check failed" causado
 * por URLs firmadas expiradas guardadas en la base de datos.
 */
export function ComprobanteLink({
    storedValue,
    area,
    className = '',
    iconSize = 16,
    label = 'Ver comprobante',
    showLabel = false,
}: ComprobanteLinkProps) {
    const [loading, setLoading] = useState(false);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setLoading(true);
        try {
            const freshUrl = await refreshSignedUrl(storedValue, area);
            if (freshUrl) {
                window.open(freshUrl, '_blank', 'noopener,noreferrer');
            } else {
                alert('No se pudo abrir el comprobante. El archivo puede haber sido eliminado.');
            }
        } catch {
            alert('Error al obtener el comprobante.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait ${className}`}
            title={label}
        >
            {loading
                ? <Loader2 size={iconSize} className="animate-spin" />
                : <FileText size={iconSize} />
            }
            {showLabel && <span>{loading ? 'Abriendo...' : label}</span>}
        </button>
    );
}
