"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Save, X, GripVertical, FileText, UserCheck, UserX } from "lucide-react";
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
import { getPersonal, getPersonalAreas, createPersonalArea, togglePersonalActivo, updatePersonalArea } from "@/lib/caja-admin";
import { updateSucursalValoresHora } from "@/lib/caja-admin/services";
import { CajaAdminCategoria, Sucursal, Personal } from "@/lib/caja-admin/types";
import { useAuth } from "@/contexts/AuthContext";

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
    const { categoria } = useAuth();
    const canManageProviderStatus = categoria === "owner";
    const [categorias, setCategorias] = useState<CajaAdminCategoria[]>([]);
    const [providerConfigTab, setProviderConfigTab] = useState<"categorias" | "prestadores" | "tipos" | "valores-hora">("categorias");
    const [personal, setPersonal] = useState<Personal[]>([]);
    const [personalLoading, setPersonalLoading] = useState(true);
    const [personalError, setPersonalError] = useState<string | null>(null);
    const [updatingPersonalId, setUpdatingPersonalId] = useState<string | null>(null);
    const [areas, setAreas] = useState<Array<{ id: string; nombre: string; modelo_liquidacion: string; activo: boolean; orden: number }>>([]);
    const [areasLoading, setAreasLoading] = useState(true);
    const [newAreaName, setNewAreaName] = useState('');
    const [newAreaModelo, setNewAreaModelo] = useState<'horas' | 'mensual' | 'prestaciones'>('prestaciones');
    const [updatingAreaId, setUpdatingAreaId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editingItem, setEditingItem] = useState<Partial<CajaAdminCategoria>>({});
    const [error, setError] = useState<string | null>(null);

    // Valores Hora global states
    const [valorHoraStaff, setValorHoraStaff] = useState<number>(sucursal.valor_hora_staff_ars || 0);
    const [valorHoraLimpieza, setValorHoraLimpieza] = useState<number>(sucursal.valor_hora_limpieza_ars || 0);
    const [isSavingValoresHora, setIsSavingValoresHora] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    useEffect(() => {
        loadData();
        loadPersonal();
        loadAreas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sucursal.id]);

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

    function normalizeText(value?: string | null) {
        return (value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    function isProviderProfile(p: Personal) {
        const area = normalizeText(p.area);
        const rol = normalizeText(p.rol);
        const especialidad = normalizeText(p.especialidad);
        const tipo = normalizeText(p.tipo);

        const isBackoffice =
            rol.includes('owner')
            || rol.includes('admin')
            || area.includes('direccion')
            || area.includes('admin')
            || tipo === 'owner';

        if (isBackoffice) return false;

        if (p.tipo === "prestador" || p.tipo === "odontologo" || p.tipo === "profesional") return true;

        return (
            area.includes("odont")
            || area.includes("limpieza")
            || area.includes("laboratorio")
            || area.includes("staff general")
            || rol.includes("odont")
            || rol.includes("limpieza")
            || rol.includes("laboratorio")
            || especialidad.includes("odont")
        );
    }

    async function loadPersonal() {
        setPersonalLoading(true);
        setPersonalError(null);

        try {
            const data = await getPersonal({ includeInactive: true });
            setPersonal(data.filter(isProviderProfile));
        } catch {
            setPersonalError("Error al cargar prestadores");
        } finally {
            setPersonalLoading(false);
        }
    }

    async function loadAreas() {
        setAreasLoading(true);
        try {
            const data = await getPersonalAreas({ includeInactive: true });
            setAreas((data || []).map((item) => ({
                id: item.id,
                nombre: item.nombre,
                modelo_liquidacion: item.modelo_liquidacion || 'prestaciones',
                activo: item.activo,
                orden: item.orden,
            })));
        } finally {
            setAreasLoading(false);
        }
    }

    async function handleTogglePersonalActivo(p: Personal) {
        if (!canManageProviderStatus) return;

        const accion = p.activo ? "desactivar" : "reactivar";
        const confirmado = confirm(`¿Querés ${accion} a ${p.nombre} ${p.apellido || ""}?`);
        if (!confirmado) return;

        setUpdatingPersonalId(p.id);
        try {
            const result = await togglePersonalActivo(p.id, !p.activo);
            if (!result.success) {
                alert(result.error || "No se pudo actualizar el estado");
                return;
            }

            setPersonal((prev) => prev.map((item) => (
                item.id === p.id ? { ...item, activo: !p.activo } : item
            )));
        } finally {
            setUpdatingPersonalId(null);
        }
    }

    async function handleCreateArea() {
        const nombre = newAreaName.trim();
        if (!nombre) return;

        const result = await createPersonalArea({
            nombre,
            modelo_liquidacion: newAreaModelo,
            activo: true,
            orden: (areas.length + 1) * 10,
        });

        if (!result.success) {
            alert(result.error || 'No se pudo crear el tipo de prestador');
            return;
        }

        setNewAreaName('');
        await loadAreas();
    }

    async function handleToggleArea(areaId: string, activo: boolean) {
        setUpdatingAreaId(areaId);
        try {
            const result = await updatePersonalArea(areaId, { activo: !activo });
            if (!result.success) {
                alert(result.error || 'No se pudo actualizar el tipo de prestador');
                return;
            }

            setAreas((prev) => prev.map((item) => item.id === areaId ? { ...item, activo: !activo } : item));
        } finally {
            setUpdatingAreaId(null);
        }
    }

    async function handleSaveValoresHora() {
        if (!canManageProviderStatus) return;
        setIsSavingValoresHora(true);
        try {
            const res = await updateSucursalValoresHora(sucursal.id, {
                staff: valorHoraStaff,
                limpieza: valorHoraLimpieza
            });

            if (!res.success) {
                alert(res.error || 'No se pudieron actualizar los valores hora');
                return;
            }

            alert('Valores actualizados exitosamente en toda la sucursal y la base de personal.');
        } finally {
            setIsSavingValoresHora(false);
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

    const sortedPersonal = [...personal].sort((a, b) => {
        const aName = `${a.nombre || ""} ${a.apellido || ""}`.trim();
        const bName = `${b.nombre || ""} ${b.apellido || ""}`.trim();
        return aName.localeCompare(bName, "es", { sensitivity: "base" });
    });

    const activeProviders = sortedPersonal.filter((p) => p.activo);
    const inactiveProviders = sortedPersonal.filter((p) => !p.activo);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                <button
                    onClick={() => setProviderConfigTab("categorias")}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${providerConfigTab === "categorias"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-b-2 border-indigo-500"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                >
                    Categorías de Caja
                </button>
                <button
                    onClick={() => setProviderConfigTab("prestadores")}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${providerConfigTab === "prestadores"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-b-2 border-indigo-500"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                >
                    Activación Prestadores
                </button>
                <button
                    onClick={() => setProviderConfigTab("tipos")}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${providerConfigTab === "tipos"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-b-2 border-indigo-500"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                >
                    Tipos de Prestadores
                </button>
                <button
                    onClick={() => setProviderConfigTab("valores-hora")}
                    className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${providerConfigTab === "valores-hora"
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-b-2 border-indigo-500"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                >
                    Valores Hora Staff
                </button>
            </div>

            {providerConfigTab === "valores-hora" && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Valores por Hora Generales (ARS)</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Configurá acá los valores estándar por hora. Si guardás, todos los prestadores activos del tipo "Staff General", "Administración", "Recepción" o "Limpieza" que estén en modalidad por horas se actualizarán automáticamente.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Valor Hora - Staff General, Administración, Recepción (ARS)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={valorHoraStaff}
                                        onChange={(e) => setValorHoraStaff(Number(e.target.value))}
                                        className="pl-8 pr-4 py-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="Ej: 3500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Valor Hora - Limpieza (ARS)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={valorHoraLimpieza}
                                        onChange={(e) => setValorHoraLimpieza(Number(e.target.value))}
                                        className="pl-8 pr-4 py-2 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="Ej: 3000"
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    onClick={handleSaveValoresHora}
                                    disabled={!canManageProviderStatus || isSavingValoresHora}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save className="w-4 h-4" />
                                    {isSavingValoresHora ? 'Guardando y Sicronizando...' : 'Guardar y Aplicar a Todos'}
                                </button>
                                {!canManageProviderStatus && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center">
                                        Solo un Owner puede cambiar e impactar estos valores.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {providerConfigTab === "categorias" && (
                <>
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
                </>
            )}

            {providerConfigTab === "prestadores" && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Activación / desactivación de prestadores</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Útil para bajas por salida del equipo. Podés reactivar cuando vuelva a trabajar.
                        </p>
                        {!canManageProviderStatus && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                Solo el usuario owner puede cambiar estados. En este perfil es solo lectura.
                            </p>
                        )}
                    </div>

                    {personalLoading ? (
                        <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Cargando prestadores...</div>
                    ) : personalError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm dark:bg-red-900/20 dark:border-red-900/40 dark:text-red-300">
                            {personalError}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-green-200 dark:border-green-900/40 bg-white dark:bg-slate-900 p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                                        <UserCheck className="w-4 h-4" /> Activos
                                    </h3>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                        {activeProviders.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {activeProviders.length === 0 ? (
                                        <p className="text-sm text-slate-400">No hay prestadores activos.</p>
                                    ) : activeProviders.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{`${p.nombre} ${p.apellido || ""}`.trim()}</p>
                                                <p className="text-xs text-slate-500 truncate">{p.area || p.rol || "Sin área"}</p>
                                            </div>
                                            <button
                                                onClick={() => handleTogglePersonalActivo(p)}
                                                disabled={!canManageProviderStatus || updatingPersonalId === p.id}
                                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                                            >
                                                {updatingPersonalId === p.id ? "Actualizando..." : "Desactivar"}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                        <UserX className="w-4 h-4" /> Inactivos
                                    </h3>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                        {inactiveProviders.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {inactiveProviders.length === 0 ? (
                                        <p className="text-sm text-slate-400">No hay prestadores inactivos.</p>
                                    ) : inactiveProviders.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{`${p.nombre} ${p.apellido || ""}`.trim()}</p>
                                                <p className="text-xs text-slate-500 truncate">{p.area || p.rol || "Sin área"}</p>
                                            </div>
                                            <button
                                                onClick={() => handleTogglePersonalActivo(p)}
                                                disabled={!canManageProviderStatus || updatingPersonalId === p.id}
                                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                                            >
                                                {updatingPersonalId === p.id ? "Actualizando..." : "Reactivar"}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {providerConfigTab === "tipos" && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tipos de prestadores</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Agregá categorías libres como Contadores, Abogados, etc. para que aparezcan en el alta/edición de prestadores.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Nuevo tipo</h3>
                        <div className="flex flex-col md:flex-row gap-3">
                            <input
                                type="text"
                                value={newAreaName}
                                onChange={(event) => setNewAreaName(event.target.value)}
                                placeholder="Ej: Contadores"
                                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                            />
                            <div className="flex gap-2">
                                {([
                                    { value: 'prestaciones', label: 'Por prestación', icon: '📋' },
                                    { value: 'horas', label: 'Por hora', icon: '⏱' },
                                    { value: 'mensual', label: 'Mensual', icon: '📅' },
                                ] as const).map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setNewAreaModelo(opt.value)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${newAreaModelo === opt.value
                                            ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-400 text-indigo-700 dark:text-indigo-300'
                                            : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                            }`}
                                    >
                                        <span>{opt.icon}</span>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={handleCreateArea}
                            disabled={!newAreaName.trim()}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar tipo
                        </button>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                        {areasLoading ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-400">Cargando tipos...</div>
                        ) : areas.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-400">No hay tipos cargados.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Nombre</th>
                                        <th className="px-4 py-2 text-left">Liquidación</th>
                                        <th className="px-4 py-2 text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {areas
                                        .slice()
                                        .sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
                                        .map((item) => (
                                            <tr key={item.id} className="border-t border-slate-200 dark:border-slate-800">
                                                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{item.nombre}</td>
                                                <td className="px-4 py-2">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                                                        item.modelo_liquidacion === 'horas'
                                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                            : item.modelo_liquidacion === 'mensual'
                                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                    }`}>
                                                        {item.modelo_liquidacion === 'horas' ? '⏱ Por hora'
                                                            : item.modelo_liquidacion === 'mensual' ? '📅 Mensual'
                                                                : '📋 Por prestación'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <button
                                                        onClick={() => handleToggleArea(item.id, item.activo)}
                                                        disabled={updatingAreaId === item.id}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium ${item.activo
                                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'
                                                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                            } disabled:opacity-50`}
                                                    >
                                                        {updatingAreaId === item.id
                                                            ? 'Actualizando...'
                                                            : item.activo
                                                                ? 'Desactivar'
                                                                : 'Activar'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
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
