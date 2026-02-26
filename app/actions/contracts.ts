'use server';

import { createClient } from '@supabase/supabase-js';
import { extractFolderIdFromUrl, createContractFromTemplate } from '@/lib/google-drive';
import { Paciente } from '@/lib/patients';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CONTRACT_TEMPLATE_ID = '11HPtw303cEzTCITOwPqmJLxxpxIB6-1up0dMjuW15zc';

export interface SimulationData {
    tratamiento: string;
    montoTotal: number;
    anticipo: number;
    cuotas: number;
    valorCuota: number;
    vencimiento: string;
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
