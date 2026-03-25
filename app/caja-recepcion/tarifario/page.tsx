import CategoriaGuard from '@/components/auth/CategoriaGuard';
import TarifarioClient from './TarifarioClient';

export const metadata = {
    title: 'Tarifario - AM Clínica',
};

export default function TarifarioPage() {
    return (
        <CategoriaGuard allowedCategorias={['admin', 'owner']}>
            <TarifarioClient />
        </CategoriaGuard>
    );
}
