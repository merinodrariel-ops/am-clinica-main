'use client';

import React, { useId, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { usePathname } from 'next/navigation';

// =============================================
// Types
// =============================================

interface SensitiveValueProps {
    /** The actual value to display when revealed */
    value: number | string;
    /** Format type for display */
    format?: 'currency' | 'currency-ars' | 'number' | 'text' | 'hours';
    /** Custom ID for tracking revealed state (auto-generated if not provided) */
    fieldId?: string;
    /** Override permission check */
    allowReveal?: boolean;
    /** Additional CSS classes */
    className?: string;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

// =============================================
// Formatters
// =============================================

function formatValue(value: number | string, format: SensitiveValueProps['format']): string {
    if (typeof value === 'string') return value;

    switch (format) {
        case 'currency':
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
            }).format(value);
        case 'currency-ars':
            return new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: 'ARS',
                minimumFractionDigits: 0,
            }).format(value);
        case 'number':
            return value.toLocaleString('es-AR');
        case 'hours':
            return `${value}h`;
        default:
            return String(value);
    }
}

function getMaskedValue(format: SensitiveValueProps['format']): string {
    switch (format) {
        case 'currency':
            return '$ *****';
        case 'currency-ars':
            return '$ *****';
        case 'number':
            return '*****';
        case 'hours':
            return '**h';
        default:
            return '********';
    }
}

// =============================================
// Component
// =============================================

export default function SensitiveValue({
    value,
    format = 'currency',
    fieldId,
    allowReveal,
    className = '',
    size = 'md',
}: SensitiveValueProps) {
    const autoId = useId();
    const id = fieldId || autoId;
    const pathname = usePathname();

    const {
        privacyMode,
        canRevealSensitive,
        isFieldRevealed,
        revealField,
        hideField,
        hideAllFields,
    } = usePrivacy();

    const isRevealed = isFieldRevealed(id);
    const canReveal = allowReveal !== undefined ? allowReveal : canRevealSensitive;
    const showValue = isRevealed && !privacyMode;

    // Hide all fields when route changes
    useEffect(() => {
        hideAllFields();
    }, [pathname, hideAllFields]);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!canReveal || privacyMode) return;

        if (isRevealed) {
            hideField(id);
        } else {
            revealField(id);
        }
    };

    // Size classes
    const sizeClasses = {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-lg',
        xl: 'text-2xl font-bold',
    };

    const iconSize = {
        sm: 12,
        md: 14,
        lg: 16,
        xl: 18,
    };

    return (
        <span
            className={`inline-flex items-center gap-1 font-mono ${sizeClasses[size]} ${className}`}
        >
            {showValue ? (
                <>
                    <span>{formatValue(value, format)}</span>
                    {canReveal && (
                        <button
                            onClick={handleClick}
                            className="text-slate-400 hover:text-slate-600 transition-colors ml-1"
                            title="Ocultar valor"
                            type="button"
                        >
                            <EyeOff size={iconSize[size]} />
                        </button>
                    )}
                </>
            ) : (
                <>
                    <span className="text-slate-400 select-none">{getMaskedValue(format)}</span>
                    {canReveal && !privacyMode && (
                        <button
                            onClick={handleClick}
                            className="text-slate-400 hover:text-indigo-600 transition-colors ml-1"
                            title="Revelar valor"
                            type="button"
                        >
                            <Eye size={iconSize[size]} />
                        </button>
                    )}
                </>
            )}
        </span>
    );
}

// =============================================
// Bulk Reveal Component
// =============================================

interface RevealAllButtonProps {
    className?: string;
}

export function RevealAllToggle({ className = '' }: RevealAllButtonProps) {
    const { canRevealSensitive, privacyMode } = usePrivacy();

    if (!canRevealSensitive || privacyMode) return null;

    return (
        <button
            className={`flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg transition-colors ${className}`}
        >
            <Eye size={14} />
            Mostrar valores
        </button>
    );
}
