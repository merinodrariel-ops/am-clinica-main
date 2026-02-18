'use client';

import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/Input";

interface CurrencyInputProps {
    value: number;
    onChange: (value: number) => void;
    currency?: string;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
}


export default function CurrencyInput({
    value,
    onChange,
    currency: _currency = 'ARS',
    className = '',
    placeholder = '0.00',
    disabled = false
}: CurrencyInputProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [localValue, setLocalValue] = useState('');

    const formattedValue = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);

    // Initial sync
    useEffect(() => {
        if (!isFocused) {
            // No need to setLocalValue here, render takes care of it via !isFocused check
        }
    }, [value, isFocused]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        // On focus, show raw value with comma as decimal (es-AR standard)
        // If 0, show empty to easy typing
        setLocalValue(value === 0 ? '' : value.toString().replace('.', ','));
        e.target.select();
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputVal = e.target.value;
        setLocalValue(inputVal);

        // Normalize: '1.234,56' or '1234,56' -> 1234.56
        // Remove dots (thousands separators)
        const normalized = inputVal.replace(/\./g, '').replace(',', '.');
        const num = parseFloat(normalized);
        onChange(isNaN(num) ? 0 : num);
    };

    return (
        <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none select-none z-10">
                $
            </span>
            <Input
                type="text"
                inputMode="decimal"
                disabled={disabled}
                className={`pl-7 pr-3 text-right tabular-nums ${className}`}
                placeholder={placeholder}
                value={isFocused ? localValue : (value === 0 ? '' : formattedValue)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onChange={handleChange}
            />
        </div>
    );
}
