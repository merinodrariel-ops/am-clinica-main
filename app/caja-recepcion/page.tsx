import { Suspense } from 'react';
import CajaRecepcionClient from './CajaRecepcionClient';

export const metadata = {
    title: 'Caja Recepción - AM Clínica',
    description: 'Gestión de caja y cobros de pacientes',
};

export default function CajaRecepcionPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
            </div>
        }>
            <CajaRecepcionClient />
        </Suspense>
    );
}
