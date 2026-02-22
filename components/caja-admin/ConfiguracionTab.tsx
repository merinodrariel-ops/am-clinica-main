"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Save, X, GripVertical, FileText } from "lucide-react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

// ── Sortable row ────────────────────────────────────────────────────────────
function SortableRow({
    cat,
    onEdit,
    onDelete,
    onToggle,
}: {
    cat: CajaAdminCategoria;
    onEdit: (cat: CajaAdminCategoria) => void;
    onDelete: (id: string) => void;
    onToggle: (cat: CajaAdminCategoria) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: cat.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-150 select-none
                ${isDragging
                    ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 shadow-xl scale-[1.02] opacity-90"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
                }`}
        >
            {/* Drag handle */}
            <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors touch-none p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                tabIndex={-1}
            >
                <GripVertical className="w-4 h-4" />
            </button>

            {/* Nombre */}
            <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                {cat.nombre}
            </span>

            {/* Tipo badge */}
            <span className="hidden sm:inline-block px-2.5 py-1 rounded-md text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 shrink-0">
                {cat.tipo_movimiento}
            </span>

            {/* Adjunto badge */}
            {cat.requiere_adjunto && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                    <FileText className="w-3 h-3" /> Adjunto
                </span>
            )}

            {/* Toggle activo */}
            <button
                onClick={() => onToggle(cat)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200
                    ${cat.activo ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`}
            >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200
                    ${cat.activo ? "translate-x-2" : "-translate-x-2"}`}
                />
            </button>

            {/* Acciones */}
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => onEdit(cat)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-lg transition-colors"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    onClick={() => onDelete(cat.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function ConfiguracionTab({ sucursal }: Props) {
    const [categorias, setCategorias] = useState<CajaAdminCategoria[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editingItem, setEditingItem] = useState<Partial<CajaAdminCategoria>>({});
    const [error, setError] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    useEffect(() => { loadData(); }, [sucursal.id]);

    async function loadData() {
        setIsLoading(true);
        try {
            const data = await getCategorias(sucursal.id);
            setCategorias(data);
        } catch {
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
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error al guardar");
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("¿Eliminar categoría? Los movimientos existentes podrían perder su referencia.")) return;
        try {
            await deleteCategoria(id);
            await loadData();
        } catch (err: unknown) {
            alert("Error al eliminar: " + (err instanceof Error ? err.message : ""));
        }
    }

    async function toggleActivo(cat: CajaAdminCategoria) {
        try {
            await updateCategoria(cat.id, { activo: !cat.activo });
            setCategorias(prev => prev.map(c => c.id === cat.id ? { ...c, activo: !c.activo } : c));
        } catch {
            alert("Error al actualizar estado");
        }
    }

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = categorias.findIndex(c => c.id === active.id);
        const newIndex = categorias.findIndex(c => c.id === over.id);
        const reordered = arrayMove(categorias, oldIndex, newIndex);

        // Optimistic update
        setCategorias(reordered);

        // Persist new order to DB
        await Promise.all(
            reordered.map((cat, idx) =>
                updateCategoria(cat.id, { orden: (idx + 1) * 10 })
            )
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Categorías</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Arrastrá para reordenar · Tocá el toggle para activar/desactivar
                    </p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Nueva
                </button>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                    Cargando...
                </div>
            ) : categorias.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm gap-2">
                    <p>No hay categorías. Creá la primera.</p>
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={categorias.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-2">
                            {categorias.map(cat => (
                                <SortableRow
                                    key={cat.id}
                                    cat={cat}
                                    onEdit={(c) => { setEditingItem(c); setIsEditing(true); }}
                                    onDelete={handleDelete}
                                    onToggle={toggleActivo}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {/* Edit / Create modal */}
            {isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                {editingItem.id ? "Editar Categoría" : "Nueva Categoría"}
                            </h3>
                            <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-500">
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
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    value={editingItem.nombre || ""}
                                    onChange={(e) => setEditingItem({ ...editingItem, nombre: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Ej: Materiales Dentales"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo de Movimiento</label>
                                <select
                                    value={editingItem.tipo_movimiento || "EGRESO"}
                                    onChange={(e) => setEditingItem({ ...editingItem, tipo_movimiento: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="EGRESO">EGRESO (Gasto normal)</option>
                                    <option value="GIRO_ACTIVO">GIRO_ACTIVO (Deuda/Pagaré)</option>
                                    <option value="INGRESO_ADMIN">INGRESO ADMIN</option>
                                    <option value="OTRO">OTRO</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-3 pt-1">
                                <input
                                    type="checkbox"
                                    id="requiere_adjunto"
                                    checked={editingItem.requiere_adjunto || false}
                                    onChange={(e) => setEditingItem({ ...editingItem, requiere_adjunto: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                                />
                                <label htmlFor="requiere_adjunto" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Exigir comprobante adjunto
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-3 p-6 pt-0 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 mt-6">
                            <button
                                onClick={() => setIsEditing(false)}
                                className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 transition"
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
