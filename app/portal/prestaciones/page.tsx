import { getCurrentWorkerProfile } from '@/app/actions/worker-portal';
import { getTarifarioParaDoctor, getMisPrestaciones } from '@/app/actions/prestaciones';
import PrestacionesClient from './PrestacionesClient';
import { Stethoscope, AlertCircle } from 'lucide-react';

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

    let tarifarioData = { items: [] as Awaited<ReturnType<typeof getTarifarioParaDoctor>>['items'], areas: [] as string[] };
    let resumen: Awaited<ReturnType<typeof getMisPrestaciones>> = {
        prestaciones: [], total_ars: 0, total_usd: 0, validadas: 0, pendientes: 0,
    };
    let loadError: string | null = null;

    try {
        [tarifarioData, resumen] = await Promise.all([
            getTarifarioParaDoctor(worker.id),
            getMisPrestaciones(worker.id),
        ]);
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
                <p className="text-sm mt-4 text-slate-500">
                    Verificá que la migración <code>20260226_prestaciones_hc.sql</code> fue aplicada en Supabase.
                </p>
            </div>
        );
    }

    return (
        <PrestacionesClient
            worker={worker}
            tarifario={tarifarioData.items}
            areasAsignadas={tarifarioData.areas}
            resumenInicial={resumen}
        />
    );
}
