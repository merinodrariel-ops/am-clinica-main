'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Plus, RefreshCw, Save, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import CategoriaGuard from '@/components/auth/CategoriaGuard';
import {
    createInternalService,
    createProviderServiceRecord,
    getLiquidacionesConfig,
    getMonthlyClosureSummary,
    getMonthlyHours,
    getMonthlyServiceRecords,
    getProvidersForGroups,
    saveHourValues,
    updateInternalServicePrice,
    upsertMonthlyHours,
    type HourValuesConfig,
    type InternalServiceItem,
    type MonthlyClosureRow,
    type ProviderOption,
    type ServiceRecordListItem,
} from '@/app/actions/caja-liquidaciones';

type LiquidacionesTabId = 'config' | 'hours' | 'services' | 'close';

const TABS: Array<{ id: LiquidacionesTabId; label: string }> = [
    { id: 'config', label: 'Configuración de Valores' },
    { id: 'hours', label: 'Horas (Limpieza y Staff General)' },
    { id: 'services', label: 'Prestaciones (Odontólogos y Lab)' },
    { id: 'close', label: 'Cierre Mensual' },
];

function currentMes() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function todayDate() {
    return new Date().toISOString().slice(0, 10);
}

function formatArs(value: number) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 2,
    }).format(value || 0);
}

export default function CajaAdminLiquidacionesPage() {
    const [activeTab, setActiveTab] = useState<LiquidacionesTabId>('config');
    const [mes, setMes] = useState(currentMes());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [hourValues, setHourValues] = useState<HourValuesConfig>({
        cleaningHourValue: 0,
        staffGeneralHourValue: 0,
    });
    const [services, setServices] = useState<InternalServiceItem[]>([]);
    const [servicePriceDrafts, setServicePriceDrafts] = useState<Record<string, string>>({});

    const [providersForHours, setProvidersForHours] = useState<ProviderOption[]>([]);
    const [providersForServices, setProvidersForServices] = useState<ProviderOption[]>([]);
    const [hoursDraftByProvider, setHoursDraftByProvider] = useState<Record<string, string>>({});

    const [serviceRecords, setServiceRecords] = useState<ServiceRecordListItem[]>([]);
    const [closureRows, setClosureRows] = useState<MonthlyClosureRow[]>([]);

    const [newService, setNewService] = useState({
        name: '',
        area: 'Odontología' as 'Odontología' | 'Laboratorio',
        internalPrice: '',
    });

    const [newServiceRecord, setNewServiceRecord] = useState({
        providerId: '',
        serviceId: '',
        performedDate: todayDate(),
    });

    const [busyId, setBusyId] = useState<string | null>(null);

    // Per-provider inline add state
    const [addingForProvider, setAddingForProvider] = useState<string | null>(null);
    const [inlineDraft, setInlineDraft] = useState({ serviceId: '', performedDate: todayDate() });

    const activeServices = useMemo(
        () => services.filter((service) => service.active),
        [services]
    );

    const selectedServiceProvider = useMemo(
        () => providersForServices.find((provider) => provider.id === newServiceRecord.providerId) || null,
        [providersForServices, newServiceRecord.providerId]
    );

    const availableServicesForProvider = useMemo(() => {
        if (!selectedServiceProvider) return activeServices;

        const requiredArea = selectedServiceProvider.group === 'Laboratorio'
            ? 'Laboratorio'
            : 'Odontología';

        return activeServices.filter((service) => service.area === requiredArea);
    }, [activeServices, selectedServiceProvider]);

    const canCreateServiceRecord = Boolean(
        newServiceRecord.providerId
        && newServiceRecord.serviceId
        && newServiceRecord.performedDate
    );

    const totalClosure = useMemo(
        () => closureRows.reduce((sum, row) => sum + Number(row.totalToPay || 0), 0),
        [closureRows]
    );

    const sourceTotals = useMemo(() => {
        return closureRows.reduce(
            (acc, row) => {
                if (row.source === 'Horas') {
                    acc.hours += Number(row.totalToPay || 0);
                } else {
                    acc.services += Number(row.totalToPay || 0);
                }
                return acc;
            },
            { hours: 0, services: 0 }
        );
    }, [closureRows]);

    const buildHoursDraft = useCallback((providers: ProviderOption[], rows: Array<{ providerId: string; totalHours: number }>) => {
        const byProvider = new Map(rows.map((row) => [row.providerId, row.totalHours]));
        const draft: Record<string, string> = {};

        providers.forEach((provider) => {
            const current = byProvider.get(provider.id);
            draft[provider.id] = current !== undefined ? String(current) : '';
        });

        return draft;
    }, []);

    const loadPageData = useCallback(async (targetMes: string) => {
        setRefreshing(true);
        try {
            const [configPayload, hourProviders, serviceProviders, monthHours, records, closure] = await Promise.all([
                getLiquidacionesConfig(),
                getProvidersForGroups(['Limpieza', 'Staff General']),
                getProvidersForGroups(['Odontólogos', 'Laboratorio']),
                getMonthlyHours(targetMes),
                getMonthlyServiceRecords(targetMes),
                getMonthlyClosureSummary(targetMes),
            ]);

            setHourValues(configPayload.hourValues);
            setServices(configPayload.services);
            setServicePriceDrafts(
                Object.fromEntries(
                    configPayload.services.map((service) => [service.id, String(service.internalPrice)])
                )
            );

            setProvidersForHours(hourProviders);
            setProvidersForServices(serviceProviders);
            setHoursDraftByProvider(buildHoursDraft(hourProviders, monthHours));

            setServiceRecords(records);
            setClosureRows(closure);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo cargar la información de liquidaciones');
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    }, [buildHoursDraft]);

    useEffect(() => {
        loadPageData(mes);
    }, [loadPageData, mes]);

    useEffect(() => {
        if (!newServiceRecord.serviceId) return;

        const stillValid = availableServicesForProvider.some(
            (service) => service.id === newServiceRecord.serviceId
        );

        if (!stillValid) {
            setNewServiceRecord((prev) => ({ ...prev, serviceId: '' }));
        }
    }, [availableServicesForProvider, newServiceRecord.serviceId]);

    async function handleSaveHourValues() {
        setBusyId('hour-values');
        try {
            await saveHourValues(hourValues);
            toast.success('Valores hora actualizados');
            await loadPageData(mes);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo guardar la configuración');
        } finally {
            setBusyId(null);
        }
    }

    async function handleCreateService(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const parsedPrice = Number(newService.internalPrice || 0);
        setBusyId('new-service');
        try {
            await createInternalService({
                name: newService.name,
                area: newService.area,
                internalPrice: parsedPrice,
            });

            toast.success('Prestación interna agregada');
            setNewService({ name: '', area: 'Odontología', internalPrice: '' });
            await loadPageData(mes);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo crear la prestación interna');
        } finally {
            setBusyId(null);
        }
    }

    async function handleSaveServicePrice(serviceId: string) {
        const parsedPrice = Number(servicePriceDrafts[serviceId] || 0);
        setBusyId(`service-${serviceId}`);
        try {
            await updateInternalServicePrice(serviceId, parsedPrice);
            toast.success('Precio interno actualizado');
            await loadPageData(mes);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el precio interno');
        } finally {
            setBusyId(null);
        }
    }

    async function handleSaveHours(providerId: string) {
        const hours = Number(hoursDraftByProvider[providerId] || 0);
        setBusyId(`hours-${providerId}`);
        try {
            await upsertMonthlyHours({ providerId, mes, totalHours: hours });
            toast.success('Horas guardadas');
            await loadPageData(mes);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudieron guardar las horas');
        } finally {
            setBusyId(null);
        }
    }

    async function handleSaveAllHours() {
        setBusyId('hours-all');
        try {
            for (const provider of providersForHours) {
                const hours = Number(hoursDraftByProvider[provider.id] || 0);
                await upsertMonthlyHours({ providerId: provider.id, mes, totalHours: hours });
            }
            toast.success('Horas del mes actualizadas');
            await loadPageData(mes);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudieron guardar todas las horas');
        } finally {
            setBusyId(null);
        }
    }

    async function handleCreateServiceRecord(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusyId('new-service-record');
        try {
            await createProviderServiceRecord(newServiceRecord);
            toast.success('Prestación registrada');
            setNewServiceRecord((prev) => ({
                ...prev,
                serviceId: '',
            }));
            await loadPageData(mes);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo registrar la prestación');
        } finally {
            setBusyId(null);
        }
    }

    async function handleInlineAdd(providerId: string) {
        if (!inlineDraft.serviceId || !inlineDraft.performedDate) {
            toast.error('Seleccioná prestación y fecha');
            return;
        }
        setBusyId(`inline-${providerId}`);
        try {
            await createProviderServiceRecord({
                providerId,
                serviceId: inlineDraft.serviceId,
                performedDate: inlineDraft.performedDate,
            });
            toast.success('Prestación registrada');
            setAddingForProvider(null);
            setInlineDraft({ serviceId: '', performedDate: todayDate() });
            await loadPageData(mes);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo registrar la prestación');
        } finally {
            setBusyId(null);
        }
    }

    function getHourlyAmount(provider: ProviderOption) {
        const hours = Number(hoursDraftByProvider[provider.id] || 0);
        const hourValue = provider.group === 'Limpieza'
            ? Number(hourValues.cleaningHourValue || 0)
            : Number(hourValues.staffGeneralHourValue || 0);

        return Math.round((hours * hourValue + Number.EPSILON) * 100) / 100;
    }

    if (loading) {
        return (
            <CategoriaGuard allowedCategorias={['admin', 'owner']}>
                <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Cargando liquidaciones...
                    </div>
                </div>
            </CategoriaGuard>
        );
    }

    return (
        <CategoriaGuard allowedCategorias={['admin', 'owner']}>
            <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-6">
                <div className="max-w-7xl mx-auto space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/30">
                                <Wallet className="w-5 h-5 text-violet-300" />
                            </div>
                            <div>
                                <h1 className="text-xl sm:text-2xl font-bold">Liquidaciones</h1>
                                <p className="text-xs sm:text-sm text-slate-400">Caja de administración: configuración, horas, prestaciones y cierre mensual</p>
                            </div>
                        </div>

                        <button
                            onClick={() => loadPageData(mes)}
                            disabled={refreshing}
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm text-slate-200 disabled:opacity-60"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Actualizar
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${activeTab === tab.id
                                    ? 'bg-violet-600 border-violet-500 text-white'
                                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {(activeTab === 'hours' || activeTab === 'services' || activeTab === 'close') && (
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-300">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <input
                                type="month"
                                value={mes}
                                onChange={(event) => setMes(event.target.value)}
                                className="bg-transparent border-none outline-none"
                            />
                        </div>
                    )}

                    {activeTab === 'config' && (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                            <div className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                                <h2 className="font-semibold text-sm text-slate-200">Valores Hora</h2>

                                <label className="block text-xs text-slate-400 space-y-1">
                                    <span>Valor Hora Limpieza</span>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={hourValues.cleaningHourValue}
                                        onChange={(event) => setHourValues((prev) => ({
                                            ...prev,
                                            cleaningHourValue: Number(event.target.value || 0),
                                        }))}
                                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                                    />
                                </label>

                                <label className="block text-xs text-slate-400 space-y-1">
                                    <span>Valor Hora Staff General</span>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={hourValues.staffGeneralHourValue}
                                        onChange={(event) => setHourValues((prev) => ({
                                            ...prev,
                                            staffGeneralHourValue: Number(event.target.value || 0),
                                        }))}
                                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                                    />
                                </label>

                                <button
                                    onClick={handleSaveHourValues}
                                    disabled={busyId === 'hour-values'}
                                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-2 text-sm font-medium disabled:opacity-60"
                                >
                                    {busyId === 'hour-values' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar valores hora
                                </button>
                            </div>

                            <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="font-semibold text-sm text-slate-200">Tarifario Interno</h2>
                                    <span className="text-xs text-slate-500">{services.length} prestaciones</span>
                                </div>

                                <form onSubmit={handleCreateService} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                    <input
                                        type="text"
                                        value={newService.name}
                                        onChange={(event) => setNewService((prev) => ({ ...prev, name: event.target.value }))}
                                        placeholder="Nombre de la prestación"
                                        className="sm:col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                                    />
                                    <select
                                        value={newService.area}
                                        onChange={(event) => setNewService((prev) => ({
                                            ...prev,
                                            area: event.target.value as 'Odontología' | 'Laboratorio',
                                        }))}
                                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                                    >
                                        <option value="Odontología">Odontología</option>
                                        <option value="Laboratorio">Laboratorio</option>
                                    </select>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={newService.internalPrice}
                                            onChange={(event) => setNewService((prev) => ({ ...prev, internalPrice: event.target.value }))}
                                            placeholder="Precio"
                                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                                        />
                                        <button
                                            type="submit"
                                            disabled={busyId === 'new-service'}
                                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-medium disabled:opacity-60"
                                        >
                                            {busyId === 'new-service' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </form>

                                <div className="rounded-xl border border-slate-800 overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-950/80">
                                            <tr className="text-left text-slate-400">
                                                <th className="px-3 py-2">Prestación</th>
                                                <th className="px-3 py-2">Área</th>
                                                <th className="px-3 py-2">Precio interno</th>
                                                <th className="px-3 py-2 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {services.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                                                        No hay prestaciones internas configuradas.
                                                    </td>
                                                </tr>
                                            ) : (
                                                services.map((service) => (
                                                    <tr key={service.id} className="border-t border-slate-800">
                                                        <td className="px-3 py-2 text-slate-200">{service.name}</td>
                                                        <td className="px-3 py-2 text-slate-400">{service.area}</td>
                                                        <td className="px-3 py-2">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={servicePriceDrafts[service.id] ?? String(service.internalPrice)}
                                                                onChange={(event) => setServicePriceDrafts((prev) => ({
                                                                    ...prev,
                                                                    [service.id]: event.target.value,
                                                                }))}
                                                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <button
                                                                onClick={() => handleSaveServicePrice(service.id)}
                                                                disabled={busyId === `service-${service.id}`}
                                                                className="inline-flex items-center gap-1 rounded-md bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs"
                                                            >
                                                                {busyId === `service-${service.id}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                                Guardar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'hours' && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="font-semibold text-sm text-slate-200">Carga mensual de horas</h2>
                                <button
                                    onClick={handleSaveAllHours}
                                    disabled={busyId === 'hours-all' || providersForHours.length === 0}
                                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-2 text-sm font-medium disabled:opacity-60"
                                >
                                    {busyId === 'hours-all' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Guardar todo el mes
                                </button>
                            </div>

                            <div className="rounded-xl border border-slate-800 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-950/80">
                                        <tr className="text-left text-slate-400">
                                            <th className="px-3 py-2">Persona</th>
                                            <th className="px-3 py-2">Grupo</th>
                                            <th className="px-3 py-2">Horas del mes</th>
                                            <th className="px-3 py-2">Total estimado</th>
                                            <th className="px-3 py-2 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {providersForHours.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                                                    No hay personal en Limpieza o Staff General.
                                                </td>
                                            </tr>
                                        ) : (
                                            providersForHours.map((provider) => (
                                                <tr key={provider.id} className="border-t border-slate-800">
                                                    <td className="px-3 py-2 text-slate-100">{provider.fullName}</td>
                                                    <td className="px-3 py-2 text-slate-400">{provider.group}</td>
                                                    <td className="px-3 py-2 w-44">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step="0.25"
                                                            value={hoursDraftByProvider[provider.id] ?? ''}
                                                            onChange={(event) => setHoursDraftByProvider((prev) => ({
                                                                ...prev,
                                                                [provider.id]: event.target.value,
                                                            }))}
                                                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-200 font-medium">{formatArs(getHourlyAmount(provider))}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        <button
                                                            onClick={() => handleSaveHours(provider.id)}
                                                            disabled={busyId === `hours-${provider.id}`}
                                                            className="inline-flex items-center gap-1 rounded-md bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs"
                                                        >
                                                            {busyId === `hours-${provider.id}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                            Guardar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'services' && (
                        <div className="space-y-4">
                            {/* Summary header */}
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-400">
                                    <span className="text-white font-semibold">{serviceRecords.length}</span> prestaciones registradas en {mes}
                                </p>
                                <p className="text-sm text-slate-400">
                                    Total: <span className="text-white font-semibold">{formatArs(serviceRecords.reduce((s, r) => s + Number(r.internalPrice || 0), 0))}</span>
                                </p>
                            </div>

                            {providersForServices.length === 0 ? (
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center text-slate-500 text-sm">
                                    No hay odontólogos o laboratorio configurados.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {providersForServices.map((provider) => {
                                        const providerRecords = serviceRecords.filter(r => r.providerId === provider.id);
                                        const providerTotal = providerRecords.reduce((s, r) => s + Number(r.internalPrice || 0), 0);
                                        const isAdding = addingForProvider === provider.id;
                                        const isBusy = busyId === `inline-${provider.id}`;
                                        const providerArea = provider.group === 'Laboratorio' ? 'Laboratorio' : 'Odontología';
                                        const availableForThis = activeServices.filter(s => s.area === providerArea);

                                        return (
                                            <div key={provider.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
                                                {/* Card header */}
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
                                                    <div>
                                                        <p className="font-medium text-white text-sm">{provider.fullName}</p>
                                                        <p className="text-xs text-slate-500">{provider.group} · {providerRecords.length} prestación(es)</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {providerTotal > 0 && (
                                                            <span className="text-sm font-semibold text-emerald-300">{formatArs(providerTotal)}</span>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                if (isAdding) {
                                                                    setAddingForProvider(null);
                                                                } else {
                                                                    setInlineDraft({ serviceId: '', performedDate: todayDate() });
                                                                    setAddingForProvider(provider.id);
                                                                }
                                                            }}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                                isAdding
                                                                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                                    : 'bg-violet-700 hover:bg-violet-600 text-white'
                                                            }`}
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                            {isAdding ? 'Cancelar' : 'Agregar'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Inline add form */}
                                                {isAdding && (
                                                    <div className="px-4 py-3 bg-violet-900/10 border-b border-violet-800/30">
                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            <select
                                                                value={inlineDraft.serviceId}
                                                                onChange={e => setInlineDraft(d => ({ ...d, serviceId: e.target.value }))}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') { e.preventDefault(); void handleInlineAdd(provider.id); }
                                                                    if (e.key === 'Escape') { setAddingForProvider(null); }
                                                                }}
                                                                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                                                                autoFocus
                                                            >
                                                                <option value="">Seleccioná prestación...</option>
                                                                {availableForThis.map(s => (
                                                                    <option key={s.id} value={s.id}>
                                                                        {s.name} — {formatArs(s.internalPrice)}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <input
                                                                type="date"
                                                                value={inlineDraft.performedDate}
                                                                onChange={e => setInlineDraft(d => ({ ...d, performedDate: e.target.value }))}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') { e.preventDefault(); void handleInlineAdd(provider.id); }
                                                                    if (e.key === 'Escape') { setAddingForProvider(null); }
                                                                }}
                                                                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                                                            />
                                                            <button
                                                                onClick={() => void handleInlineAdd(provider.id)}
                                                                disabled={isBusy || !inlineDraft.serviceId}
                                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50 transition-colors flex-shrink-0"
                                                            >
                                                                {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                                Guardar
                                                            </button>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-1.5">↵ Enter para guardar · Esc para cancelar</p>
                                                    </div>
                                                )}

                                                {/* Records list */}
                                                {providerRecords.length === 0 ? (
                                                    <div className="px-4 py-5 text-center text-xs text-slate-600">
                                                        Sin prestaciones este mes. Usá "Agregar" para cargar.
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-slate-800/60">
                                                        {providerRecords.map(record => (
                                                            <div key={record.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/30 transition-colors">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm text-slate-200 truncate">{record.serviceName}</p>
                                                                    <p className="text-xs text-slate-500">{record.serviceArea} · {record.performedDate}</p>
                                                                </div>
                                                                <span className="text-sm font-medium text-white ml-3 flex-shrink-0">
                                                                    {formatArs(record.internalPrice)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'close' && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <h2 className="font-semibold text-sm text-slate-200">Resumen de liquidación · {mes}</h2>
                                <div className="text-sm text-slate-400">Total a pagar: <span className="text-white font-semibold">{formatArs(totalClosure)}</span></div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                                    Total por Horas: <span className="text-white font-semibold">{formatArs(sourceTotals.hours)}</span>
                                </div>
                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                                    Total por Prestaciones: <span className="text-white font-semibold">{formatArs(sourceTotals.services)}</span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-800 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-950/80">
                                        <tr className="text-left text-slate-400">
                                            <th className="px-3 py-2">Prestador</th>
                                            <th className="px-3 py-2">Grupo</th>
                                            <th className="px-3 py-2">Base</th>
                                            <th className="px-3 py-2">Detalle</th>
                                            <th className="px-3 py-2 text-right">Total a pagar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {closureRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                                                    No hay datos para el período seleccionado.
                                                </td>
                                            </tr>
                                        ) : (
                                            closureRows.map((row) => (
                                                <tr key={row.providerId} className="border-t border-slate-800">
                                                    <td className="px-3 py-2 text-slate-100">{row.providerName}</td>
                                                    <td className="px-3 py-2 text-slate-400">{row.group}</td>
                                                    <td className="px-3 py-2 text-slate-300">{row.source}</td>
                                                    <td className="px-3 py-2 text-slate-400">
                                                        {row.source === 'Horas'
                                                            ? `${row.hours.toLocaleString('es-AR', { maximumFractionDigits: 2 })} hs`
                                                            : `${row.servicesCount} prestación(es)`}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-white font-semibold">{formatArs(row.totalToPay)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <p className="text-xs text-slate-500">
                                El cierre es dinámico: cualquier hora o prestación agregada al mes se refleja automáticamente en este total.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </CategoriaGuard>
    );
}
