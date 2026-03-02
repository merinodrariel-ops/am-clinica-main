import { Metadata } from 'next';
import { getProfesionales, getTarifarioCompleto } from '@/app/actions/prestaciones';
import AdminPrestacionesClient from './AdminPrestacionesClient';

export const metadata: Metadata = {
    title: 'Carga de Prestaciones | Admin',
    description: 'Sistema de carga rápida de prestaciones para profesionales.',
};

export default async function AdminPrestacionesPage() {
    const [profesionales, tarifario] = await Promise.all([
        getProfesionales(),
        getTarifarioCompleto(),
    ]);

    return (
        <div className="flex-1 w-full bg-[#050505] min-h-screen">
            <AdminPrestacionesClient
                profesionales={profesionales}
                tarifario={tarifario}
            />
        </div>
    );
}
