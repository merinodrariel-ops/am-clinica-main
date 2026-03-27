'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import MoneyInput from '@/components/ui/MoneyInput';
import {
    type PrestacionLista,
    getPrestacionesLista,
    createPrestacionListaItem
} from '@/lib/caja-admin-prestaciones';
import { toast } from 'sonner';
import { shouldSubmitOnEnter, useModalKeyboard } from '@/hooks/useModalKeyboard';

export default function PrestacionesTab() {
    const [prestaciones, setPrestaciones] = useState<PrestacionLista[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedArea, setSelectedArea] = useState('Todas');
    const [isCreating, setIsCreating] = useState(false);
    const [saving, setSaving] = useState(false);

    // New prestacion form
    const [nombre, setNombre] = useState('');
    const [precioBase, setPrecioBase] = useState<number>(0);
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [areaNombre, setAreaNombre] = useState('Odontología');
    const createFormRef = useRef<HTMLFormElement>(null);

    useModalKeyboard(isCreating, () => setIsCreating(false), () => createFormRef.current?.requestSubmit(), { disabled: saving });

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const data = await getPrestacionesLista();
            setPrestaciones(data);
        } catch (error) {
            toast.error('Error al cargar prestaciones');
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await createPrestacionListaItem({
                nombre,
                precio_base: precioBase,
                moneda,
                area_nombre: areaNombre
            });
            if (res.success) {
                toast.success('Prestación creada');
                setIsCreating(false);
                setNombre('');
                setPrecioBase(0);
                await loadData();
            } else {
                toast.error(res.error || 'Error al crear');
            }
        } catch (error) {
            toast.error('Ocurrió un error inesperado');
        } finally {
            setSaving(false);
        }
    }

    const areasUnicas = ['Todas', ...Array.from(new Set(prestaciones.map(p => p.area_nombre || 'Sin área').filter(Boolean)))];

    const areaCounts = areasUnicas.reduce<Record<string, number>>((acc, area) => {
        if (area === 'Todas') {
            acc[area] = prestaciones.length;
        } else {
            acc[area] = prestaciones.filter(p => (p.area_nombre || 'Sin área') === area).length;
        }
        return acc;
    }, {});

    const filteredPrestaciones = prestaciones.filter(p => {
        const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.area_nombre?.toLowerCase().includes(searchTerm.toLowerCase());
        const areaToMatch = p.area_nombre || 'Sin área';
        const matchesArea = selectedArea === 'Todas' || areaToMatch === selectedArea;
        return matchesSearch && matchesArea;
    });

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <Loader2 className="animate-spin w-8 h-8 text-indigo-500 mx-auto mb-4" />
                Cargando lista de prestaciones...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Lista de Prestaciones</h3>
                    <p className="text-sm text-slate-500">Administra las prestaciones y sus precios base.</p>
                </div>
                <Button onClick={() => setIsCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Prestación
                </Button>
            </div>

            <AnimatePresence>
                {isCreating && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6"
                    >
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Agregar Nueva Prestación</h4>
                        <form
                            ref={createFormRef}
                            onSubmit={handleCreate}
                            onKeyDown={(event) => {
                                if (saving || !shouldSubmitOnEnter(event.nativeEvent)) return;
                                event.preventDefault();
                                event.currentTarget.requestSubmit();
                            }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
                                <Input
                                    required
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
                                    placeholder="Ej: Extracción Simple"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Área / Categoría</label>
                                <Input
                                    value={areaNombre}
                                    onChange={(e) => setAreaNombre(e.target.value)}
                                    placeholder="Ej: Odontología"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Valor Base</label>
                                <MoneyInput
                                    value={precioBase}
                                    onChange={setPrecioBase}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Moneda</label>
                                <select
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white"
                                    value={moneda}
                                    onChange={(e) => setMoneda(e.target.value as 'ARS' | 'USD')}
                                >
                                    <option value="ARS">ARS ($)</option>
                                    <option value="USD">USD (USD)</option>
                                </select>
                            </div>
                            <div className="md:col-span-2 flex justify-end gap-2 mt-4">
                                <Button type="button" variant="ghost" onClick={() => setIsCreating(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={saving}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                    Guardar Prestación
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {areasUnicas.map((area) => {
                            const isCategoryActive = selectedArea === area;
                            return (
                                <Button
                                    key={area}
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setSelectedArea(area)}
                                    className={`h-auto rounded-lg px-3 py-1.5 text-sm transition-colors ${isCategoryActive
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    {area}
                                    <span
                                        className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${isCategoryActive
                                                ? 'bg-white/20 text-white'
                                                : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                            }`}
                                    >
                                        {areaCounts[area] || 0}
                                    </span>
                                </Button>
                            );
                        })}
                    </div>
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            className="pl-9"
                            placeholder="Buscar prestaciones..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-3">Nombre</th>
                                <th className="px-6 py-3">Área</th>
                                <th className="px-6 py-3">Precio Base</th>
                                <th className="px-6 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredPrestaciones.map(prestacion => (
                                <tr key={prestacion.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                        {prestacion.nombre}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">
                                        {prestacion.area_nombre || '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-900 dark:text-white">
                                            {prestacion.moneda} {prestacion.precio_base.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-indigo-600">
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredPrestaciones.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                        No se encontraron prestaciones.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
