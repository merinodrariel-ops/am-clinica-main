import { Suspense } from 'react';
import RegistroPrestadorForm from '@/components/prestador/RegistroPrestadorForm';

export const metadata = {
    title: 'Registro de Prestador — AM Clínica',
    description: 'Completá tus datos para sumarte al equipo',
    robots: 'noindex',
};

export default function RegistroPrestadorPage() {
    return (
        <main className="min-h-screen bg-[#050505]">
            <Suspense fallback={<div className="min-h-screen bg-[#050505]" />}>
                <RegistroPrestadorForm />
            </Suspense>
        </main>
    );
}
