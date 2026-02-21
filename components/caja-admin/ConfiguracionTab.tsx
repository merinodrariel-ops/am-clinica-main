"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Pencil, Trash2, Save, X, GripVertical, FileText } from "lucide-react";
import {
    getCategorias,
    createCategoria,
    updateCategoria,
    deleteCategoria
} from "@/lib/caja-admin/services";
import { CajaAdminCategoria, Sucursal } from "@/lib/caja-admin/types";

interface Props {
    sucursal: Sucursal;
}

export default function ConfiguracionTab({ sucursal }: Props) {
    const [categorias, setCategorias] = useState<CajaAdminCategoria[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal / Form state
    const [isEditing, setIsEditing] = useState(false);
    const [editingItem, setEditingItem] = useState<Partial<CajaAdminCategoria>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [sucursal.id]);

    async function loadData() {
        setIsLoading(true);
        try {
            const data = await getCategorias(sucursal.id);
            setCategorias(data);
        } catch (e: any) {
            console.error(e);
            setError("Error al cargar categorías");
        } finally {
            setIsLoading(false);
        }
    }

    function handleAdd() {
        setEditingItem({
            sucursal_id: sucursal.id,
            nombre: "",
            tipo_movimiento: "EGRESO",
            requiere_adjunto: false,
            activo: true,
            orden: (categorias.length + 1) * 10,
        });
        setIsEditing(true);
    }

    function handleEdit(cat: CajaAdminCategoria) {
        setEditingItem(cat);
        setIsEditing(true);
    }

    async function handleSave() {
        if (!editingItem.nombre) return;
        setError(null);
        try {
            if (editingItem.id) {
                await updateCategoria(editingItem.id, editingItem);
            } else {
                await createCategoria(editingItem);
            }
            setIsEditing(false);
            setEditingItem({});
            await loadData();
        } catch (err: any) {
            setError(err.message || "Error al guardar la categoría");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("¿Eliminar categoría? Los movimientos existentes con esta categoría podrían perder su referencia exacta.")) return;
        try {
            await deleteCategoria(id);
            await loadData();
        } catch (err: any) {
            alert("Error al eliminar: " + err.message);
        }
    }

    async function toggleActivo(cat: CajaAdminCategoria) {
        try {
            await updateCategoria(cat.id, { activo: !cat.activo });
            await loadData();
        } catch (err: any) {
            alert("Error al actualizar estado");
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Categorías de Egresos</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Administrá las opciones del selector de gastos, giros y sus requisitos.
                    </p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nueva Categoría
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 justify-center">Orden</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400">¿Adjunto Obligatorio?</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400">Estado</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">Cargando...</td>
                            </tr>
                        ) : categorias.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-slate-500 text-sm">
                                    No hay categorías configuradas. Por favor agregue una o aplique la migración base.
                                </td>
                            </tr>
                        ) : (
                            categorias.map((cat) => (
                                <tr key={cat.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-center">
                                        {cat.orden}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                                        {cat.nombre}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                                        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-slate-100 dark:bg-slate-700">
                                            {cat.tipo_movimiento}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {cat.requiere_adjunto ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                <FileText className="w-3.5 h-3.5" /> Sí
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <button
                                            onClick={() => toggleActivo(cat)}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none transition-colors duration-200 ease-in-out ${cat.activo ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${cat.activo ? 'translate-x-2' : '-translate-x-2'
                                                    }`}
                                            />
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleEdit(cat)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-lg transition-colors"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cat.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                {editingItem.id ? "Editar Categoría" : "Nueva Categoría"}
                            </h3>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="text-slate-400 hover:text-slate-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900/50">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Nombre
                                </label>
                                <input
                                    type="text"
                                    value={editingItem.nombre || ""}
                                    onChange={(e) => setEditingItem({ ...editingItem, nombre: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Ej: Materiales Dentales"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Tipo de Movimiento Asociado
                                </label>
                                <select
                                    value={editingItem.tipo_movimiento || "EGRESO"}
                                    onChange={(e) => setEditingItem({ ...editingItem, tipo_movimiento: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="EGRESO">EGRESO (Gasto normal)</option>
                                    <option value="GIRO_ACTIVO">GIRO_ACTIVO (Deuda/Pagaré)</option>
                                    <option value="INGRESO_ADMIN">INGRESO ADMIN</option>
                                    <option value="OTRO">OTRO</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Orden de Aparición
                                </label>
                                <input
                                    type="number"
                                    value={editingItem.orden || 0}
                                    onChange={(e) => setEditingItem({ ...editingItem, orden: Number(e.target.value) })}
                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500"
                                    min="0"
                                />
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <input
                                    type="checkbox"
                                    id="requiere_adjunto"
                                    checked={editingItem.requiere_adjunto || false}
                                    onChange={(e) => setEditingItem({ ...editingItem, requiere_adjunto: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                                />
                                <label htmlFor="requiere_adjunto" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Exigir comprobante adjunto al seleccionar
                                </label>
                            </div>

                        </div>

                        <div className="flex gap-3 p-6 pt-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 mt-6">
                            <button
                                onClick={() => setIsEditing(false)}
                                className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!editingItem.nombre}
                                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition disabled:opacity-50 flex justify-center items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
