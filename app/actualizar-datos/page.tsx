import { Suspense } from 'react';
import ActualizarDatosClient from './ActualizarDatosClient';

export const metadata = {
    title: 'Actualizar mis datos — AM Estética Dental',
    description: 'Completá tus datos personales para brindarte una mejor atención.',
};

export default function ActualizarDatosPage() {
    return (
        <main className="min-h-screen bg-[#050505]">
            <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                </div>
            }>
                <ActualizarDatosClient />
            </Suspense>
        </main>
    );
}
