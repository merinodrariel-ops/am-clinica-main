'use server';

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import {
    extractFolderIdFromUrl,
    createContractFromTemplate,
    ensurePatientContractFolder,
    getDriveItemAccess,
} from '@/lib/google-drive';
import {
    calculateFinancingBreakdown,
    DEFAULT_MONTHLY_INTEREST_PCT,
    formatArs,
    formatUsd,
} from '@/lib/financial-engine';
import { formatIsoDateEsAr, getContractSchedule } from '@/lib/contract-dates';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CONTRACT_TEMPLATE_ID = process.env.GOOGLE_CONTRACT_TEMPLATE_ID || '11HPtw303cEzTCITOwPqmJLxxpxIB6-1up0dMjuW15zc';

export interface SimulationData {
    tratamiento: string;
    montoTotal: number;
    anticipo: number;
    cuotas: number;
    valorCuota: number;
    vencimiento: string;
}

export interface AutomatedContractInput {
    patientId: string;
    tratamiento: string;
    totalUsd: number;
    anticipoPct: number;
    cuotas: number;
    bnaVenta: number;
    simulationId?: string;
}

export type FinancingSimulationStatus = 'shared' | 'selected' | 'contracted' | 'expired';

export interface FinancingSimulationRecord {
    id: string;
    patientId: string;
    treatment: string;
    totalUsd: number;
    bnaVentaArs: number;
    monthlyInterestPct: number;
    baseInstallments: number;
    allowedInstallmentOptions: number[];
    allowedUpfrontOptions: number[];
    status: FinancingSimulationStatus;
    selectedInstallments: number | null;
    selectedUpfrontPct: number | null;
    selectedAt: string | null;
    shareToken: string;
    shareUrl: string;
    expiresAt: string;
    createdAt: string;
}

export interface FinancingSimulationPreset {
    simulationId: string;
    treatment: string;
    totalUsd: number;
    bnaVentaArs: number;
    installments: number;
    upfrontPct: number;
    status: FinancingSimulationStatus;
    shareUrl: string;
    expiresAt: string;
}

export interface RecentFinancingSelectionPatient {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    documento: string | null;
    cuit: string | null;
    fecha_nacimiento: string | null;
    email: string | null;
    whatsapp: string | null;
    direccion: string | null;
    presupuesto_total: number | null;
}

export interface RecentFinancingSelectionRecord {
    simulationId: string;
    patientId: string;
    treatment: string;
    selectedAt: string;
    shareUrl: string;
    patient: RecentFinancingSelectionPatient;
}

export interface CreateFinancingSimulationInput {
    patientId: string;
    treatment: string;
    totalUsd: number;
    bnaVentaArs: number;
    baseInstallments: number;
    allowedInstallmentOptions?: number[];
    allowedUpfrontOptions?: number[];
    expiresInDays?: number;
}

function getPublicAppUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
    if (fromEnv && !fromEnv.includes('localhost')) {
        return fromEnv.replace(/\/$/, '');
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return 'https://am-clinica-main.vercel.app';
}

function clampInstallments(value: number): number {
    const safe = Math.round(value);
    if ([3, 6, 12].includes(safe)) return safe;
    return 12;
}

function normalizeSimulationOptions(raw: unknown, fallback: number[]): number[] {
    if (!Array.isArray(raw)) return [...fallback];
    const parsed = raw
        .map((item) => Number(item))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.round(value));

    const unique = Array.from(new Set(parsed));
    return unique.length > 0 ? unique : [...fallback];
}

function buildSimulationShareUrl(token: string): string {
    return `${getPublicAppUrl()}/simulador/${token}`;
}

function mapSimulationRow(row: Record<string, unknown>): FinancingSimulationRecord {
    return {
        id: String(row.id || ''),
        patientId: String(row.patient_id || ''),
        treatment: String(row.treatment || ''),
        totalUsd: Number(row.total_usd || 0),
        bnaVentaArs: Number(row.bna_venta_ars || 0),
        monthlyInterestPct: Number(row.monthly_interest_pct || DEFAULT_MONTHLY_INTEREST_PCT),
        baseInstallments: Number(row.base_installments || 12),
        allowedInstallmentOptions: normalizeSimulationOptions(row.allowed_installment_options, [3, 6, 12]),
        allowedUpfrontOptions: normalizeSimulationOptions(row.allowed_upfront_options, [30, 40, 50]),
        status: (row.status || 'shared') as FinancingSimulationStatus,
        selectedInstallments: row.selected_installments ? Number(row.selected_installments) : null,
        selectedUpfrontPct: row.selected_upfront_pct ? Number(row.selected_upfront_pct) : null,
        selectedAt: row.selected_at ? String(row.selected_at) : null,
        shareToken: String(row.share_token || ''),
        shareUrl: buildSimulationShareUrl(String(row.share_token || '')),
        expiresAt: String(row.expires_at || ''),
        createdAt: String(row.created_at || ''),
    };
}

export interface ContractMakerReadinessInput {
    patientId: string;
    bnaVenta: number;
}

export interface ContractMakerReadinessResult {
    success: boolean;
    ready: boolean;
    checks: {
        paciente: { ok: boolean; detail: string };
        cotizacion: { ok: boolean; detail: string };
        carpeta: { ok: boolean; detail: string; url?: string };
        plantilla: { ok: boolean; detail: string; url?: string };
    };
    error?: string;
}

interface PatientContractData {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    documento: string | null;
    direccion: string | null;
    email: string | null;
    cuit?: string | null;
    link_historia_clinica: string | null;
    observaciones_generales: string | null;
}

function buildFintechTemplatePlaceholders(
    patient: PatientContractData,
    input: AutomatedContractInput,
    quote: ReturnType<typeof calculateFinancingBreakdown>,
    contractDateDisplay: string,
    firstDueDateDisplay: string
): Record<string, string> {
    const nombre = patient.nombre || '';
    const apellido = patient.apellido || '';
    const nombreCompleto = `${nombre} ${apellido}`.trim();
    const fechaContrato = contractDateDisplay;
    const anticipoLabel = `Anticipo Simulado (${Math.round(input.anticipoPct)}%)`;

    return {
        FECHA_CONTRATO: fechaContrato,
        PACIENTE_NOMBRE: nombreCompleto,
        PACIENTE_DOCUMENTO: patient.documento || '-',
        PACIENTE_DOMICILIO: patient.direccion || '-',
        PACIENTE_EMAIL: patient.email || '-',
        TRATAMIENTO: input.tratamiento,
        MONTO_TOTAL_USD: formatUsd(quote.totalUsd),
        MONTO_TOTAL_ARS: formatArs(quote.totalArs),
        ANTICIPO_PCT: String(Math.round(input.anticipoPct)),
        ANTICIPO_USD: formatUsd(quote.upfrontUsd),
        ANTICIPO_ARS: formatArs(quote.upfrontArs),
        SALDO_FINANCIADO_USD: formatUsd(quote.financedPrincipalUsd),
        SALDO_FINANCIADO_ARS: formatArs(quote.financedTotalArs),
        CUOTAS: String(quote.installments),
        CUOTA_USD: formatUsd(quote.installmentUsd),
        CUOTA_ARS: formatArs(quote.installmentArs),
        INTERES_MENSUAL_PCT: quote.monthlyInterestPct.toFixed(2),
        PUNITORIO_DIARIO_PCT: quote.dailyPenaltyPct.toFixed(2),
        PUNITORIO_DIARIO_CUOTA_USD: formatUsd(quote.dailyPenaltyPerInstallmentUsd),
        PUNITORIO_DIARIO_CUOTA_ARS: formatArs(quote.dailyPenaltyPerInstallmentArs),
        BNA_VENTA: formatArs(quote.bnaVentaArs),
        FECHA_PRIMERA_CUOTA: firstDueDateDisplay,
        METODO_FIRMA: 'Firma olografa (puno y letra) de ambas partes.',

        // Legacy placeholders for current template compatibility
        FechaActual: fechaContrato,
        Nombre: nombre,
        Apellido: apellido,
        DNI: patient.documento || '-',
        Direccion: patient.direccion || '-',
        'CUIT/CUIL': patient.cuit || '-',
        Email: patient.email || '-',
        'Tratamiento Elegido': input.tratamiento,
        'Monto Total Simulado': formatUsd(quote.totalUsd),
        [anticipoLabel]: formatUsd(quote.upfrontUsd),
        'Anticipo Simulado (30%)': formatUsd(quote.upfrontUsd),
        'Anticipo Simulado (40%)': formatUsd(quote.upfrontUsd),
        'Anticipo Simulado (50%)': formatUsd(quote.upfrontUsd),
        'Monto a Financiar Simulado': formatUsd(quote.financedPrincipalUsd),
        'Plan de Cuotas Elegido': String(quote.installments),
        'Valor de Cuota Elegido': formatUsd(quote.installmentUsd),
        FechaVencimientoCuota: firstDueDateDisplay,
    };
}

/**
 * Checks the credit status (Situation) based on CUIT
 * Currently a mock implementation for "Situation 1" check
 */
export async function checkCreditStatusAction(cuit: string): Promise<{ success: boolean; situation: number; message: string }> {
    try {
        if (!cuit) throw new Error('CUIT is required');

        // Mocking BCRA Sit 1: Always return 1 for demo purposes
        // In a real scenario, this would call an external API or scrap the BCRA site
        return {
            success: true,
            situation: 1,
            message: 'El contribuyente se encuentra en Situación 1 (Normal).'
        };
    } catch (error) {
        return {
            success: false,
            situation: 0,
            message: error instanceof Error ? error.message : 'Error al verificar situación'
        };
    }
}

/**
 * Generates the contract document in the patient's Drive folder
 */
export async function generateContractAction(patientId: string, sim: SimulationData) {
    try {
        // 1. Fetch patient data
        const { data: patient, error: fetchError } = await supabase
            .from('pacientes')
            .select('*')
            .eq('id_paciente', patientId)
            .single();

        if (fetchError || !patient) throw new Error('Patient not found');

        // 2. Resolve Drive folder
        const motherFolderId = extractFolderIdFromUrl(patient.link_historia_clinica);
        if (!motherFolderId) throw new Error('Patient mother folder not found');

        // 3. Prepare Placeholders
        const placeholders: Record<string, string> = {
            'FechaActual': new Date().toLocaleDateString('es-AR'),
            'Nombre': patient.nombre,
            'Apellido': patient.apellido,
            'DNI': patient.documento || '',
            'Direccion': patient.direccion || '',
            'CUIT/CUIL': patient.cuit || '',
            'Email': patient.email || '',
            'Tratamiento Elegido': sim.tratamiento,
            'Monto Total Simulado': `$${sim.montoTotal.toLocaleString('es-AR')}`,
            'Anticipo Simulado (50%)': `$${sim.anticipo.toLocaleString('es-AR')}`,
            'Monto a Financiar Simulado': `$${(sim.montoTotal - sim.anticipo).toLocaleString('es-AR')}`,
            'Plan de Cuotas Elegido': `${sim.cuotas}`,
            'Valor de Cuota Elegido': `$${sim.valorCuota.toLocaleString('es-AR')}`,
            'FechaVencimientoCuota': sim.vencimiento,
        };

        // 4. Generate Document
        const fileName = `Contrato - ${patient.apellido}, ${patient.nombre}`;
        const result = await createContractFromTemplate(motherFolderId, CONTRACT_TEMPLATE_ID, fileName, placeholders);

        if (result.error) throw new Error(result.error);

        // 5. Update patient (optional: store contract link)
        await supabase
            .from('pacientes')
            .update({
                observaciones_generales: `${patient.observaciones_generales || ''}\n[CONTRATO GENERADO: ${new Date().toLocaleDateString('es-AR')}]`
            })
            .eq('id_paciente', patientId);

        return { success: true, url: result.docUrl };
    } catch (error) {
        console.error('Error generating contract:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
}

/**
 * Generates the fintech contract in the patient's mother Google Drive folder.
 * Output: Google Doc based strictly on the legal base template.
 */
export async function generateAutomatedContractToDriveAction(input: AutomatedContractInput): Promise<{
    success: boolean;
    url?: string;
    fileId?: string;
    error?: string;
}> {
    try {
        if (!input.patientId) throw new Error('patientId es requerido');
        if (!input.tratamiento?.trim()) throw new Error('El tratamiento es requerido');
        if (!Number.isFinite(input.totalUsd) || input.totalUsd <= 0) {
            throw new Error('El monto total en USD debe ser mayor a cero');
        }
        const anticipoNormalizado = Math.round(input.anticipoPct);
        if (anticipoNormalizado < 30 || anticipoNormalizado > 90) {
            throw new Error('El anticipo debe estar entre 30% y 90%');
        }
        const cuotasNormalizadas = Math.round(input.cuotas);
        if (![3, 6, 12].includes(cuotasNormalizadas)) {
            throw new Error('La cantidad de cuotas solo puede ser 3, 6 o 12');
        }
        if (!Number.isFinite(input.bnaVenta) || input.bnaVenta <= 0) {
            throw new Error('La cotizacion BNA Venta no es valida');
        }

        const { data: patient, error: fetchError } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento, direccion, email, cuit, link_historia_clinica, observaciones_generales')
            .eq('id_paciente', input.patientId)
            .single();

        if (fetchError || !patient) throw new Error('Paciente no encontrado');

        const motherFolderIdFromPatient = extractFolderIdFromUrl(patient.link_historia_clinica);

        const folderSetup = await ensurePatientContractFolder(
            patient.apellido || '',
            patient.nombre || '',
            motherFolderIdFromPatient || undefined
        );

        if (folderSetup.error || !folderSetup.motherFolderId || !folderSetup.contractFolderId) {
            throw new Error(folderSetup.error || 'No se pudo preparar carpeta madre y subcarpeta de contrato');
        }

        const contractFolderId = folderSetup.contractFolderId;

        // Si el paciente no tenia carpeta madre válida, la guardamos automáticamente
        if (folderSetup.motherFolderUrl && patient.link_historia_clinica !== folderSetup.motherFolderUrl) {
            await supabase
                .from('pacientes')
                .update({ link_historia_clinica: folderSetup.motherFolderUrl })
                .eq('id_paciente', input.patientId);
        }

        const quote = calculateFinancingBreakdown({
            totalUsd: input.totalUsd,
            upfrontPct: anticipoNormalizado,
            installments: cuotasNormalizadas,
            monthlyInterestPct: DEFAULT_MONTHLY_INTEREST_PCT,
            bnaVentaArs: input.bnaVenta,
        });

        const schedule = getContractSchedule();
        const contractDateDisplay = formatIsoDateEsAr(schedule.contractDateIso);
        const firstDueDateDisplay = formatIsoDateEsAr(schedule.firstDueDateIso);

        const placeholders = buildFintechTemplatePlaceholders(
            patient,
            input,
            quote,
            contractDateDisplay,
            firstDueDateDisplay
        );

        const contractDate = new Date().toISOString().split('T')[0];
        const docFileName = `Contrato Financiacion - ${patient.apellido || 'Paciente'}, ${patient.nombre || ''} - ${contractDate}`;

        const docResult = await createContractFromTemplate(
            contractFolderId,
            CONTRACT_TEMPLATE_ID,
            docFileName,
            placeholders
        );

        if (docResult.error || !docResult.docUrl || !docResult.docId) {
            throw new Error(
                docResult.error ||
                'No se pudo generar el contrato desde la plantilla legal base. Verifica GOOGLE_CONTRACT_TEMPLATE_ID.'
            );
        }

        const finalUrl = docResult.docUrl;
        const finalFileId = docResult.docId;

        if (finalUrl) {
            const previousNotes = patient.observaciones_generales || '';
            const note = `[CONTRATO FINTECH GENERADO ${new Date().toLocaleDateString('es-AR')} · FIRMA MANUSCRITA]: ${finalUrl}`;
            const nextNotes = previousNotes ? `${previousNotes}\n${note}` : note;

            await supabase
                .from('pacientes')
                .update({ observaciones_generales: nextNotes })
                .eq('id_paciente', input.patientId);
        }

        if (input.simulationId) {
            await supabase
                .from('financing_simulations')
                .update({
                    status: 'contracted',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', input.simulationId)
                .eq('patient_id', input.patientId);
        }

        return {
            success: true,
            url: finalUrl,
            fileId: finalFileId,
        };
    } catch (error) {
        console.error('Error generating automated fintech contract:', error);
        const message = error instanceof Error ? error.message : 'Error desconocido';

        if (/quota|storage quota|insufficient storage/i.test(message)) {
            return {
                success: false,
                error: 'Google Drive sin espacio (cuota agotada) en la cuenta integradora. Solucion: liberar espacio/ vaciar papelera de esa cuenta o mover la carpeta de contratos a un Shared Drive con espacio.',
            };
        }

        return {
            success: false,
            error: message,
        };
    }
}

export async function createFinancingSimulationAction(input: CreateFinancingSimulationInput): Promise<{
    success: boolean;
    simulation?: FinancingSimulationRecord;
    error?: string;
}> {
    try {
        if (!input.patientId) {
            throw new Error('Falta seleccionar paciente');
        }
        if (!input.treatment?.trim()) {
            throw new Error('El tratamiento es requerido');
        }
        if (!Number.isFinite(input.totalUsd) || input.totalUsd <= 0) {
            throw new Error('Monto total USD inválido');
        }
        if (!Number.isFinite(input.bnaVentaArs) || input.bnaVentaArs <= 0) {
            throw new Error('Cotización BNA inválida');
        }

        const baseInstallments = clampInstallments(input.baseInstallments);
        const allowedInstallmentOptions = normalizeSimulationOptions(input.allowedInstallmentOptions, [3, 6, 12])
            .filter((value) => [3, 6, 12].includes(value));
        const allowedUpfrontOptions = normalizeSimulationOptions(input.allowedUpfrontOptions, [30, 40, 50])
            .filter((value) => value >= 30 && value <= 90);

        const expiresInDays = Math.min(30, Math.max(1, Math.floor(Number(input.expiresInDays || 14))));
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

        const { data: patient, error: patientError } = await supabase
            .from('pacientes')
            .select('id_paciente')
            .eq('id_paciente', input.patientId)
            .single();

        if (patientError || !patient) {
            throw new Error('Paciente no encontrado');
        }

        let insertedRow: Record<string, unknown> | null = null;
        let lastErrorMessage = '';

        for (let i = 0; i < 3; i++) {
            const shareToken = randomBytes(18).toString('base64url');
            const { data, error } = await supabase
                .from('financing_simulations')
                .insert({
                    patient_id: input.patientId,
                    treatment: input.treatment.trim(),
                    total_usd: input.totalUsd,
                    bna_venta_ars: input.bnaVentaArs,
                    monthly_interest_pct: DEFAULT_MONTHLY_INTEREST_PCT,
                    base_installments: baseInstallments,
                    allowed_installment_options: allowedInstallmentOptions,
                    allowed_upfront_options: allowedUpfrontOptions,
                    status: 'shared',
                    share_token: shareToken,
                    expires_at: expiresAt,
                    shared_at: new Date().toISOString(),
                })
                .select('*')
                .single();

            if (!error && data) {
                insertedRow = data as Record<string, unknown>;
                break;
            }

            lastErrorMessage = String(error?.message || '');
            if (!lastErrorMessage.toLowerCase().includes('duplicate')) {
                break;
            }
        }

        if (!insertedRow) {
            throw new Error(lastErrorMessage || 'No se pudo crear la simulación compartible');
        }

        return {
            success: true,
            simulation: mapSimulationRow(insertedRow),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

export async function listFinancingSimulationsByPatientAction(patientId: string): Promise<{
    success: boolean;
    simulations: FinancingSimulationRecord[];
    error?: string;
}> {
    try {
        if (!patientId) {
            return { success: true, simulations: [] };
        }

        const { data, error } = await supabase
            .from('financing_simulations')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(40);

        if (error) {
            throw new Error(error.message);
        }

        return {
            success: true,
            simulations: (data || []).map(mapSimulationRow),
        };
    } catch (error) {
        return {
            success: false,
            simulations: [],
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

export async function listRecentFinancingSelectionsAction(input?: {
    hours?: number;
    limit?: number;
}): Promise<{
    success: boolean;
    items: RecentFinancingSelectionRecord[];
    error?: string;
}> {
    try {
        const hours = Math.max(1, Math.min(168, Math.floor(Number(input?.hours || 24))));
        const limit = Math.max(1, Math.min(30, Math.floor(Number(input?.limit || 12))));
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const { data: selections, error: selectionError } = await supabase
            .from('financing_simulations')
            .select('id, patient_id, treatment, selected_at, share_token, status')
            .eq('status', 'selected')
            .gte('selected_at', since)
            .order('selected_at', { ascending: false })
            .limit(limit);

        if (selectionError) {
            throw new Error(selectionError.message);
        }

        if (!selections || selections.length === 0) {
            return { success: true, items: [] };
        }

        const patientIds = Array.from(new Set(selections.map((row) => String(row.patient_id)).filter(Boolean)));

        const { data: patients, error: patientError } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, documento, cuit, fecha_nacimiento, email, whatsapp, direccion, presupuesto_total, is_deleted')
            .in('id_paciente', patientIds)
            .eq('is_deleted', false);

        if (patientError) {
            throw new Error(patientError.message);
        }

        const patientById = new Map<string, RecentFinancingSelectionPatient>();
        for (const patient of patients || []) {
            patientById.set(String(patient.id_paciente), {
                id_paciente: String(patient.id_paciente),
                nombre: patient.nombre || null,
                apellido: patient.apellido || null,
                documento: patient.documento || null,
                cuit: patient.cuit || null,
                fecha_nacimiento: patient.fecha_nacimiento || null,
                email: patient.email || null,
                whatsapp: patient.whatsapp || null,
                direccion: patient.direccion || null,
                presupuesto_total: patient.presupuesto_total ? Number(patient.presupuesto_total) : null,
            });
        }

        const items: RecentFinancingSelectionRecord[] = (selections || [])
            .map((row) => {
                const patientId = String(row.patient_id || '');
                const patient = patientById.get(patientId);
                if (!patient || !row.selected_at) return null;

                return {
                    simulationId: String(row.id),
                    patientId,
                    treatment: String(row.treatment || ''),
                    selectedAt: String(row.selected_at),
                    shareUrl: buildSimulationShareUrl(String(row.share_token || '')),
                    patient,
                };
            })
            .filter((item): item is RecentFinancingSelectionRecord => item !== null);

        return {
            success: true,
            items,
        };
    } catch (error) {
        return {
            success: false,
            items: [],
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

export async function getFinancingSimulationPresetAction(
    patientId: string,
    simulationId: string
): Promise<{
    success: boolean;
    preset?: FinancingSimulationPreset;
    error?: string;
}> {
    try {
        if (!patientId || !simulationId) {
            throw new Error('Faltan datos para cargar simulación');
        }

        const { data, error } = await supabase
            .from('financing_simulations')
            .select('*')
            .eq('id', simulationId)
            .eq('patient_id', patientId)
            .single();

        if (error || !data) {
            throw new Error('Simulación no encontrada');
        }

        const mapped = mapSimulationRow(data);
        const upfrontPct = mapped.selectedUpfrontPct || mapped.allowedUpfrontOptions[0] || 30;
        const installments = mapped.selectedInstallments || mapped.baseInstallments || 12;

        return {
            success: true,
            preset: {
                simulationId: mapped.id,
                treatment: mapped.treatment,
                totalUsd: mapped.totalUsd,
                bnaVentaArs: mapped.bnaVentaArs,
                installments,
                upfrontPct,
                status: mapped.status,
                shareUrl: mapped.shareUrl,
                expiresAt: mapped.expiresAt,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}

export async function checkContractMakerReadinessAction(
    input: ContractMakerReadinessInput
): Promise<ContractMakerReadinessResult> {
    const fail = (message: string): ContractMakerReadinessResult => ({
        success: false,
        ready: false,
        checks: {
            paciente: { ok: false, detail: message },
            cotizacion: { ok: false, detail: 'Sin validar' },
            carpeta: { ok: false, detail: 'Sin validar' },
            plantilla: { ok: false, detail: 'Sin validar' },
        },
        error: message,
    });

    try {
        if (!input.patientId) {
            return fail('Falta seleccionar paciente');
        }

        const { data: patient, error: fetchError } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, link_historia_clinica')
            .eq('id_paciente', input.patientId)
            .single();

        if (fetchError || !patient) {
            return fail('Paciente no encontrado');
        }

        const motherFolderIdFromPatient = extractFolderIdFromUrl(patient.link_historia_clinica);
        const folderSetup = await ensurePatientContractFolder(
            patient.apellido || '',
            patient.nombre || '',
            motherFolderIdFromPatient || undefined
        );

        if (folderSetup.error || !folderSetup.contractFolderId) {
            return {
                success: true,
                ready: false,
                checks: {
                    paciente: { ok: true, detail: 'Paciente seleccionado' },
                    cotizacion: {
                        ok: Number.isFinite(input.bnaVenta) && input.bnaVenta > 0,
                        detail: Number.isFinite(input.bnaVenta) && input.bnaVenta > 0
                            ? 'Cotizacion BNA Venta valida'
                            : 'Cotizacion BNA Venta invalida',
                    },
                    carpeta: {
                        ok: false,
                        detail: folderSetup.error || 'No se pudo crear/verificar carpeta de contrato',
                    },
                    plantilla: { ok: false, detail: 'Sin validar' },
                },
            };
        }

        if (folderSetup.motherFolderUrl && patient.link_historia_clinica !== folderSetup.motherFolderUrl) {
            await supabase
                .from('pacientes')
                .update({ link_historia_clinica: folderSetup.motherFolderUrl })
                .eq('id_paciente', input.patientId);
        }

        const templateAccess = await getDriveItemAccess(CONTRACT_TEMPLATE_ID);
        const templateMimeType = 'application/vnd.google-apps.document';
        const templateMimeOk = templateAccess.ok && templateAccess.mimeType === templateMimeType;

        const cotizacionOk = Number.isFinite(input.bnaVenta) && input.bnaVenta > 0;

        const checks: ContractMakerReadinessResult['checks'] = {
            paciente: { ok: true, detail: 'Paciente seleccionado' },
            cotizacion: {
                ok: cotizacionOk,
                detail: cotizacionOk
                    ? 'Cotizacion BNA Venta valida'
                    : 'Cotizacion BNA Venta invalida',
            },
            carpeta: {
                ok: true,
                detail: 'Carpeta madre y subcarpeta de contrato listas',
                url: folderSetup.contractFolderUrl || folderSetup.motherFolderUrl,
            },
            plantilla: {
                ok: templateMimeOk,
                detail: templateMimeOk
                    ? 'Plantilla legal accesible'
                    : templateAccess.ok
                        ? 'La plantilla configurada no es un Google Doc'
                        : templateAccess.error || 'No se puede acceder a la plantilla legal',
                url: templateAccess.webViewLink,
            },
        };

        return {
            success: true,
            ready: checks.paciente.ok && checks.cotizacion.ok && checks.carpeta.ok && checks.plantilla.ok,
            checks,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        return fail(message);
    }
}
