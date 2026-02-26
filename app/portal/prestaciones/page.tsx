import { getCurrentWorkerProfile } from '@/app/actions/worker-portal';
import { getTarifarioParaDoctor, getMisPrestaciones } from '@/app/actions/prestaciones';
import PrestacionesClient from './PrestacionesClient';
import { Stethoscope } from 'lucide-react';

export default async function PrestacionesPage() {
    const worker = await getCurrentWorkerProfile();
    if (!worker) {
        return (
            <div className="p-12 text-center text-slate-500">
                <Stethoscope size={40} className="mx-auto text-slate-700 mb-4" />
                <p>Perfil no encontrado.</p>
            </div>
        );
    }

    const [tarifarioData, resumen] = await Promise.all([
        getTarifarioParaDoctor(worker.id),
        getMisPrestaciones(worker.id),
    ]);

    return (
        <PrestacionesClient
            worker={worker}
            tarifario={tarifarioData.items}
            areasAsignadas={tarifarioData.areas}
            resumenInicial={resumen}
        />
    );
}
