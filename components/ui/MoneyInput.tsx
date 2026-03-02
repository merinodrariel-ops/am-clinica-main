'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/Input";
import clsx from 'clsx';

interface MoneyInputProps {
    value: number;
    onChange: (value: number) => void;
    currency?: string;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
    hideSymbol?: boolean;
    required?: boolean;
    autoFocus?: boolean;
}

/**
 * MoneyInput.tsx
 * A professional banking-style input for monetary values.
 * Features:
 * - Live es-AR formatting (Thousands: . , Decimals: ,)
 * - Cursor position preservation while typing.
 * - Auto-select on focus.
 * - Prevents magnitude errors.
 * - Emits raw numeric value.
 */
export default function MoneyInput({
    value,
    onChange,
    currency = 'ARS',
    className = '',
    placeholder = '0',
    disabled = false,
    hideSymbol = false,
    required = false,
    autoFocus = false
}: MoneyInputProps) {
    const [displayValue, setDisplayValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Helper to format a number string to es-AR style (1.234,56)
    // But we handle it manually to keep the "typing" experience (no auto .00)
    const formatLive = (val: string) => {
        // 1. Remove everything except digits and ONE comma
        let cleaned = val.replace(/[^\d,]/g, '');

        // Ensure only one comma
        const parts = cleaned.split(',');
        if (parts.length > 2) {
            cleaned = parts[0] + ',' + parts.slice(1).join('');
        }

        // Split integer and decimal parts
        const [integerPart, decimalPart] = cleaned.split(',');

        // Format integer part with dots
        // We don't want leading zeros unless it's just "0"
        let formattedInteger = integerPart.replace(/^0+/, '');
        if (formattedInteger === '' && (cleaned.startsWith('0') || cleaned.startsWith(','))) {
            formattedInteger = '0';
        } else if (formattedInteger === '' && cleaned === '') {
            return '';
        }

        // Add thousands separators (dots)
        formattedInteger = formattedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

        // Combine back
        return decimalPart !== undefined ? `${formattedInteger},${decimalPart}` : formattedInteger;
    };

    // Initial sync from prop value
    useEffect(() => {
        if (value === 0 && displayValue === '') return;

        // Check if the current displayValue, when parsed, matches the prop value
        const currentNumeric = parseFloat(displayValue.replace(/\./g, '').replace(',', '.') || '0');
        if (currentNumeric !== value) {
            const stringified = value.toString().replace('.', ',');
            setDisplayValue(formatLive(stringified));
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        const rawValue = input.value;
        const cursorPosition = input.selectionStart || 0;

        // Pre-formatting cleanup: count how many DIGITS are to the left of the cursor
        const digitsBeforeCursor = rawValue.substring(0, cursorPosition).replace(/[^\d,]/g, '').length;

        // Apply formatting
        const formatted = formatLive(rawValue);
        setDisplayValue(formatted);

        // Emit numeric value
        const numericValue = parseFloat(formatted.replace(/\./g, '').replace(',', '.') || '0');
        onChange(numericValue);

        // Caret Position Preservation
        // After React re-renders, we need to restore the cursor
        setTimeout(() => {
            if (!inputRef.current) return;

            let newCursorPos = 0;
            let digitsFound = 0;
            const val = inputRef.current.value;

            for (let i = 0; i < val.length; i++) {
                if (/[\d,]/.test(val[i])) {
                    digitsFound++;
                }
                newCursorPos = i + 1;
                if (digitsFound >= digitsBeforeCursor) break;
            }

            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        e.target.select();
    };

    return (
        <div className="relative w-full">
            {!hideSymbol && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium pointer-events-none select-none z-10">
                    $
                </span>
            )}
            <Input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                disabled={disabled}
                className={clsx(
                    "pr-3 text-right font-mono tabular-nums focus:ring-2 focus:ring-teal-500/30 transition-all",
                    !hideSymbol ? "pl-7" : "pl-3",
                    className
                )}
                placeholder={placeholder}
                value={displayValue}
                onChange={handleChange}
                onFocus={handleFocus}
                autoComplete="off"
                required={required}
                autoFocus={autoFocus}
            />
        </div>
    );
}
