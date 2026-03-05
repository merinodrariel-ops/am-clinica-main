'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export type ProviderGroup = 'Limpieza' | 'Staff General' | 'Laboratorio' | 'Odontólogos';

export interface HourValuesConfig {
    cleaningHourValue: number;
    staffGeneralHourValue: number;
}

export interface InternalServiceItem {
    id: string;
    name: string;
    internalPrice: number;
    area: 'Odontología' | 'Laboratorio';
    active: boolean;
}

export interface ProviderOption {
    id: string;
    fullName: string;
    group: ProviderGroup;
    area: string | null;
}

export interface MonthlyHoursRow {
    providerId: string;
    totalHours: number;
}

export interface ServiceRecordListItem {
    id: string;
    providerId: string;
    providerName: string;
    serviceId: string;
    serviceName: string;
    serviceArea: 'Odontología' | 'Laboratorio';
    internalPrice: number;
    performedDate: string;
}

export interface MonthlyClosureRow {
    providerId: string;
    providerName: string;
    group: ProviderGroup;
    source: 'Horas' | 'Prestaciones';
    hours: number;
    servicesCount: number;
    totalToPay: number;
}

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

async function assertAdminAccess() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('No autenticado');
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .single();

    if (error || !profile || !['owner', 'admin'].includes(profile.categoria || '')) {
        throw new Error('Acceso denegado');
    }
}

function normalizeText(value?: string | null) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function toMonthStart(mes: string) {
    if (!/^\d{4}-\d{2}$/.test(mes)) {
        throw new Error('Mes inválido. Usar formato YYYY-MM');
    }

    return `${mes}-01`;
}

function monthBounds(mes: string) {
    const monthStart = toMonthStart(mes);
    const [year, month] = mes.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${mes}-${String(lastDay).padStart(2, '0')}`;

    return {
        start: monthStart,
        end,
    };
}

function classifyProvider(input: {
    area?: string | null;
    categoria?: string | null;
    tipo?: string | null;
    appCategoria?: string | null;
}): ProviderGroup {
    const area = normalizeText(input.area);
    const cat = normalizeText(input.categoria);
    const tipo = normalizeText(input.tipo);
    const appCategoria = normalizeText(input.appCategoria);

    if (area.includes('limpieza') || cat.includes('limpieza')) {
        return 'Limpieza';
    }

    if (
        area.includes('laboratorio')
        || cat.includes('laboratorio')
        || appCategoria === 'laboratorio'
        || area.includes('lab')
    ) {
        return 'Laboratorio';
    }

    if (
        area.includes('odont')
        || cat.includes('odont')
        || tipo === 'odontologo'
        || tipo === 'profesional'
        || appCategoria === 'odontologo'
    ) {
        return 'Odontólogos';
    }

    return 'Staff General';
}

async function getProvidersWithGroup(): Promise<ProviderOption[]> {
    const admin = getAdminClient();

    const { data: providers, error: providersError } = await admin
        .from('personal')
        .select('id, nombre, apellido, area, categoria, tipo, user_id')
        .eq('activo', true)
        .order('nombre');

    if (providersError) {
        throw new Error(providersError.message);
    }

    const rows = providers || [];
    const userIds = rows
        .map((item) => item.user_id)
        .filter((value): value is string => Boolean(value));

    let categoriaByUserId = new Map<string, string>();
    if (userIds.length > 0) {
        const { data: profiles } = await admin
            .from('profiles')
            .select('id, categoria')
            .in('id', userIds);

        categoriaByUserId = new Map((profiles || []).map((profile) => [profile.id, profile.categoria || '']));
    }

    return rows.map((provider) => {
        const appCategoria = provider.user_id ? categoriaByUserId.get(provider.user_id) || null : null;
        const group = classifyProvider({
            area: provider.area,
            categoria: provider.categoria,
            tipo: provider.tipo,
            appCategoria,
        });

        return {
            id: provider.id,
            fullName: `${provider.nombre} ${provider.apellido || ''}`.trim(),
            group,
            area: provider.area || null,
        };
    });
}

export async function getLiquidacionesConfig(): Promise<{
    hourValues: HourValuesConfig;
    services: InternalServiceItem[];
}> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const [{ data: hourValuesRow }, { data: services, error: servicesError }] = await Promise.all([
        admin
            .from('liquidacion_hour_values')
            .select('cleaning_hour_value, staff_general_hour_value')
            .eq('id', 1)
            .maybeSingle(),
        admin
            .from('internal_services')
            .select('id, name, internal_price, area, active')
            .order('area')
            .order('name'),
    ]);

    if (servicesError) {
        throw new Error(servicesError.message);
    }

    return {
        hourValues: {
            cleaningHourValue: Number(hourValuesRow?.cleaning_hour_value || 0),
            staffGeneralHourValue: Number(hourValuesRow?.staff_general_hour_value || 0),
        },
        services: (services || []).map((item) => ({
            id: item.id,
            name: item.name,
            internalPrice: Number(item.internal_price || 0),
            area: item.area,
            active: Boolean(item.active),
        })),
    };
}

export async function saveHourValues(config: HourValuesConfig): Promise<void> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const cleaning = Number(config.cleaningHourValue);
    const staff = Number(config.staffGeneralHourValue);

    if (!Number.isFinite(cleaning) || cleaning < 0) {
        throw new Error('Valor hora de Limpieza inválido');
    }

    if (!Number.isFinite(staff) || staff < 0) {
        throw new Error('Valor hora de Staff General inválido');
    }

    const { error } = await admin
        .from('liquidacion_hour_values')
        .upsert({
            id: 1,
            cleaning_hour_value: Math.round((cleaning + Number.EPSILON) * 100) / 100,
            staff_general_hour_value: Math.round((staff + Number.EPSILON) * 100) / 100,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/caja-admin/liquidaciones');
}

export async function createInternalService(input: {
    name: string;
    internalPrice: number;
    area: 'Odontología' | 'Laboratorio';
}): Promise<void> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const name = input.name.trim();
    const internalPrice = Number(input.internalPrice);

    if (!name) {
        throw new Error('Nombre de prestación obligatorio');
    }

    if (!Number.isFinite(internalPrice) || internalPrice < 0) {
        throw new Error('Precio interno inválido');
    }

    const { error } = await admin
        .from('internal_services')
        .insert({
            name,
            internal_price: Math.round((internalPrice + Number.EPSILON) * 100) / 100,
            area: input.area,
            active: true,
        });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/caja-admin/liquidaciones');
}

export async function updateInternalServicePrice(serviceId: string, internalPrice: number): Promise<void> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const parsedPrice = Number(internalPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        throw new Error('Precio interno inválido');
    }

    const { error } = await admin
        .from('internal_services')
        .update({
            internal_price: Math.round((parsedPrice + Number.EPSILON) * 100) / 100,
            updated_at: new Date().toISOString(),
        })
        .eq('id', serviceId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/caja-admin/liquidaciones');
}

export async function getProvidersForGroups(groups: ProviderGroup[]): Promise<ProviderOption[]> {
    await assertAdminAccess();
    const providers = await getProvidersWithGroup();
    const set = new Set(groups);
    return providers.filter((provider) => set.has(provider.group));
}

export async function getMonthlyHours(mes: string): Promise<MonthlyHoursRow[]> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const month = toMonthStart(mes);
    const { data, error } = await admin
        .from('provider_monthly_hours')
        .select('provider_id, total_hours')
        .eq('month', month);

    if (error) {
        throw new Error(error.message);
    }

    return (data || []).map((row) => ({
        providerId: row.provider_id,
        totalHours: Number(row.total_hours || 0),
    }));
}

export async function upsertMonthlyHours(input: {
    providerId: string;
    mes: string;
    totalHours: number;
}): Promise<void> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const totalHours = Number(input.totalHours);
    if (!Number.isFinite(totalHours) || totalHours < 0) {
        throw new Error('Horas inválidas');
    }

    const month = toMonthStart(input.mes);
    const { error } = await admin
        .from('provider_monthly_hours')
        .upsert({
            provider_id: input.providerId,
            month,
            total_hours: Math.round((totalHours + Number.EPSILON) * 100) / 100,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'provider_id,month' });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/caja-admin/liquidaciones');
}

export async function createProviderServiceRecord(input: {
    providerId: string;
    serviceId: string;
    performedDate: string;
}): Promise<void> {
    await assertAdminAccess();
    const admin = getAdminClient();

    if (!input.providerId) {
        throw new Error('Odontólogo obligatorio');
    }

    if (!input.serviceId) {
        throw new Error('Prestación obligatoria');
    }

    if (!input.performedDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.performedDate)) {
        throw new Error('Fecha de realización inválida');
    }

    const { error } = await admin
        .from('provider_service_records')
        .insert({
            provider_id: input.providerId,
            service_id: input.serviceId,
            performed_date: input.performedDate,
        });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/caja-admin/liquidaciones');
}

export async function getMonthlyServiceRecords(mes: string): Promise<ServiceRecordListItem[]> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const { start, end } = monthBounds(mes);
    const { data: records, error: recordsError } = await admin
        .from('provider_service_records')
        .select('id, provider_id, service_id, performed_date')
        .gte('performed_date', start)
        .lte('performed_date', end)
        .order('performed_date', { ascending: false })
        .limit(200);

    if (recordsError) {
        throw new Error(recordsError.message);
    }

    const providerIds = Array.from(new Set((records || []).map((row) => row.provider_id)));
    const serviceIds = Array.from(new Set((records || []).map((row) => row.service_id)));

    const [providersRes, servicesRes] = await Promise.all([
        providerIds.length > 0
            ? admin.from('personal').select('id, nombre, apellido').in('id', providerIds)
            : Promise.resolve({ data: [], error: null }),
        serviceIds.length > 0
            ? admin.from('internal_services').select('id, name, area, internal_price').in('id', serviceIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (providersRes.error) {
        throw new Error(providersRes.error.message);
    }

    if (servicesRes.error) {
        throw new Error(servicesRes.error.message);
    }

    const providerById = new Map(
        (providersRes.data || []).map((provider) => [provider.id, `${provider.nombre} ${provider.apellido || ''}`.trim()])
    );
    const serviceById = new Map(
        (servicesRes.data || []).map((service) => [service.id, service])
    );

    return (records || []).flatMap((record) => {
        const service = serviceById.get(record.service_id);
        if (!service) return [];

        return [{
            id: record.id,
            providerId: record.provider_id,
            providerName: providerById.get(record.provider_id) || 'Odontólogo desconocido',
            serviceId: record.service_id,
            serviceName: service.name,
            serviceArea: service.area,
            internalPrice: Number(service.internal_price || 0),
            performedDate: record.performed_date,
        }];
    });
}

export async function getMonthlyClosureSummary(mes: string): Promise<MonthlyClosureRow[]> {
    await assertAdminAccess();
    const admin = getAdminClient();

    const [providers, config, hoursRows] = await Promise.all([
        getProvidersWithGroup(),
        getLiquidacionesConfig(),
        getMonthlyHours(mes),
    ]);

    const hoursByProvider = new Map(hoursRows.map((row) => [row.providerId, row.totalHours]));
    const providerIds = providers.map((provider) => provider.id);

    let serviceTotalsByProvider = new Map<string, { total: number; count: number }>();

    if (providerIds.length > 0) {
        const { start, end } = monthBounds(mes);
        const { data: serviceRecords, error: recordsError } = await admin
            .from('provider_service_records')
            .select('provider_id, service_id, performed_date')
            .in('provider_id', providerIds)
            .gte('performed_date', start)
            .lte('performed_date', end);

        if (recordsError) {
            throw new Error(recordsError.message);
        }

        const serviceIds = Array.from(new Set((serviceRecords || []).map((record) => record.service_id)));
        const servicePriceById = new Map<string, number>();

        if (serviceIds.length > 0) {
            const { data: services, error: servicesError } = await admin
                .from('internal_services')
                .select('id, internal_price')
                .in('id', serviceIds);

            if (servicesError) {
                throw new Error(servicesError.message);
            }

            (services || []).forEach((service) => {
                servicePriceById.set(service.id, Number(service.internal_price || 0));
            });
        }

        serviceTotalsByProvider = (serviceRecords || []).reduce((acc, record) => {
            const current = acc.get(record.provider_id) || { total: 0, count: 0 };
            const price = servicePriceById.get(record.service_id) || 0;

            acc.set(record.provider_id, {
                total: Math.round((current.total + price + Number.EPSILON) * 100) / 100,
                count: current.count + 1,
            });

            return acc;
        }, new Map<string, { total: number; count: number }>());
    }

    const summaryRows = providers.map((provider) => {
        if (provider.group === 'Limpieza' || provider.group === 'Staff General') {
            const hours = Number(hoursByProvider.get(provider.id) || 0);
            const hourValue = provider.group === 'Limpieza'
                ? Number(config.hourValues.cleaningHourValue || 0)
                : Number(config.hourValues.staffGeneralHourValue || 0);

            const total = Math.round((hours * hourValue + Number.EPSILON) * 100) / 100;
            return {
                providerId: provider.id,
                providerName: provider.fullName,
                group: provider.group,
                source: 'Horas' as const,
                hours,
                servicesCount: 0,
                totalToPay: total,
            };
        }

        const services = serviceTotalsByProvider.get(provider.id) || { total: 0, count: 0 };
        return {
            providerId: provider.id,
            providerName: provider.fullName,
            group: provider.group,
            source: 'Prestaciones' as const,
            hours: 0,
            servicesCount: services.count,
            totalToPay: Math.round((services.total + Number.EPSILON) * 100) / 100,
        };
    });

    summaryRows.sort((a, b) => {
        if (b.totalToPay !== a.totalToPay) return b.totalToPay - a.totalToPay;
        return a.providerName.localeCompare(b.providerName, 'es', { sensitivity: 'base' });
    });

    return summaryRows;
}
