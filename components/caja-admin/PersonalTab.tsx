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
    Search,
    Building2,
    BadgeCheck,
    ChevronDown,
    Trash2,
    MessageCircle,
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
    uploadPersonalDocument,
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
import PrestacionesTab from './PrestacionesTab';
import HorariosTab from './HorariosTab';
import SensitiveValue from '@/components/ui/SensitiveValue';
import { getLiquidacionesConfig } from '@/app/actions/caja-liquidaciones';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
    initialTab?: MainTab | 'equipo';
    initialObservedPersonalId?: string;
}

type MainTab = 'prestadores' | 'prestaciones' | 'horarios' | 'registros' | 'observados';
type ProviderCategory = 'odontologos' | 'lab' | 'staff-general' | 'limpieza';

type ProviderTypeOption = {
    value: string;
    label: string;
    tipo: 'prestador' | 'odontologo';
};

const CONDICION_AFIP_OPTIONS = [
    { value: 'monotributista', label: 'Monotributista' },
    { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { value: 'relacion_dependencia', label: 'Relación de Dependencia' },
    { value: 'otro', label: 'Otro' },
];

const DEFAULT_PROVIDER_TYPE_OPTIONS: ProviderTypeOption[] = [
    { value: 'odontologo', label: 'Odontologo', tipo: 'odontologo' },
    { value: 'staff general', label: 'Staff general', tipo: 'prestador' },
    { value: 'limpieza', label: 'Limpieza', tipo: 'prestador' },
    { value: 'laboratorio', label: 'Laboratorio', tipo: 'prestador' },
];

export default function PersonalTab({ tcBna, initialTab, initialObservedPersonalId }: Props) {
    const { categoria: role } = useAuth();
    const [activeTab, setActiveTab] = useState<MainTab>((initialTab === 'equipo' ? 'prestadores' : initialTab) || 'prestadores');
    const [activeProviderCategory, setActiveProviderCategory] = useState<ProviderCategory | 'todos'>('todos');
    const [observadosCount, setObservadosCount] = useState(0);
    const [personal, setPersonal] = useState<Personal[]>([]);
    const [personalAreas, setPersonalAreas] = useState<PersonalArea[]>([]);
    const [registros, setRegistros] = useState<RegistroHoras[]>([]);
    const [liquidaciones, setLiquidaciones] = useState<LiquidacionMensual[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showHorasForm, setShowHorasForm] = useState(false);
    const [editingPersonal, setEditingPersonal] = useState<Personal | null>(null);
    const [deletingPersonalId, setDeletingPersonalId] = useState<string | null>(null);
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
        poliza_url: '',
    });

    // Hours form state
    const [horasForm, setHorasForm] = useState({
        personal_id: '',
        fecha: new Date().toISOString().split('T')[0],
        horas: 0,
        observaciones: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [uploadingPoliza, setUploadingPoliza] = useState(false);
    const [whatsappError, setWhatsappError] = useState('');
    const [hourConfig, setHourConfig] = useState({
        cleaningHourValue: 0,
        staffGeneralHourValue: 0,
    });

    function normalizeText(value?: string | null) {
        return (value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    function getConfiguredHourValue(p: Personal) {
        const area = normalizeText(p.area);
        const rol = normalizeText(p.rol);
        const isCleaning = area.includes('limpieza') || rol.includes('limpieza');
        return isCleaning
            ? Number(hourConfig.cleaningHourValue || 0)
            : Number(hourConfig.staffGeneralHourValue || 0);
    }

    function isOdontologoTipo(tipo?: string | null) {
        return tipo === 'odontologo' || tipo === 'profesional';
    }

    function normalizeWhatsAppE164(value?: string | null): string | null {
        if (!value) return null;

        const raw = value.trim();
        if (!raw) return null;

        // Force explicit country code from the form (e.g. +549...)
        if (!raw.startsWith('+')) return null;

        let digits = raw.replace(/\D/g, '');
        if (!digits) return null;

        if (digits.startsWith('54')) {
            let rest = digits.slice(2).replace(/^0+/, '');

            if (!rest.startsWith('9')) {
                rest = `9${rest}`;
            }

            let local = rest.slice(1).replace(/^0+/, '');

            for (let areaLen = 2; areaLen <= 4; areaLen += 1) {
                if (local.length > areaLen + 5 && local.slice(areaLen, areaLen + 2) === '15') {
                    local = `${local.slice(0, areaLen)}${local.slice(areaLen + 2)}`;
                    break;
                }
            }

            digits = `549${local}`;
        }

        if (digits.length < 10 || digits.length > 15) {
            return null;
        }

        return `+${digits}`;
    }

    function getWhatsAppLink(phone?: string | null) {
        const normalized = normalizeWhatsAppE164(phone);
        if (!normalized) return null;
        return `https://wa.me/${normalized.replace(/\D/g, '')}`;
    }

    async function loadData() {
        setLoading(true);
        try {
            const [
                personalData,
                areasData,
                registrosData,
                liquidacionesData,
                obsCount,
                prestacionesData,
                prestacionesMesData,
                configData,
            ] = await Promise.all([
                getPersonal(),
                getPersonalAreas(),
                getRegistroHoras({ mes: mesActual }),
                getLiquidaciones({ mes: mesActual }),
                countObservadosPendientes(mesActual),
                getPrestacionesLista(),
                getPrestacionesRealizadas({ mes: mesActual }),
                getLiquidacionesConfig().catch(() => null),
            ]);

            setPersonal(personalData);
            setPersonalAreas(areasData);
            setRegistros(registrosData);
            setLiquidaciones(liquidacionesData);
            setObservadosCount(obsCount);
            setPrestacionesLista(prestacionesData);
            setPrestacionesMes(prestacionesMesData);

            if (configData?.hourValues) {
                setHourConfig({
                    cleaningHourValue: Number(configData.hourValues.cleaningHourValue || 0),
                    staffGeneralHourValue: Number(configData.hourValues.staffGeneralHourValue || 0),
                });
            }

            if (personalData.length > 0) {
                setHorasForm(f => ({ ...f, personal_id: personalData[0].id }));
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mesActual]);

    useEffect(() => {
        if (!initialTab) return;
        setActiveTab(initialTab === 'equipo' ? 'prestadores' : initialTab);
    }, [initialTab]);

    function openEditForm(p: Personal) {
        setEditingPersonal(p);
        setFormData({
            nombre: p.nombre,
            apellido: p.apellido || '',
            tipo: isOdontologoTipo(p.tipo) ? 'odontologo' : 'prestador',
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
            poliza_url: p.poliza_url || '',
            porcentaje_honorarios: p.porcentaje_honorarios || 0,
        });
        setShowForm(true);
    }

    function openCreateForm() {
        const odontologiaDefault = personalAreas.find((area) =>
            area.tipo_personal === 'odontologo'
            || area.tipo_personal === 'profesional'
            || area.tipo_personal === 'ambos'
        )?.nombre || 'Odontologia';

        const byCategory: Record<ProviderCategory, { tipo: CreatePersonalInput['tipo']; area: string }> = {
            odontologos: { tipo: 'odontologo', area: odontologiaDefault },
            lab: { tipo: 'prestador', area: 'Laboratorio' },
            limpieza: { tipo: 'prestador', area: 'Limpieza' },
            'staff-general': { tipo: 'prestador', area: 'Staff general' },
        };

        const defaults = activeProviderCategory === 'todos' ? byCategory.odontologos : byCategory[activeProviderCategory];

        setEditingPersonal(null);
        setFormData({
            nombre: '',
            apellido: '',
            tipo: defaults.tipo,
            area: defaults.area,
            email: '',
            whatsapp: '',
            documento: '',
            direccion: '',
            barrio_localidad: '',
            condicion_afip: undefined,
            valor_hora_ars: 0,
            descripcion: '',
            matricula_provincial: '',
            especialidad: '',
            poliza_url: '',
            porcentaje_honorarios: 0,
        });
        setShowForm(true);
    }

    async function handleUploadPoliza(file: File) {
        if (!editingPersonal) {
            alert('Primero guarda el prestador para poder adjuntar el PDF.');
            return;
        }

        if (file.type !== 'application/pdf') {
            alert('Solo se permite adjuntar PDF para el seguro de mala praxis.');
            return;
        }

        setUploadingPoliza(true);
        try {
            const { url, error } = await uploadPersonalDocument(editingPersonal.id, file, 'poliza');
            if (error || !url) {
                throw error || new Error('No se pudo subir el archivo');
            }

            const result = await updatePersonal(editingPersonal.id, { poliza_url: url });
            if (!result.success) {
                throw new Error(result.error || 'No se pudo guardar el link del PDF');
            }

            setFormData((prev) => ({ ...prev, poliza_url: url }));
            setEditingPersonal((prev) => (prev ? { ...prev, poliza_url: url } : prev));
        } catch (error) {
            console.error('Error uploading policy PDF:', error);
            alert('No se pudo adjuntar el seguro de mala praxis.');
        } finally {
            setUploadingPoliza(false);
        }
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
            alert('Por favor complete nombre y tipo de prestador');
            return;
        }

        const normalizedWhatsapp = normalizeWhatsAppE164(formData.whatsapp || '');
        if (formData.whatsapp && !normalizedWhatsapp) {
            setWhatsappError('WhatsApp invalido. Debe incluir codigo de pais (ej: +549...) y no usar 0/15.');
            return;
        }

        setWhatsappError('');

        const payload = {
            ...formData,
            whatsapp: normalizedWhatsapp || '',
        };

        setSubmitting(true);
        try {
            if (editingPersonal) {
                // Cast to Partial<Personal> for update compatibility
                const result = await updatePersonal(editingPersonal.id, payload as unknown as Parameters<typeof updatePersonal>[1]);
                if (!result.success) {
                    throw new Error(result.error || 'No se pudo actualizar el prestador');
                }
            } else {
                const result = await createPersonal(payload);
                if (result.error) {
                    throw result.error;
                }
            }
            setShowForm(false);
            setEditingPersonal(null);
            loadData();
        } catch (error) {
            console.error('Error saving personal:', error);
            alert(error instanceof Error ? error.message : 'Error al guardar');
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

        const honorarios = prestacionForm.valor_cobrado;
        const finalPrestacionNombre = prestacion?.nombre || manualName;

        const { error } = await registrarPrestacionRealizada({
            profesional_id: selectedProfesionalId,
            paciente_nombre: prestacionForm.paciente_nombre,
            prestacion_id: hasCatalogSelection ? prestacionForm.prestacion_id : undefined,
            prestacion_nombre: finalPrestacionNombre,
            fecha_realizacion: new Date().toISOString(),
            valor_cobrado: prestacionForm.valor_cobrado,
            moneda_cobro: prestacionForm.moneda,
            porcentaje_honorarios: 100,
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

    async function handleDeletePersonal(p: Personal) {
        if (role !== 'owner') return;

        const confirmDelete = window.confirm(
            `¿Eliminar a ${p.nombre} ${p.apellido || ''}?\n\nSe desactivará y dejará de aparecer en Prestadores.`
        );

        if (!confirmDelete) return;

        setDeletingPersonalId(p.id);

        try {
            const result = await updatePersonal(p.id, { activo: false });
            if (!result.success) {
                alert(result.error || 'No se pudo eliminar el prestador.');
                return;
            }

            await loadData();
        } finally {
            setDeletingPersonalId(null);
        }
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

        if (isOdontologoTipo(p?.tipo)) {
            const prestacionesProfe = prestacionesMes.filter(pr => pr.profesional_id === personalId);
            const { error } = await generarLiquidacionProfesional(personalId, mesActual, prestacionesProfe);
            if (error) {
                console.error('Error generando liquidación de odontólogo:', error);
                alert('Error al generar liquidación: ' + error);
            }
        } else {
            await generarLiquidacion(personalId, mesActual, tcBna || undefined);
        }

        setSubmitting(false);
        loadData();
    }

    function shouldHideFromPrestadores(p: Personal) {
        const fullName = normalizeText(`${p.nombre || ''} ${p.apellido || ''}`);
        const area = normalizeText(p.area);
        const rol = normalizeText(p.rol);

        const obviousTestTokens = [
            'asd',
            'test',
            'prueba',
            'demo',
            'equipo marketing',
            'asistente dental 1',
            'recepcion',
        ];

        const isObviousTest = obviousTestTokens.some((token) => fullName.includes(token));
        if (isObviousTest) return true;

        const isProviderLikeArea =
            area.includes('limpieza')
            || area.includes('laboratorio')
            || area.includes('odont')
            || area.includes('staff general')
            || rol.includes('limpieza')
            || rol.includes('laboratorio')
            || rol.includes('odont');

        if (isProviderLikeArea) return false;

        const isOwnerOrDirectionRole =
            rol.includes('owner')
            || rol.includes('direccion')
            || area.includes('direccion')
            || area.includes('owner');

        if (isOwnerOrDirectionRole) return true;

        const isGenericUserRole =
            area.includes('recepcion')
            || area.includes('tecnologia')
            || area === 'general'
            || area.includes('marketing')
            || area.includes('asistente dental')
            || rol.includes('recepcion')
            || rol.includes('asistente');

        const hasOperationalData = Boolean(
            p.documento
            || p.whatsapp
            || p.direccion
            || p.barrio_localidad
            || p.condicion_afip
            || p.foto_url
            || p.empresa_prestadora_id
            || p.descripcion
        );

        return Boolean(p.user_id)
            && Number(p.valor_hora_ars || 0) === 0
            && isGenericUserRole
            && !hasOperationalData;
    }

    function getPrestadorCategory(p: Personal): ProviderCategory {
        const area = normalizeText(p.area);
        const rol = normalizeText(p.rol);
        const especialidad = normalizeText(p.especialidad);

        if (area.includes('limpieza') || rol.includes('limpieza')) {
            return 'limpieza';
        }

        if (area.includes('laboratorio') || rol.includes('laboratorio') || area === 'lab' || rol === 'lab') {
            return 'lab';
        }

        if (
            isOdontologoTipo(p.tipo)
            || area.includes('odont')
            || rol.includes('odont')
            || especialidad.includes('odont')
        ) {
            return 'odontologos';
        }

        return 'staff-general';
    }

    // Filter personal by type and search
    const prestadores = personal.filter((p) => !shouldHideFromPrestadores(p));

    const providerCategories: Array<{ id: ProviderCategory | 'todos'; label: string }> = [
        { id: 'todos', label: 'Todos' },
        { id: 'odontologos', label: 'Odontólogos' },
        { id: 'lab', label: 'Lab' },
        { id: 'staff-general', label: 'Staff general' },
        { id: 'limpieza', label: 'Limpieza' },
    ];

    const providerCounts = prestadores.reduce<Record<ProviderCategory | 'todos', number>>((acc, p) => {
        const category = getPrestadorCategory(p);
        acc[category] += 1;
        acc['todos'] += 1;
        return acc;
    }, {
        todos: 0,
        odontologos: 0,
        lab: 0,
        'staff-general': 0,
        limpieza: 0,
    });

    const filteredPrestadores = prestadores.filter((p) => {
        const hasSearch = searchTerm.trim() !== '';

        if (!hasSearch && activeProviderCategory !== 'todos' && getPrestadorCategory(p) !== activeProviderCategory) {
            return false;
        }

        return (
            searchTerm === '' ||
            p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.apellido?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.area?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.rol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.especialidad?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const activeProviderLabel = providerCategories.find((cat) => cat.id === activeProviderCategory)?.label || 'Prestadores';

    const hiddenUserPlaceholdersCount = personal.filter((p) => shouldHideFromPrestadores(p)).length;

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

    const providerTypeOptions: ProviderTypeOption[] = (() => {
        const byKey = new Map<string, ProviderTypeOption>();

        for (const option of DEFAULT_PROVIDER_TYPE_OPTIONS) {
            byKey.set(normalizeText(option.value), option);
        }

        for (const area of personalAreas) {
            const value = (area.nombre || '').trim();
            if (!value) continue;

            const tipo = area.tipo_personal === 'odontologo' || area.tipo_personal === 'profesional'
                ? 'odontologo'
                : 'prestador';

            const key = normalizeText(value);
            if (!byKey.has(key)) {
                byKey.set(key, { value, label: value, tipo });
            }
        }

        if (!isOdontologoTipo(formData.tipo) && formData.area && !byKey.has(normalizeText(formData.area))) {
            byKey.set(normalizeText(formData.area), {
                value: formData.area,
                label: formData.area,
                tipo: 'prestador',
            });
        }

        return Array.from(byKey.values());
    })();

    const selectedProviderTypeValue = (() => {
        if (isOdontologoTipo(formData.tipo)) {
            return 'odontologo';
        }

        const normalizedArea = normalizeText(formData.area);
        if (normalizedArea.includes('limpieza')) return 'limpieza';
        if (normalizedArea.includes('laboratorio') || normalizedArea === 'lab') return 'laboratorio';
        if (normalizedArea.includes('staff general')) return 'staff general';

        const matched = providerTypeOptions.find((option) => normalizeText(option.value) === normalizedArea);
        if (matched) return matched.value;

        return 'staff general';
    })();

    function handleProviderTypeChange(nextTypeValue: string) {
        const selected = providerTypeOptions.find((option) => option.value === nextTypeValue);
        const selectedLabel = selected?.label || nextTypeValue;
        const isOdontologoSelection = selected?.tipo === 'odontologo' || normalizeText(nextTypeValue) === 'odontologo';

        setFormData((prev) => {
            if (isOdontologoSelection) {
                const preserveCurrentArea = prev.tipo === 'odontologo' && Boolean(prev.area);
                return {
                    ...prev,
                    tipo: 'odontologo',
                    area: preserveCurrentArea ? prev.area : 'Odontologia',
                };
            }

            return {
                ...prev,
                tipo: 'prestador',
                area: selectedLabel,
            };
        });
    }

    const odontologiaAreas = personalAreas.filter((a) =>
        a.tipo_personal === 'odontologo'
        || a.tipo_personal === 'profesional'
        || a.tipo_personal === 'ambos'
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
                        onClick={() => setActiveTab('prestadores')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors h-auto ${activeTab === 'prestadores'
                            ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500 rounded-b-none'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-none'
                            }`}
                    >
                        <Users className="w-4 h-4" />
                        Prestadores
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setActiveTab('prestaciones')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors h-auto ${activeTab === 'prestaciones'
                            ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-b-2 border-emerald-500 rounded-b-none'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-none'
                            }`}
                    >
                        <Stethoscope className="w-4 h-4" />
                        Lista de Prestaciones
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setActiveTab('horarios')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors h-auto ${activeTab === 'horarios'
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500 rounded-b-none'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-none'
                            }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Horarios
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
                {activeTab === 'prestadores' && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {providerCategories.map((category) => {
                                const isCategoryActive = activeProviderCategory === category.id;

                                return (
                                    <Button
                                        key={category.id}
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setActiveProviderCategory(category.id)}
                                        className={`h-auto rounded-lg px-3 py-1.5 text-sm transition-colors ${isCategoryActive
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                            }`}
                                    >
                                        {category.label}
                                        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${isCategoryActive
                                            ? 'bg-white/20 text-white'
                                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                            }`}>
                                            {providerCounts[category.id]}
                                        </span>
                                    </Button>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700 max-w-md flex-1 min-w-[240px]">
                                <Search className="w-5 h-5 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-transparent border-none outline-none text-sm flex-1 focus-visible:ring-0 shadow-none h-auto p-0"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    onClick={openCreateForm}
                                    className="h-auto px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg hover:opacity-90"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Agregar prestador
                                </Button>
                            </div>
                        </div>
                        {hiddenUserPlaceholdersCount > 0 && (
                            <p className="text-xs text-slate-500 px-1">
                                Se ocultaron {hiddenUserPlaceholdersCount} usuario(s) de prueba/sin ficha de prestador.
                            </p>
                        )}
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
                                    <div className={`p-2 rounded-xl ${formData.tipo === 'odontologo'
                                        ? 'bg-emerald-100 dark:bg-emerald-900/50'
                                        : 'bg-indigo-100 dark:bg-indigo-900/50'
                                        }`}>
                                        {formData.tipo === 'odontologo'
                                            ? <Stethoscope className="w-5 h-5 text-emerald-600" />
                                            : <User className="w-5 h-5 text-indigo-600" />
                                        }
                                    </div>
                                    <h2 className="text-lg font-semibold">
                                        {editingPersonal ? 'Editar' : 'Registrar'} {formData.tipo === 'odontologo' ? 'Odontólogo' : 'Prestador'}
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
                                {/* Provider Type */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Tipo de prestador *
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedProviderTypeValue}
                                            onChange={(e) => handleProviderTypeChange(e.target.value)}
                                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            {providerTypeOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Los tipos se gestionan desde Configuracion {'>'} Tipos de Prestadores.
                                    </p>
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

                                {/* Odontologia Area Selection */}
                                {formData.tipo === 'odontologo' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Area / especialidad odontologica *
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={formData.area}
                                                onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="">Seleccionar area...</option>
                                                {odontologiaAreas.map((area) => (
                                                    <option key={area.id} value={area.nombre}>{area.nombre}</option>
                                                ))}
                                                {formData.area && !odontologiaAreas.some((area) => area.nombre === formData.area) && (
                                                    <option value={formData.area}>{formData.area}</option>
                                                )}
                                            </select>
                                            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                )}

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
                                            onChange={(e) => {
                                                setFormData({ ...formData, whatsapp: e.target.value });
                                                if (whatsappError) setWhatsappError('');
                                            }}
                                            onBlur={() => {
                                                if (!formData.whatsapp) {
                                                    setWhatsappError('');
                                                    return;
                                                }

                                                const normalized = normalizeWhatsAppE164(formData.whatsapp || '');
                                                if (normalized) {
                                                    setFormData((prev) => ({ ...prev, whatsapp: normalized }));
                                                    setWhatsappError('');
                                                } else {
                                                    setWhatsappError('WhatsApp invalido. Debe incluir codigo de pais (ej: +549...) y no usar 0/15.');
                                                }
                                            }}
                                            className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                            placeholder="+5491123456789"
                                        />
                                        {whatsappError ? (
                                            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                                                {whatsappError}
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-xs text-slate-500">
                                                Formato internacional. Inclui codigo de pais y no uses 0 ni 15.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Document & Address */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
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
                                    {formData.tipo !== 'odontologo' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="md:col-span-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                                                El valor hora se configura globalmente en Liquidaciones → Configuración de Valores.
                                            </div>
                                        </div>
                                    )}

                                    {/* Odontólogo specific fields */}
                                    {formData.tipo === 'odontologo' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    <BadgeCheck className="w-4 h-4 inline mr-1" />
                                                    Matricula nacional
                                                </label>
                                                <Input
                                                    type="text"
                                                    value={formData.matricula_provincial}
                                                    onChange={(e) => setFormData({ ...formData, matricula_provincial: e.target.value })}
                                                    className="w-full px-4 py-2 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                                    placeholder="MN-12345"
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
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    <FileText className="w-4 h-4 inline mr-1" />
                                                    Seguro de mala praxis (PDF)
                                                </label>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <input
                                                        type="file"
                                                        accept="application/pdf"
                                                        disabled={uploadingPoliza || !editingPersonal}
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            await handleUploadPoliza(file);
                                                            e.currentTarget.value = '';
                                                        }}
                                                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-white hover:file:bg-indigo-700 disabled:opacity-60"
                                                    />
                                                    {uploadingPoliza && (
                                                        <span className="text-xs text-slate-500">Subiendo PDF...</span>
                                                    )}
                                                </div>
                                                {!editingPersonal && (
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Guarda primero el prestador para habilitar el adjunto.
                                                    </p>
                                                )}
                                                {formData.poliza_url && (
                                                    <a
                                                        href={formData.poliza_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="mt-2 inline-flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-700"
                                                    >
                                                        Ver PDF adjunto
                                                    </a>
                                                )}
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
                                    Recalcular liquidación del odontólogo automáticamente
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

            {/* Prestadores Tab Content */}
            {activeTab === 'prestadores' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPrestadores.length === 0 ? (
                        <div className="col-span-full p-12 text-center text-slate-400">
                            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No hay prestadores en {activeProviderLabel}</p>
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
                                            isOdontologoTipo(p.tipo)
                                                ? <Stethoscope className="w-6 h-6 text-emerald-600" />
                                                : <User className="w-6 h-6 text-indigo-600" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold truncate">{p.nombre} {p.apellido}</h4>
                                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {p.area || p.rol}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditForm(p)}
                                            className="h-8 w-8 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        {role === 'owner' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeletePersonal(p)}
                                                disabled={deletingPersonalId === p.id}
                                                className="h-8 w-8 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                                                title="Eliminar prestador"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm">
                                    {p.email && (
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Mail className="w-4 h-4" />
                                            <span className="truncate">{p.email}</span>
                                        </div>
                                    )}
                                    {p.whatsapp && (
                                        <div className="flex items-center justify-between gap-2 text-slate-500">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Phone className="w-4 h-4" />
                                                <span className="truncate">{p.whatsapp}</span>
                                            </div>
                                            {getWhatsAppLink(p.whatsapp) && (
                                                <a
                                                    href={getWhatsAppLink(p.whatsapp)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Contactar por WhatsApp"
                                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40 transition-colors text-xs font-medium"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                    <span>Contactar</span>
                                                </a>
                                            )}
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

                                {isOdontologoTipo(p.tipo) && (
                                    <Button
                                        onClick={() => openPrestacionForm(p.id)}
                                        className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors font-medium text-sm h-auto"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Registrar Prestación
                                    </Button>
                                )}

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
                                const isProfesional = isOdontologoTipo(p.tipo);
                                const configuredHourValue = getConfiguredHourValue(p);
                                const criticalObservadosCount = getCriticalObservadosCount(p.id);
                                const hasCriticalObservados = criticalObservadosCount > 0;

                                return (
                                    <div
                                        key={p.id}
                                        className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5"
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isOdontologoTipo(p.tipo)
                                                ? 'bg-emerald-100 dark:bg-emerald-900/50'
                                                : 'bg-purple-100 dark:bg-purple-900/50'
                                                }`}>
                                                {isOdontologoTipo(p.tipo)
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
                                                <p className="text-sm text-slate-500">{isProfesional ? 'Modelo' : 'Esquema'}</p>
                                                <p className="text-xl font-bold text-green-600">
                                                    {isProfesional ? 'Por prestacion' : 'Global'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mb-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-600">Total a Liquidar:</span>
                                                <span className="font-bold">
                                                    <SensitiveValue
                                                        value={isProfesional ? totalHonorarios : totalHoras * configuredHourValue}
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
                                                            value={(totalHoras * configuredHourValue) / tcBna}
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

            {/* Prestaciones Tab Content */}
            {activeTab === 'prestaciones' && (
                <PrestacionesTab />
            )}

            {/* Horarios Tab Content */}
            {activeTab === 'horarios' && (
                <HorariosTab />
            )}

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
