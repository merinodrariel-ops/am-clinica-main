import { getPacienteById, getHistoriaClinica, getPlanesTratamiento } from '@/lib/patients';
import { createClient } from '@/utils/supabase/server';
import PatientDashboard from '@/components/patients/PatientDashboard';
import { getPrestacionesByPaciente } from '@/app/actions/prestaciones';

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
    let errorMsg;

    try {
        // Fetch patient from Supabase
        patient = await getPacienteById(id);

        if (patient) {
            // Fetch related data
            const relatedData = await Promise.all([
                getHistoriaClinica(id),
                getPlanesTratamiento(id),
                supabase
                    .from('caja_recepcion_movimientos')
                    .select('*')
                    .eq('paciente_id', id)
                    .order('fecha_hora', { ascending: false }),
                supabase
                    .from('agenda_appointments')
                    .select('id, patient_id, doctor_id, start_time, status, type')
                    .eq('patient_id', id)
                    .order('start_time', { ascending: false }),
                getPrestacionesByPaciente(id),
            ]);

            historiaClinica = relatedData[0];
            planes = relatedData[1];
            payments = relatedData[2].data || [];
            appointments = relatedData[3].data || [];
            prestaciones = relatedData[4];
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
        />
    );
}
