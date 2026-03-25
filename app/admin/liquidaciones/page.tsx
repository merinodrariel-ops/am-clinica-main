import CategoriaGuard from '@/components/auth/CategoriaGuard';
import LiquidacionesClient from './LiquidacionesClient';

export const metadata = {
    title: 'Liquidaciones - AM Clínica',
};

export default function LiquidacionesPage() {
    return (
        <CategoriaGuard allowedCategorias={['admin', 'owner']}>
            <LiquidacionesClient />
        </CategoriaGuard>
    );
}
