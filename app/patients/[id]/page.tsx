import { getPacienteById, getHistoriaClinica, getPlanesTratamiento } from '@/lib/patients';
import { createClient } from '@/utils/supabase/server';
import PatientDashboard from '@/components/patients/PatientDashboard';
import { getPrestacionesByPaciente } from '@/app/actions/prestaciones';
import { getMovimientosPorPaciente } from '@/lib/caja-recepcion';
import type { PlanFinanciacion } from '@/lib/financiacion';
import { getPatientDesignReview } from '@/app/actions/design-review';

export const revalidate = 0; // Always get fresh data

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();

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
        patient = await getPacienteById(supabase, id);

        if (patient) {
            // Fetch related data
            const relatedData = await Promise.all([
                getHistoriaClinica(supabase, id),
                getPlanesTratamiento(supabase, id),
                getMovimientosPorPaciente(id, supabase),
                supabase
                    .from('agenda_appointments')
                    .select('id, patient_id, doctor_id, start_time, status, type')
                    .eq('patient_id', id)
                    .order('start_time', { ascending: false }),
                getPrestacionesByPaciente(id),
            ]);

            historiaClinica = relatedData[0];
            planes = relatedData[1];
            payments = relatedData[2] || [];
            appointments = relatedData[3].data || [];
            prestaciones = relatedData[4];

            const { data: fpData } = await supabase
                .from('planes_financiacion')
                .select('*')
                .eq('paciente_id', id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            financingPlan = fpData as PlanFinanciacion | null;

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

    return (
        <PatientDashboard
            patient={patient}
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
