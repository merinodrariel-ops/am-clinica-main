'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    Calendar,
    Clock,
    Check,
    X,
    DollarSign,
    User,
    AlertTriangle,
    Users,
    Stethoscope,
    Mail,
    Phone,
    MapPin,
    FileText,
    Shield,
    Pencil,
    Eye,
    UserPlus,
    Search,
    Building2,
    BadgeCheck,
    ChevronDown
} from 'lucide-react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import { Textarea } from "@/components/ui/Textarea";
import {
    type Sucursal,
    type Personal,
    type PersonalArea,
    type RegistroHoras,
    type LiquidacionMensual,
    getPersonal,
    getPersonalAreas,
    getRegistroHoras,
    getLiquidaciones,
    registrarHoras,
    generarLiquidacion,
    countObservadosPendientes,
    createPersonal,
    updatePersonal,
    type CreatePersonalInput
} from '@/lib/caja-admin';
import {
    type PrestacionLista,
    type PrestacionRealizada,
    getPrestacionesLista,
    registrarPrestacionRealizada,
    createPrestacionListaItem,
    getPrestacionesRealizadas,
    generarLiquidacionProfesional
} from '@/lib/caja-admin-prestaciones';
import ObservadosTab from './ObservadosTab';
import SensitiveValue from '@/components/ui/SensitiveValue';

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
    initialTab?: MainTab;
    initialObservedPersonalId?: string;
}

type MainTab = 'equipo' | 'profesionales' | 'registros' | 'observados';

const CONDICION_AFIP_OPTIONS = [
    { value: 'monotributista', label: 'Monotributista' },
    { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { value: 'relacion_dependencia', label: 'Relación de Dependencia' },
    { value: 'otro', label: 'Otro' },
];

export default function PersonalTab({ tcBna, initialTab, initialObservedPersonalId }: Props) {
    const [activeTab, setActiveTab] = useState<MainTab>(initialTab || 'equipo');
    const [observadosCount, setObservadosCount] = useState(0);
    const [personal, setPersonal] = useState<Personal[]>([]);
    const [personalAreas, setPersonalAreas] = useState<PersonalArea[]>([]);
    const [registros, setRegistros] = useState<RegistroHoras[]>([]);
    const [liquidaciones, setLiquidaciones] = useState<LiquidacionMensual[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showHorasForm, setShowHorasForm] = useState(false);
    const [editingPersonal, setEditingPersonal] = useState<Personal | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [mesActual, setMesActual] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Prestaciones state
    const [prestacionesLista, setPrestacionesLista] = useState<PrestacionLista[]>([]);
    const [prestacionesMes, setPrestacionesMes] = useState<PrestacionRealizada[]>([]);
    const [showPrestacionForm, setShowPrestacionForm] = useState(false);
    const [selectedProfesionalId, setSelectedProfesionalId] = useState<string | null>(null);
    const [prestacionForm, setPrestacionForm] = useState({
        prestacion_id: '',
        prestacion_nombre_manual: '',
        paciente_nombre: '',
        valor_cobrado: 0,
        moneda: 'ARS' as 'ARS' | 'USD',
        notas: '',
        guardar_en_tarifario: false,
        recalcular_liquidacion: true,
    });

    // Form state for new/edit personal
    const [formData, setFormData] = useState<CreatePersonalInput>({
        nombre: '',
        apellido: '',
        tipo: 'prestador',
        area: '',
        email: '',
        whatsapp: '',
        documento: '',
        direccion: '',
        barrio_localidad: '',
        condicion_afip: undefined,
        valor_hora_ars: 0,
        descripcion: '',
    });

    // Hours form state
    const [horasForm, setHorasForm] = useState({
        personal_id: '',
        fecha: new Date().toISOString().split('T')[0],
        horas: 0,
        observaciones: '',
    });
    const [submitting, setSubmitting] = useState(false);

    async function loadData() {
        setLoading(true);
        const [personalData, areasData, registrosData, liquidacionesData, obsCount, prestacionesData, prestacionesMesData] = await Promise.all([
            getPersonal(),
            getPersonalAreas(),
            getRegistroHoras({ mes: mesActual }),
            getLiquidaciones({ mes: mesActual }),
            countObservadosPendientes(mesActual),
            getPrestacionesLista(),
            getPrestacionesRealizadas({ mes: mesActual })
        ]);
        setPersonal(personalData);
        setPersonalAreas(areasData);
        setRegistros(registrosData);
        setLiquidaciones(liquidacionesData);
        setObservadosCount(obsCount);
        setPrestacionesLista(prestacionesData);
        setPrestacionesMes(prestacionesMesData);


        if (personalData.length > 0) {
            setHorasForm(f => ({ ...f, personal_id: personalData[0].id }));
        }

        setLoading(false);
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mesActual]);

    useEffect(() => {
        if (!initialTab) return;
        setActiveTab(initialTab);
    }, [initialTab]);

    function openNewPersonalForm(tipo: 'prestador' | 'profesional') {
        setEditingPersonal(null);
        setFormData({
            nombre: '',
            apellido: '',
            tipo,
            area: '',
            email: '',
            whatsapp: '',
            documento: '',
            direccion: '',
            barrio_localidad: '',
            condicion_afip: undefined,
            valor_hora_ars: 0,
            descripcion: '',
        });
        setShowForm(true);
    }

    function openEditForm(p: Personal) {
        setEditingPersonal(p);
        setFormData({
            nombre: p.nombre,
            apellido: p.apellido || '',
            tipo: p.tipo,
            area: p.area,
            email: p.email || '',
            whatsapp: p.whatsapp || '',
            documento: p.documento || '',
            direccion: p.direccion || '',
            barrio_localidad: p.barrio_localidad || '',
            condicion_afip: p.condicion_afip,
            valor_hora_ars: p.valor_hora_ars,
            descripcion: p.descripcion || '',
            matricula_provincial: p.matricula_provincial || '',
            especialidad: p.especialidad || '',
            porcentaje_honorarios: p.porcentaje_honorarios || 0,
        });
        setShowForm(true);
    }

    function openPrestacionForm(profesionalId: string) {
        setSelectedProfesionalId(profesionalId);
        setPrestacionForm({
            paciente_nombre: '',
            prestacion_id: '',
            prestacion_nombre_manual: '',
            valor_cobrado: 0,
            moneda: 'ARS',
            notas: '',
            guardar_en_tarifario: prestacionesLista.length === 0,
            recalcular_liquidacion: true,
        });
        setShowPrestacionForm(true);
    }

    async function handleSubmitPersonal() {
        if (!formData.nombre || !formData.area) {
            alert('Por favor complete nombre y área');
            return;
        }

        setSubmitting(true);
        try {
            if (editingPersonal) {
                // Cast to Partial<Personal> for update compatibility
                await updatePersonal(editingPersonal.id, formData as unknown as Parameters<typeof updatePersonal>[1]);
            } else {
                await createPersonal(formData);
            }
            setShowForm(false);
            setEditingPersonal(null);
            loadData();
        } catch (error) {
            console.error('Error saving personal:', error);
            alert('Error al guardar');
        }
        setSubmitting(false);
    }

    async function handleRegistrarHoras() {
        if (!horasForm.personal_id || horasForm.horas <= 0) return;

        setSubmitting(true);
        await registrarHoras(
            horasForm.personal_id,
            horasForm.fecha,
            horasForm.horas,
            horasForm.observaciones || undefined
        );
        setSubmitting(false);
        setShowHorasForm(false);
        setHorasForm({
            personal_id: personal[0]?.id || '',
            fecha: new Date().toISOString().split('T')[0],
            horas: 0,
            observaciones: '',
        });
        loadData();
    }

    async function handleRegistrarPrestacion() {
        if (!selectedProfesionalId) return;

        const hasCatalogSelection = Boolean(prestacionForm.prestacion_id);
        const manualName = prestacionForm.prestacion_nombre_manual.trim();
        if (!hasCatalogSelection && !manualName) {
            alert('Seleccioná una prestación del tarifario o cargá el nombre manual.');
            return;
        }

        if (prestacionForm.valor_cobrado <= 0) {
            alert('Ingresá un valor cobrado mayor a 0.');
            return;
        }

        setSubmitting(true);

        const prestacion = hasCatalogSelection
            ? prestacionesLista.find(p => p.id === prestacionForm.prestacion_id)
            : null;
        const profesional = personal.find(p => p.id === selectedProfesionalId);

        if (!profesional) {
            setSubmitting(false);
            return;
        }

        const porcentaje = profesional.porcentaje_honorarios || 0;
        const honorarios = (prestacionForm.valor_cobrado * porcentaje) / 100;
        const finalPrestacionNombre = prestacion?.nombre || manualName;

        const { error } = await registrarPrestacionRealizada({
            profesional_id: selectedProfesionalId,
            paciente_nombre: prestacionForm.paciente_nombre,
            prestacion_id: hasCatalogSelection ? prestacionForm.prestacion_id : undefined,
            prestacion_nombre: finalPrestacionNombre,
            fecha_realizacion: new Date().toISOString(),
            valor_cobrado: prestacionForm.valor_cobrado,
            moneda_cobro: prestacionForm.moneda,
            porcentaje_honorarios: porcentaje,
            monto_honorarios: honorarios,
            estado_pago: 'pendiente',
            notas: prestacionForm.notas,
        });

        if (error) {
            alert('Error: ' + error);
        } else {
            if (!hasCatalogSelection && prestacionForm.guardar_en_tarifario) {
                const areaNombre = profesional.area || 'General';
                const alreadyExists = prestacionesLista.some((item) =>
                    item.nombre.trim().toLowerCase() === finalPrestacionNombre.trim().toLowerCase()
                    && (item.area_nombre || '').trim().toLowerCase() === areaNombre.trim().toLowerCase()
                    && item.moneda === prestacionForm.moneda
                );

                if (!alreadyExists) {
                    const created = await createPrestacionListaItem({
                        nombre: finalPrestacionNombre,
                        area_nombre: areaNombre,
                        precio_base: prestacionForm.valor_cobrado,
                        moneda: prestacionForm.moneda,
                    });

                    if (created.success && created.data) {
                        setPrestacionesLista((prev) => [...prev, created.data!]);
                    }
                }
            }

            if (prestacionForm.recalcular_liquidacion) {
                const prestacionesActualizadas = await getPrestacionesRealizadas({
                    profesionalId: selectedProfesionalId,
                    mes: mesActual,
                });

                const liqResult = await generarLiquidacionProfesional(
                    selectedProfesionalId,
                    mesActual,
                    prestacionesActualizadas
                );

                if (!liqResult.success) {
                    alert(`Prestación guardada, pero no se pudo recalcular liquidación: ${liqResult.error || 'error desconocido'}`);
                }
            }

            setShowPrestacionForm(false);
            setPrestacionForm({
                paciente_nombre: '',
                prestacion_id: '',
                prestacion_nombre_manual: '',
                valor_cobrado: 0,
                moneda: 'ARS',
                notas: '',
                guardar_en_tarifario: false,
                recalcular_liquidacion: true,
            });
            loadData();
        }
        setSubmitting(false);
    }

    function getCriticalObservadosCount(personalId: string): number {
        const criticalThreshold = Date.now() - 48 * 60 * 60 * 1000;

        return registros.filter((reg) => {
            if (reg.personal_id !== personalId) return false;
            if (String(reg.estado || '').toLowerCase() !== 'observado') return false;

            const parsed = new Date(reg.created_at || reg.fecha);
            const createdAtMs = Number.isNaN(parsed.getTime())
                ? new Date(`${reg.fecha}T00:00:00`).getTime()
                : parsed.getTime();

            return createdAtMs <= criticalThreshold;
        }).length;
    }

    async function handleGenerarLiquidacion(personalId: string) {
        const criticalCount = getCriticalObservadosCount(personalId);
        if (criticalCount > 0) {
            alert(`No se puede generar la liquidación: hay ${criticalCount} observado(s) crítico(s) sin resolver.`);
            setActiveTab('observados');
            return;
        }

        setSubmitting(true);
        const p = personal.find(pers => pers.id === personalId);

        if (p?.tipo === 'profesional') {
            const prestacionesProfe = prestacionesMes.filter(pr => pr.profesional_id === personalId);
            const { error } = await generarLiquidacionProfesional(personalId, mesActual, prestacionesProfe);
            if (error) {
                console.error('Error generando liquidación profesional:', error);
                alert('Error al generar liquidación: ' + error);
            }
        } else {
            await generarLiquidacion(personalId, mesActual, tcBna || undefined);
        }

        setSubmitting(false);
        loadData();
    }

    // Filter personal by type and search
    const prestadores = personal.filter(p => p.tipo === 'prestador' || !p.tipo);
    const profesionales = personal.filter(p => p.tipo === 'profesional');

    const filteredPrestadores = prestadores.filter(p =>
        searchTerm === '' ||
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.apellido?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.area?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredProfesionales = profesionales.filter(p =>
        searchTerm === '' ||
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.apellido?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.especialidad?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedProfesional = selectedProfesionalId
        ? personal.find((p) => p.id === selectedProfesionalId)
        : null;

    const recentPrestaciones = selectedProfesionalId
        ? Array.from(new Set(
            prestacionesMes
                .filter((pr) => pr.profesional_id === selectedProfesionalId)
                .map((pr) => pr.prestacion_nombre)
                .filter(Boolean)
        )).slice(0, 8)
        : [];

    // Get areas by type for form
    const areasForType = personalAreas.filter(a =>
        a.tipo_personal === formData.tipo || a.tipo_personal === 'ambos'
    );

    // Calculate hours per person
    const horasPorPersona = personal.map(p => {
        const regs = registros.filter(r => r.personal_id === p.id);
        const totalHoras = regs.reduce((sum, r) => sum + r.horas, 0);
        const liquidacion = liquidaciones.find(l => l.personal_id === p.id);
        return {
            personal: p,
            registros: regs,
            totalHoras,
            liquidacion,
        };
    });

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                Cargando personal...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Tabs */}
            <div className="flex flex-col gap-4">
                {/* Main Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                    <Button
                        variant="ghost"
                        onClick={() => setActiveTab('equipo')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors h-auto ${activeTab === 'equipo'
                            ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500 rounded-b-none'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-none'
                            }`}
                    >
                        <Users className="w-4 h-4" />
                        Staff General
                        <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full ml-2">
                            {prestadores.length}
                        </span>
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setActiveTab('profesionales')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors h-auto ${activeTab === 'profesionales'
                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-b-2 border-emerald-500 rounded-b-none'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-none'
                            }`}
                    >
                        <Stethoscope className="w-4 h-4" />
                        Profesionales
                        <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full ml-2">
                            {profesionales.length}
                        </span>
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setActiveTab('registros')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors h-auto ${activeTab === 'registros'
                            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-b-2 border-purple-500 rounded-b-none'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-none'
                            }`}
                    >
                        <Clock className="w-4 h-4" />
                        Horas & Liquidaciones
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setActiveTab('observados')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors h-auto ${activeTab === 'observados'
                            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-b-2 border-amber-500 rounded-b-none'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-none'
                            }`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                        Observados
                        {observadosCount > 0 && (
                            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-amber-500 rounded-full ml-2">
                                {observadosCount}
                            </span>
                        )}
                    </Button>
                </div>

                {/* Search and Actions */}
                {(activeTab === 'equipo' || activeTab === 'profesionales') && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700 flex-1 max-w-md">
                            <Search className="w-5 h-5 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Buscar personal..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-transparent border-none outline-none text-sm flex-1 focus-visible:ring-0 shadow-none h-auto p-0"
                            />
                        </div>
                        <Button
                            onClick={() => openNewPersonalForm(activeTab === 'profesionales' ? 'profesional' : 'prestador')}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:opacity-90 transition-opacity"
                        >
                            <UserPlus className="w-5 h-5" />
                            {activeTab === 'profesionales' ? 'Nuevo Profesional' : 'Nuevo Prestador'}
                        </Button>
                    </div>
                )}

                {activeTab === 'registros' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-500 pointer-events-none" />
                            <Input
                                type="month"
                                value={mesActual}
                                onChange={(e) => setMesActual(e.target.value)}
                                className="pl-10 h-10 w-full rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm focus-visible:ring-indigo-500"
                            />
                        </div>
                        <Button
                            onClick={() => setShowHorasForm(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:opacity-90 transition-opacity"
                        >
                            <Plus className="w-5 h-5" />
                            Registrar Horas
                        </Button>
                    </div>
                )}
            </div>

            {/* New/Edit Personal Form Modal */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Form Header */}
                            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl ${formData.tipo === 'profesional'
                                        ? 'bg-emerald-100 dark:bg-emerald-900/50'
                                        : 'bg-indigo-100 dark:bg-indigo-900/50'
                                        }`}>
                                        {formData.tipo === 'profesional'
                                            ? <Stethoscope className="w-5 h-5 text-emerald-600" />
                                            : <User className="w-5 h-5 text-indigo-600" />
                                        }
                                    </div>
                                    <h2 className="text-lg font-semibold">
                                        {editingPersonal ? 'Editar' : 'Registrar'} {formData.tipo === 'profesional' ? 'Profesional' : 'Prestador'}
                                    </h2>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowForm(false)}
                                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Form Body */}
                            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-6">
                                {/* Type Toggle */}
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, tipo: 'prestador', area: '' })}
                                        className={`flex-1 py-2 px-4 rounded-xl font-medium text-sm transition-all h-auto ${formData.tipo === 'prestador'
                                            ? 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <Users className="w-4 h-4 inline mr-2" />
                                        Staff / Operativo
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, tipo: 'profesional', area: '' })}
                                        className={`flex-1 py-2 px-4 rounded-xl font-medium text-sm transition-all h-auto ${formData.tipo === 'profesional'
                                            ? 'bg-emerald-600 text-white shadow-lg hover:bg-emerald-700'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <Stethoscope className="w-4 h-4 inline mr-2" />
                                        Profesional
                                    </Button>
                                </div>

                                {/* Basic Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Nombre *
                                        </label>
                                        <Input
                                            type="text"
                                            value={formData.nombre}
                                            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                            placeholder="Nombre"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Apellido
                                        </label>
                                        <Input
                                            type="text"
                                            value={formData.apellido}
                                            onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                            placeholder="Apellido"
                                        />
                                    </div>
                                </div>

                                {/* Area Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Área / Especialidad *
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={formData.area}
                                            onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="">Seleccionar área...</option>
                                            {areasForType.map(area => (
                                                <option key={area.id} value={area.nombre}>{area.nombre}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Contact Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            <Mail className="w-4 h-4 inline mr-1" />
                                            Email
                                        </label>
                                        <Input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                            placeholder="email@ejemplo.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            <Phone className="w-4 h-4 inline mr-1" />
                                            WhatsApp
                                        </label>
                                        <Input
                                            type="tel"
                                            value={formData.whatsapp}
                                            onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                            placeholder="1123456789"
                                        />
                                    </div>
                                </div>

                                {/* Document & Address */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            <FileText className="w-4 h-4 inline mr-1" />
                                            DNI / Documento
                                        </label>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                <FileText className="w-4 h-4 inline mr-1" />
                                                DNI / Documento
                                            </label>
                                            <Input
                                                type="text"
                                                value={formData.documento}
                                                onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                                                className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                                placeholder="12345678"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                <Building2 className="w-4 h-4 inline mr-1" />
                                                Condición AFIP
                                            </label>
                                            <select
                                                value={formData.condicion_afip || ''}
                                                onChange={(e) => setFormData({ ...formData, condicion_afip: (e.target.value || undefined) as CreatePersonalInput['condicion_afip'] })}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="">Seleccionar...</option>
                                                {CONDICION_AFIP_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            <MapPin className="w-4 h-4 inline mr-1" />
                                            Dirección / Barrio
                                        </label>
                                        <Input
                                            type="text"
                                            value={formData.barrio_localidad}
                                            onChange={(e) => setFormData({ ...formData, barrio_localidad: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                            placeholder="Ej: Palermo, CABA"
                                        />
                                    </div>

                                    {/* Payment Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                <DollarSign className="w-4 h-4 inline mr-1" />
                                                Valor Hora (ARS)
                                            </label>
                                            <MoneyInput
                                                value={formData.valor_hora_ars ?? 0}
                                                onChange={(val) => setFormData({ ...formData, valor_hora_ars: val })}
                                                className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                                placeholder="0"
                                                currency="ARS"
                                            />
                                        </div>
                                        {formData.tipo === 'profesional' && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    % Honorarios
                                                </label>
                                                <Input
                                                    type="number"
                                                    value={formData.porcentaje_honorarios}
                                                    onChange={(e) => setFormData({ ...formData, porcentaje_honorarios: parseFloat(e.target.value) || 0 })}
                                                    className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                                    placeholder="0"
                                                    min="0"
                                                    max="100"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Professional specific fields */}
                                    {formData.tipo === 'profesional' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    <BadgeCheck className="w-4 h-4 inline mr-1" />
                                                    Matrícula Provincial
                                                </label>
                                                <Input
                                                    type="text"
                                                    value={formData.matricula_provincial}
                                                    onChange={(e) => setFormData({ ...formData, matricula_provincial: e.target.value })}
                                                    className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                                    placeholder="MP-12345"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    <Shield className="w-4 h-4 inline mr-1" />
                                                    Especialidad
                                                </label>
                                                <Input
                                                    type="text"
                                                    value={formData.especialidad}
                                                    onChange={(e) => setFormData({ ...formData, especialidad: e.target.value })}
                                                    className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                                    placeholder="Ej: Ortodoncia"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Notas / Descripción
                                        </label>
                                        <Textarea
                                            value={formData.descripcion}
                                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 min-h-[80px]"
                                            placeholder="Información adicional..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Form Footer */}
                            <div className="flex justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-slate-600 hover:text-slate-800"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleSubmitPersonal}
                                    disabled={submitting || !formData.nombre || !formData.area}
                                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                                >
                                    {submitting ? 'Guardando...' : editingPersonal ? 'Actualizar' : 'Crear'}
                                    <Check className="w-4 h-4" />
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Registrar Prestacion Modal */}
            <AnimatePresence>
                {showPrestacionForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowPrestacionForm(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Stethoscope className="w-6 h-6 text-emerald-600" />
                                Registrar Prestación
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Paciente</label>
                                    <Input
                                        type="text"
                                        className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                                        value={prestacionForm.paciente_nombre}
                                        onChange={e => setPrestacionForm({ ...prestacionForm, paciente_nombre: e.target.value })}
                                        placeholder="Nombre del Paciente"
                                    />
                                </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">Prestación</label>
                                        <select
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                                            value={prestacionForm.prestacion_id}
                                            onChange={e => {
                                                const p = prestacionesLista.find(pl => pl.id === e.target.value);
                                                if (p) {
                                                    setPrestacionForm({
                                                        ...prestacionForm,
                                                        prestacion_id: p.id,
                                                        prestacion_nombre_manual: p.nombre,
                                                        valor_cobrado: p.precio_base,
                                                        moneda: p.moneda
                                                    });
                                                } else {
                                                    setPrestacionForm({
                                                        ...prestacionForm,
                                                        prestacion_id: '',
                                                    });
                                                }
                                            }}
                                        >
                                            <option value="">Seleccionar prestación...</option>
                                            {prestacionesLista.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.area_nombre} - {p.nombre} ({p.moneda} {p.precio_base})
                                                </option>
                                            ))}
                                        </select>
                                        {prestacionesLista.length === 0 && (
                                            <p className="text-xs text-amber-500 mt-1">
                                                No hay tarifario cargado. Podés registrar prestación manual abajo.
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1">Nombre de prestación (manual)</label>
                                        <Input
                                            type="text"
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                                            value={prestacionForm.prestacion_nombre_manual}
                                            onChange={e => setPrestacionForm({ ...prestacionForm, prestacion_nombre_manual: e.target.value })}
                                            placeholder="Ej: Consulta control, Limpieza, etc."
                                        />
                                        {recentPrestaciones.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {recentPrestaciones.map((name) => (
                                                    <button
                                                        type="button"
                                                        key={name}
                                                        onClick={() => setPrestacionForm({ ...prestacionForm, prestacion_nombre_manual: name, prestacion_id: '' })}
                                                        className="px-2 py-1 text-[11px] rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                                    >
                                                        {name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <MoneyInput
                                        className="w-full"
                                        value={prestacionForm.valor_cobrado}
                                        onChange={val => setPrestacionForm({ ...prestacionForm, valor_cobrado: val })}
                                        currency={prestacionForm.moneda}
                                    />

                                    <div>
                                        <label className="block text-sm font-medium mb-1">Moneda</label>
                                        <select
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                                            value={prestacionForm.moneda}
                                            onChange={e => setPrestacionForm({ ...prestacionForm, moneda: e.target.value as 'ARS' | 'USD' })}
                                        >
                                            <option value="ARS">ARS</option>
                                            <option value="USD">USD</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Notas</label>
                                    <Textarea
                                        className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-900"
                                        rows={2}
                                        value={prestacionForm.notas}
                                        onChange={e => setPrestacionForm({ ...prestacionForm, notas: e.target.value })}
                                    />
                                </div>

                                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={prestacionForm.guardar_en_tarifario}
                                        onChange={(e) => setPrestacionForm({ ...prestacionForm, guardar_en_tarifario: e.target.checked })}
                                        className="rounded border-slate-300 dark:border-slate-600"
                                    />
                                    Guardar esta prestación en tarifario para próximas cargas
                                    {selectedProfesional?.area ? ` (${selectedProfesional.area})` : ''}
                                </label>

                                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={prestacionForm.recalcular_liquidacion}
                                        onChange={(e) => setPrestacionForm({ ...prestacionForm, recalcular_liquidacion: e.target.checked })}
                                        className="rounded border-slate-300 dark:border-slate-600"
                                    />
                                    Recalcular liquidación del profesional automáticamente
                                </label>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowPrestacionForm(false)}
                                    className="px-4 py-2 text-slate-500 hover:text-slate-700"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleRegistrarPrestacion}
                                    disabled={submitting}
                                    className="bg-emerald-600 text-white px-6 py-2 rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {submitting ? 'Guardando...' : 'Registrar'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Equipo (Prestadores de Servicio) Tab Content */}
            {activeTab === 'equipo' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPrestadores.length === 0 ? (
                        <div className="col-span-full p-12 text-center text-slate-400">
                            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No hay miembros del staff registrados</p>
                            <Button
                                variant="link"
                                onClick={() => openNewPersonalForm('prestador')}
                                className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium h-auto p-0"
                            >
                                + Agregar primer prestador
                            </Button>
                        </div>
                    ) : (
                        filteredPrestadores.map((p) => (
                            <motion.div
                                key={p.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                                        {p.foto_url ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={p.foto_url} alt={p.nombre} className="w-12 h-12 rounded-full object-cover" />
                                        ) : (
                                            <User className="w-6 h-6 text-indigo-600" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold truncate">{p.nombre} {p.apellido}</h4>
                                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {p.area || p.rol}
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openEditForm(p)}
                                        className="h-8 w-8 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="space-y-2 text-sm">
                                    {p.email && (
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Mail className="w-4 h-4" />
                                            <span className="truncate">{p.email}</span>
                                        </div>
                                    )}
                                    {p.whatsapp && (
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Phone className="w-4 h-4" />
                                            <span>{p.whatsapp}</span>
                                        </div>
                                    )}
                                    {p.condicion_afip && (
                                        <div className="flex items-center gap-2">
                                            <Building2 className="w-4 h-4 text-slate-400" />
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 capitalize">
                                                {p.condicion_afip.replace('_', ' ')}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                    <span className="text-xs text-slate-400">Valor hora:</span>
                                    <span className="font-bold text-green-600">
                                        <SensitiveValue
                                            value={p.valor_hora_ars}
                                            format="currency-ars"
                                            fieldId={`valor-hora-${p.id}`}
                                        />
                                    </span>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            )
            }

            {/* Profesionales Tab Content */}
            {
                activeTab === 'profesionales' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredProfesionales.length === 0 ? (
                            <div className="col-span-full p-12 text-center text-slate-400">
                                <Stethoscope className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>No hay profesionales registrados</p>
                                <Button
                                    variant="link"
                                    onClick={() => openNewPersonalForm('profesional')}
                                    className="mt-4 text-emerald-600 hover:text-emerald-700 font-medium h-auto p-0"
                                >
                                    + Agregar primer profesional
                                </Button>
                            </div>
                        ) : (
                            filteredProfesionales.map((p) => (
                                <motion.div
                                    key={p.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow"
                                >
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                                            {p.foto_url ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={p.foto_url} alt={p.nombre} className="w-12 h-12 rounded-full object-cover" />
                                            ) : (
                                                <Stethoscope className="w-6 h-6 text-emerald-600" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold truncate">
                                                {p.nombre.startsWith('Dr') ? '' : 'Dr. '}
                                                {p.nombre} {p.apellido}
                                            </h4>
                                            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                                                {p.especialidad || p.area}
                                            </span>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditForm(p)}
                                                className="h-8 w-8 p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                                title="Ver ficha completa"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                        {p.matricula_provincial && (
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <BadgeCheck className="w-4 h-4 text-emerald-500" />
                                                <span>Matrícula: {p.matricula_provincial}</span>
                                            </div>
                                        )}
                                        {p.email && (
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <Mail className="w-4 h-4" />
                                                <span className="truncate">{p.email}</span>
                                            </div>
                                        )}
                                        {p.condicion_afip && (
                                            <div className="flex items-center gap-2">
                                                <Building2 className="w-4 h-4 text-slate-400" />
                                                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 capitalize">
                                                    {p.condicion_afip.replace('_', ' ')}
                                                </span>
                                            </div>
                                        )}
                                        {p.poliza_vencimiento && (
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <Shield className="w-4 h-4" />
                                                <span>Póliza vence: {new Date(p.poliza_vencimiento).toLocaleDateString('es-AR')}</span>
                                            </div>
                                        )}
                                    </div>

                                    {p.porcentaje_honorarios && p.porcentaje_honorarios > 0 && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                            <span className="text-xs text-slate-400">Honorarios:</span>
                                            <span className="font-bold text-emerald-600">{p.porcentaje_honorarios}%</span>
                                        </div>
                                    )}

                                    {p.activo && !p.pagado_mes_actual && (
                                        <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                                            <span className="text-xs text-amber-600 font-medium">Pendiente de pago</span>
                                        </div>
                                    )}
                                    <Button
                                        onClick={() => openPrestacionForm(p.id)}
                                        className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium text-sm h-auto"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Registrar Prestación
                                    </Button>
                                </motion.div>
                            ))
                        )}
                    </div>
                )
            }

            {/* Registros & Liquidaciones Tab Content */}
            {
                activeTab === 'registros' && (
                    <>
                        {/* Hours Form */}
                        {showHorasForm && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6"
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-semibold">Registrar Horas</h3>
                                    <Button variant="ghost" size="icon" onClick={() => setShowHorasForm(false)} className="text-slate-400 hover:text-slate-600 h-auto w-auto p-1">
                                        <X className="w-5 h-5" />
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Personal *
                                        </label>
                                        <select
                                            value={horasForm.personal_id}
                                            onChange={(e) => setHorasForm({ ...horasForm, personal_id: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                        >
                                            {personal.map(p => (
                                                <option key={p.id} value={p.id}>{p.nombre} - {p.area || p.rol}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Fecha *
                                        </label>
                                        <Input
                                            type="date"
                                            value={horasForm.fecha}
                                            onChange={(e) => setHorasForm({ ...horasForm, fecha: e.target.value })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Horas *
                                        </label>
                                        <Input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={horasForm.horas}
                                            onChange={(e) => setHorasForm({ ...horasForm, horas: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Observaciones
                                        </label>
                                        <Input
                                            type="text"
                                            value={horasForm.observaciones}
                                            onChange={(e) => setHorasForm({ ...horasForm, observaciones: e.target.value })}
                                            placeholder="Opcional..."
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowHorasForm(false)}
                                        className="px-4 py-2 text-slate-600 hover:text-slate-800"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={handleRegistrarHoras}
                                        disabled={submitting || horasForm.horas <= 0}
                                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-indigo-700"
                                    >
                                        {submitting ? 'Guardando...' : 'Registrar'}
                                        <Check className="w-4 h-4" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* Personal Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {horasPorPersona.map(({ personal: p, totalHoras, liquidacion }) => {
                                // Calculate professional totals if applicable
                                const prestacionesProfe = prestacionesMes.filter(pr => pr.profesional_id === p.id);
                                const totalPrestaciones = prestacionesProfe.reduce((acc, pr) => acc + pr.valor_cobrado, 0);
                                const totalHonorarios = prestacionesProfe.reduce((acc, pr) => acc + (pr.monto_honorarios || 0), 0);
                                const isProfesional = p.tipo === 'profesional';
                                const criticalObservadosCount = getCriticalObservadosCount(p.id);
                                const hasCriticalObservados = criticalObservadosCount > 0;

                                return (
                                    <div
                                        key={p.id}
                                        className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5"
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${p.tipo === 'profesional'
                                                ? 'bg-emerald-100 dark:bg-emerald-900/50'
                                                : 'bg-purple-100 dark:bg-purple-900/50'
                                                }`}>
                                                {p.tipo === 'profesional'
                                                    ? <Stethoscope className="w-6 h-6 text-emerald-600" />
                                                    : <User className="w-6 h-6 text-purple-600" />
                                                }
                                            </div>
                                            <div>
                                                <h4 className="font-semibold">{p.nombre}</h4>
                                                <p className="text-sm text-slate-500">{p.area || p.rol}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-sm text-slate-500">{isProfesional ? 'Prestaciones' : 'Horas mes'}</p>
                                                <p className="text-xl font-bold">
                                                    {isProfesional ? prestacionesProfe.length : `${totalHoras}h`}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-slate-500">{isProfesional ? '% Honorarios' : 'Valor hora'}</p>
                                                <p className="text-xl font-bold text-green-600">
                                                    {isProfesional ? `${p.porcentaje_honorarios}%` : (
                                                        <SensitiveValue
                                                            value={p.valor_hora_ars}
                                                            format="currency"
                                                            fieldId={`valor-hora-${p.id}`}
                                                        />
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mb-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-600">Total a Liquidar:</span>
                                                <span className="font-bold">
                                                    <SensitiveValue
                                                        value={isProfesional ? totalHonorarios : totalHoras * p.valor_hora_ars}
                                                        format="currency-ars"
                                                        fieldId={`total-${p.id}`}
                                                    />
                                                </span>
                                            </div>
                                            {isProfesional && (
                                                <div className="flex items-center justify-between mt-1 border-t border-slate-200 dark:border-slate-700 pt-1">
                                                    <span className="text-xs text-slate-400">Total Facturado:</span>
                                                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                                        <SensitiveValue
                                                            value={totalPrestaciones}
                                                            format="currency-ars"
                                                            fieldId={`facturado-${p.id}`}
                                                        />
                                                    </span>
                                                </div>
                                            )}
                                            {tcBna && !isProfesional && (
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-xs text-slate-400">Equiv. USD:</span>
                                                    <span className="text-sm text-green-600">
                                                        <SensitiveValue
                                                            value={(totalHoras * p.valor_hora_ars) / tcBna}
                                                            format="currency"
                                                            fieldId={`total-usd-${p.id}`}
                                                        />
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {liquidacion ? (
                                            <div className={`p-3 rounded-xl text-center ${liquidacion.estado === 'Pagado'
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700'
                                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700'
                                                }`}>
                                                <span className="text-sm font-medium">
                                                    Liquidación: {liquidacion.estado}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Button
                                                    onClick={() => handleGenerarLiquidacion(p.id)}
                                                    disabled={submitting || hasCriticalObservados || (isProfesional ? totalHonorarios === 0 : totalHoras === 0)}
                                                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl font-medium disabled:opacity-50 hover:bg-indigo-200 h-auto"
                                                >
                                                    <DollarSign className="w-4 h-4" />
                                                    Generar Liquidación
                                                </Button>
                                                {hasCriticalObservados && (
                                                    <p className="text-[11px] text-red-600 dark:text-red-400 font-medium text-center">
                                                        Bloqueado: {criticalObservadosCount} observado(s) crítico(s) sin resolver.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Recent Registros Table */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-indigo-500" />
                                    Registro de Horas del Mes
                                </h3>
                            </div>

                            {registros.length === 0 ? (
                                <div className="p-12 text-center text-slate-400">
                                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No hay horas registradas este mes</p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead className="bg-slate-50 dark:bg-slate-900">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Personal</th>
                                            <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Horas</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Observaciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {registros.map((reg) => {
                                            const persona = personal.find(p => p.id === reg.personal_id);
                                            return (
                                                <tr key={reg.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                    <td className="px-6 py-3 text-sm">
                                                        {new Date(reg.fecha).toLocaleDateString('es-AR')}
                                                    </td>
                                                    <td className="px-6 py-3 text-sm font-medium">{persona?.nombre || '-'}</td>
                                                    <td className="px-6 py-3 text-sm text-center font-bold">{reg.horas}h</td>
                                                    <td className="px-6 py-3 text-sm text-slate-500">{reg.observaciones || '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )
            }

            {/* Observados Tab */}
            {
                activeTab === 'observados' && (
                    <ObservadosTab
                        mes={mesActual}
                        initialPersonalId={initialObservedPersonalId}
                        onCountChange={(count) => setObservadosCount(count)}
                    />
                )
            }
        </div >
    );
}
