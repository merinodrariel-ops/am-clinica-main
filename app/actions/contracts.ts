'use server';

import { createClient } from '@supabase/supabase-js';
import {
    extractFolderIdFromUrl,
    createContractFromTemplate,
    ensurePatientContractFolder,
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

        return {
            success: true,
            url: finalUrl,
            fileId: finalFileId,
        };
    } catch (error) {
        console.error('Error generating automated fintech contract:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido',
        };
    }
}
