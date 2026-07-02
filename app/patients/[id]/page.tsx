import { getPacienteById, getHistoriaClinica, getPlanesTratamiento } from '@/lib/patients';
import { createClient } from '@/utils/supabase/server';
import PatientDashboard from '@/components/patients/PatientDashboard';
import { getPrestacionesByPaciente } from '@/app/actions/prestaciones';
import { getMovimientosPorPaciente } from '@/lib/caja-recepcion';
import type { PlanFinanciacion } from '@/lib/financiacion';
import { getPatientDesignReview } from '@/app/actions/design-review';
import { getUserAppProfile } from '@/app/actions/worker-portal';
import { canViewPatientContactData, canViewPatientFinancialData, canViewPatientRecords } from '@/lib/patient-access';
import { createAdminClient } from '@/utils/supabase/admin';

export const revalidate = 0; // Always get fresh data

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await createClient();
    const appProfile = await getUserAppProfile();
    const role = appProfile?.categoria || '';
    const canViewFinancialData = canViewPatientFinancialData(role);
    const canViewContactData = canViewPatientContactData(role);

    if (!canViewPatientRecords(role)) {
        return (
            <div className="p-10 text-center">
                <h2 className="text-xl font-bold text-red-500 mb-2">Acceso denegado</h2>
                <p className="text-gray-600">Tu usuario no tiene permiso para ver pacientes.</p>
            </div>
        );
    }

    const adminSupabase = createAdminClient();

    let patient;
    let historiaClinica;
    let planes;
    let payments;
    let appointments;
    let prestaciones;
    let financingPlan: PlanFinanciacion | null = null;
    let designReview: Awaited<ReturnType<typeof getPatientDesignReview>>['review'] = null;
    let errorMsg;

    try {
        // Fetch patient from Supabase
        patient = await getPacienteById(adminSupabase, id);

        if (patient) {
            // Fetch related data
            const relatedData = await Promise.all([
                getHistoriaClinica(adminSupabase, id),
                adminSupabase
                    .from('agenda_appointments')
                    .select('id, patient_id, doctor_id, start_time, status, type')
                    .eq('patient_id', id)
                    .order('start_time', { ascending: false }),
                canViewFinancialData ? getPlanesTratamiento(adminSupabase, id) : Promise.resolve([]),
                canViewFinancialData ? getMovimientosPorPaciente(id, adminSupabase) : Promise.resolve([]),
                canViewFinancialData ? getPrestacionesByPaciente(id) : Promise.resolve([]),
            ]);

            historiaClinica = relatedData[0];
            appointments = relatedData[1].data || [];
            planes = relatedData[2];
            payments = relatedData[3] || [];
            prestaciones = relatedData[4];

            if (canViewFinancialData) {
                const { data: fpData } = await adminSupabase
                    .from('planes_financiacion')
                    .select('*')
                    .eq('paciente_id', id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                financingPlan = fpData as PlanFinanciacion | null;
            }

            const { review: dr } = await getPatientDesignReview(patient.id_paciente);
            designReview = dr;
        }
    } catch (error) {
        console.error('Error fetching patient details:', error);
        errorMsg = error instanceof Error ? error.message : 'Error desconocido';
    }

    if (errorMsg) {
        return (
            <div className="p-10 text-center">
                <h2 className="text-xl font-bold text-red-500 mb-2">Error</h2>
                <p className="text-gray-600">No se pudo cargar el paciente.</p>
                <p className="text-xs text-gray-400 mt-2">{errorMsg}</p>
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="p-10 text-center">
                <h2 className="text-xl font-bold text-red-500 mb-2">Paciente no encontrado</h2>
                <p className="text-gray-600">El ID del paciente no existe en la base de datos.</p>
            </div>
        );
    }

    const safePatient = {
        ...patient,
        ...(!canViewContactData ? {
            documento: undefined,
            fecha_nacimiento: undefined,
            email: undefined,
            whatsapp: undefined,
            whatsapp_pais_code: undefined,
            whatsapp_numero: undefined,
            cuit: undefined,
            direccion: undefined,
            domicilio: undefined,
        } : {}),
        ...(!canViewFinancialData ? {
            financ_estado: undefined,
            financ_monto_total: undefined,
            financ_cuotas_total: undefined,
            saldo_a_favor_usd: undefined,
            presupuesto_total: undefined,
        } : {}),
    };

    return (
        <PatientDashboard
            patient={safePatient}
            historiaClinica={historiaClinica || []}
            planes={planes || []}
            payments={payments || []}
            appointments={appointments || []}
            prestaciones={prestaciones || []}
            financingPlan={financingPlan}
            designReview={designReview}
        />
    );
}
