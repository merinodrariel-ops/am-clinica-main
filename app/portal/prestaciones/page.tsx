import { getCurrentWorkerProfile, getUserAppProfile } from '@/app/actions/worker-portal';
import {
    getTarifarioCompleto,
    getMisPrestaciones,
    getProfesionales,
} from '@/app/actions/prestaciones';
import PrestacionesClient from './PrestacionesClient';
import { Stethoscope, AlertCircle } from 'lucide-react';

// Categorías que pueden REGISTRAR prestaciones para otros (admin staff)
const REGISTRO_CATEGORIAS = ['owner', 'admin', 'reception', 'asistente', 'developer'];

export default async function PrestacionesPage() {
    let worker;
    try {
        worker = await getCurrentWorkerProfile();
    } catch {
        worker = null;
    }

    if (!worker) {
        return (
            <div className="p-12 text-center text-slate-500">
                <Stethoscope size={40} className="mx-auto text-slate-700 mb-4" />
                <p>Perfil de prestador no encontrado.</p>
                <p className="text-sm mt-2 text-slate-400">
                    Tu usuario no está vinculado a un registro de personal. Contactá al administrador.
                </p>
            </div>
        );
    }

    // Use profiles.categoria (not personal.tipo) to determine mode.
    // The trigger maps owner → personal.tipo='odontologo' which is wrong for this decision.
    const appProfile = await getUserAppProfile();
    const categoria = appProfile?.categoria ?? '';
    const isRegistroMode = REGISTRO_CATEGORIAS.includes(categoria);
    const viewMode = isRegistroMode ? 'registro' : 'readonly';

    let tarifario: Awaited<ReturnType<typeof getTarifarioCompleto>> = [];
    let resumen: Awaited<ReturnType<typeof getMisPrestaciones>> = {
        prestaciones: [], total_ars: 0, total_usd: 0, validadas: 0, pendientes: 0,
    };
    let profesionales: Awaited<ReturnType<typeof getProfesionales>> = [];
    let loadError: string | null = null;

    try {
        if (!isRegistroMode) {
            // Odontólogo: solo ve sus propias prestaciones, sin tarifario
            resumen = await getMisPrestaciones(worker.id);
        } else {
            // Admin/asistente/owner: carga el tarifario completo y la lista de profesionales
            [tarifario, profesionales] = await Promise.all([
                getTarifarioCompleto(),
                getProfesionales(),
            ]);
        }
    } catch (err) {
        console.error('[PrestacionesPage] Error loading data:', err);
        loadError = err instanceof Error ? err.message : 'Error al cargar datos';
    }

    if (loadError) {
        return (
            <div className="p-12 text-center text-slate-500">
                <AlertCircle size={40} className="mx-auto text-red-500 mb-4" />
                <p className="text-red-400 font-medium">Error al cargar prestaciones</p>
                <p className="text-sm mt-2 text-slate-400 font-mono bg-slate-900 rounded p-3 max-w-lg mx-auto">
                    {loadError}
                </p>
            </div>
        );
    }

    return (
        <PrestacionesClient
            worker={worker}
            viewMode={viewMode}
            tarifario={tarifario}
            resumenInicial={resumen}
            profesionales={isRegistroMode ? profesionales : undefined}
        />
    );
}
