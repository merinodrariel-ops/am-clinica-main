import CategoriaGuard from '@/components/auth/CategoriaGuard';
import CajaClient from './CajaClient';

export const metadata = {
    title: 'Caja - AM Clínica',
    description: 'Caja física unificada de la sede Madero',
};

export default function CajaPage() {
    return (
        <CategoriaGuard allowedCategorias={['owner', 'admin', 'reception', 'developer']}>
            <CajaClient />
        </CategoriaGuard>
    );
}
