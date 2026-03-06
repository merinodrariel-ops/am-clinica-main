import AdmissionForm from '@/components/admission/AdmissionForm';
import { Suspense } from 'react';

export default function AdmissionPage() {
    return (
        <main className="min-h-screen bg-[#050505]">
            <Suspense fallback={<div className="min-h-screen" />}>
                <AdmissionForm />
            </Suspense>
        </main>
    );
}
