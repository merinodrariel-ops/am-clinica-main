'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ArrowUpCircle, ArrowDownCircle, Loader2, Save, MessageSquare, Search, UserCheck } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import MoneyInput from '@/components/ui/MoneyInput';
import { createClient } from '@/utils/supabase/client';
import { registerInventoryIngress, registerInventoryEgress } from '@/app/actions/inventory-stock';

interface Item {
    id: string;
    nombre: string;
    stock_actual: number;
    unidad_medida: string;
}

interface PatientResult {
    id_paciente: string;
    nombre: string;
    apellido: string;
    documento: string | null;
}

interface MovimientoStockFormProps {
    isOpen: boolean;
    item: Item | null;
    tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    onClose: () => void;
    onSuccess: () => void;
}

export default function MovimientoStockForm({ isOpen, item, tipo, onClose, onSuccess }: MovimientoStockFormProps) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [cantidad, setCantidad] = useState(0);
    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Patient autocomplete (SALIDA only)
    const [patientQuery, setPatientQuery] = useState('');
    const [patientResults, setPatientResults] = useState<PatientResult[]>([]);
    const [patientSearching, setPatientSearching] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
    const patientDropdownRef = useRef<HTMLDivElement>(null);

    // Debounced patient search
    useEffect(() => {
        if (tipo !== 'SALIDA' || selectedPatient || patientQuery.length < 2) {
            setPatientResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setPatientSearching(true);
            try {
                const supabase = createClient();
                const { data } = await supabase
                    .from('pacientes')
                    .select('id_paciente, nombre, apellido, documento')
                    .eq('is_deleted', false)
                    .or(`nombre.ilike.%${patientQuery}%,apellido.ilike.%${patientQuery}%,documento.ilike.%${patientQuery}%`)
                    .order('apellido', { ascending: true })
                    .limit(8);
                setPatientResults(data || []);
            } finally {
                setPatientSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [patientQuery, selectedPatient, tipo]);

    // Reset patient state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedPatient(null);
            setPatientQuery('');
            setPatientResults([]);
        }
    }, [isOpen]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!item || cantidad <= 0) return;

        if (!user) {
            setError("No estás autenticado");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            if (tipo === 'ENTRADA') {
                const result = await registerInventoryIngress({
                    productId: item.id,
                    qty: cantidad,
                    note: motivo || 'Carga de stock',
                });
                if (!result.success) throw new Error(result.error);
            } else {
                const result = await registerInventoryEgress({
                    productId: item.id,
                    qty: cantidad,
                    note: motivo || 'Consumo / Salida',
                    pacienteId: selectedPatient?.id_paciente,
                    pacienteNombre: selectedPatient ? `${selectedPatient.apellido}, ${selectedPatient.nombre}` : undefined,
                });
                if (!result.success) throw new Error(result.error);
            }

            onSuccess();
            onClose();
            setCantidad(0);
            setMotivo('');
            setSelectedPatient(null);
            setPatientQuery('');
        } catch (error: unknown) {
            console.error('Error saving movement:', error);
            const message = error instanceof Error ? error.message : 'Error al registrar el movimiento';
            setError(message);
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen || !item) return null;

    const isEntrada = tipo === 'ENTRADA';
    const isSalida = tipo === 'SALIDA';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className={clsx(
                    "px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center",
                    isEntrada ? "bg-emerald-50/50 dark:bg-emerald-900/10" : isSalida ? "bg-red-50/50 dark:bg-red-900/10" : "bg-blue-50/50 dark:bg-blue-900/10"
                )}>
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "h-10 w-10 rounded-xl flex items-center justify-center",
                            isEntrada ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" : isSalida ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                        )}>
                            {isEntrada ? <ArrowUpCircle size={20} /> : isSalida ? <ArrowDownCircle size={20} /> : <Save size={20} />}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">
                                {isEntrada ? 'Ingreso de Stock' : isSalida ? 'Salida / Consumo' : 'Ajuste de Stock'}
                            </h3>
                            <p className="text-xs text-gray-500 uppercase font-medium">{item.nombre}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                            <span className="text-xl">⚠️</span> {error}
                        </div>
                    )}
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 font-bold uppercase mb-1">Stock Actual</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">
                            {item.stock_actual} <span className="text-sm font-medium text-gray-500">{item.unidad_medida}</span>
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                            Cantidad a {isEntrada ? 'ingresar' : isSalida ? 'retirar' : 'ajustar'} ({item.unidad_medida}) *
                        </label>
                        <MoneyInput
                            value={cantidad}
                            onChange={(val) => setCantidad(val)}
                            hideSymbol
                            required
                            autoFocus
                            placeholder="0"
                            className={clsx(
                                "w-full text-2xl font-black rounded-2xl outline-none transition-all border",
                                isEntrada ? "focus:ring-2 focus:ring-emerald-500 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" :
                                    isSalida ? "focus:ring-2 focus:ring-red-500 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" :
                                        "focus:ring-2 focus:ring-blue-500 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                            )}
                        />
                    </div>

                    {/* Patient association — SALIDA only */}
                    {isSalida && (
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                Paciente <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                            </label>
                            <div className="relative" ref={patientDropdownRef}>
                                {selectedPatient ? (
                                    <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                                        <UserCheck size={18} className="text-red-500 shrink-0" />
                                        <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200">
                                            {selectedPatient.apellido}, {selectedPatient.nombre}
                                            {selectedPatient.documento && (
                                                <span className="ml-2 text-xs text-gray-500">DNI {selectedPatient.documento}</span>
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedPatient(null); setPatientQuery(''); }}
                                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                                        >
                                            <X size={14} className="text-red-400" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            value={patientQuery}
                                            onChange={(e) => setPatientQuery(e.target.value)}
                                            placeholder="Buscar por nombre o DNI..."
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-all text-sm"
                                        />
                                        {patientSearching && (
                                            <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 flex justify-center z-20">
                                                <Loader2 className="animate-spin text-red-500" size={18} />
                                            </div>
                                        )}
                                        {patientResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-150">
                                                {patientResults.map((p) => (
                                                    <button
                                                        key={p.id_paciente}
                                                        type="button"
                                                        onClick={() => { setSelectedPatient(p); setPatientQuery(''); setPatientResults([]); }}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0"
                                                    >
                                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                                            {p.apellido}, {p.nombre}
                                                        </p>
                                                        {p.documento && (
                                                            <p className="text-xs text-gray-500">DNI {p.documento}</p>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Motivo / Nota</label>
                        <div className="relative">
                            <MessageSquare className="absolute left-3 top-3 text-gray-400" size={18} />
                            <textarea
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-20"
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                placeholder="Ej: Compra mensual, Uso en cirugía, vencimiento..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || cantidad <= 0}
                            className={clsx(
                                "flex-3 py-3.5 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all",
                                isEntrada ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" :
                                    isSalida ? "bg-red-600 hover:bg-red-700 shadow-red-100" :
                                        "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                            )}
                        >
                            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            Confirmar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
