import { Suspense } from 'react';
import CalculadoraClient from './CalculadoraClient';

export const metadata = {
    title: 'Calculadora de Financiación — AM Clínica Estética Dental',
    description: 'Calculá tu plan de cuotas personalizado. Conocé tu entrada, cuotas y total a pagar.',
};

export default function CalculadoraPage() {
    return (
        <main className="min-h-screen bg-[#050505]">
            <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                </div>
            }>
                <CalculadoraClient />
            </Suspense>
        </main>
    );
}
