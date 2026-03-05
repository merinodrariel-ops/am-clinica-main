import { Metadata } from 'next';
import { getProfesionales, getPrestacionesCatalogoCompleto } from '@/app/actions/prestaciones';
import AdminPrestacionesClient from './AdminPrestacionesClient';

export const metadata: Metadata = {
    title: 'Prestaciones de Odontologos | Admin',
    description: 'Carga rapida de prestaciones realizadas por odontologos.',
};

export default async function AdminPrestacionesPage() {
    const [profesionales, prestacionesCatalogo] = await Promise.all([
        getProfesionales(),
        getPrestacionesCatalogoCompleto(),
    ]);

    return (
        <div className="flex-1 w-full bg-[#050505] min-h-screen">
            <AdminPrestacionesClient
                profesionales={profesionales}
                prestacionesCatalogo={prestacionesCatalogo}
            />
        </div>
    );
}
