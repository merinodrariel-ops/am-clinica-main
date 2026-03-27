'use client';

import { MODULE_DEFINITIONS, getCategoryDefault } from '@/lib/access-overrides';
import { Lock } from 'lucide-react';

type ModuleLevel = 'inherit' | 'none' | 'read' | 'edit';

interface UserPermissionsPanelProps {
    categoria: string;
    overrides: Record<string, string>;
    onChange: (overrides: Record<string, string>) => void;
}

const LEVEL_OPTIONS: { value: ModuleLevel; label: string }[] = [
    { value: 'inherit', label: 'Según su cargo' },
    { value: 'none',    label: 'Sin acceso' },
    { value: 'read',    label: 'Solo lectura' },
    { value: 'edit',    label: 'Completo' },
];

export default function UserPermissionsPanel({ categoria, overrides, onChange }: UserPermissionsPanelProps) {
    const handleChange = (key: string, value: ModuleLevel) => {
        const next = { ...overrides };
        if (value === 'inherit') {
            delete next[key];
        } else {
            next[key] = value;
        }
        onChange(next);
    };

    return (
        <div className="space-y-1">
            <div className="grid grid-cols-3 gap-2 px-2 pb-1 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                <span>Módulo</span>
                <span className="text-center">Acceso del rol</span>
                <span className="text-center">Override</span>
            </div>
            {MODULE_DEFINITIONS.map(mod => {
                const categoryDefault = getCategoryDefault(categoria, mod.key);
                const currentOverride = (overrides[mod.key] as ModuleLevel | undefined) || 'inherit';

                return (
                    <div key={mod.key} className="grid grid-cols-3 gap-2 items-center rounded-lg px-2 py-2 hover:bg-zinc-800/40">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-200">
                            {mod.financial && (
                                <Lock size={12} className="text-amber-400 flex-shrink-0" />
                            )}
                            <span>{mod.label}</span>
                        </div>

                        <div className="flex justify-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                categoryDefault === 'full'
                                    ? 'bg-emerald-900/50 text-emerald-400'
                                    : 'bg-zinc-700 text-zinc-400'
                            }`}>
                                {categoryDefault === 'full' ? 'Completo' : 'Sin acceso'}
                            </span>
                        </div>

                        <div className="flex justify-center">
                            <select
                                value={currentOverride}
                                onChange={e => handleChange(mod.key, e.target.value as ModuleLevel)}
                                className="text-xs bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-zinc-400"
                            >
                                {LEVEL_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                );
            })}
            <p className="text-xs text-zinc-500 pt-1 px-2">
                <Lock size={10} className="inline mr-1 text-amber-400" />
                Módulos financieros — acceso por defecto solo para owner/admin.
            </p>
        </div>
    );
}
