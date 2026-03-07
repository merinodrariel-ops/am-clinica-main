import PublicBookingScheduler from '@/components/admission/PublicBookingScheduler';
import { Suspense } from 'react';

export default function PublicBookingPage() {
    return (
        <main className="min-h-screen bg-[#050505]">
            <Suspense fallback={<div className="min-h-screen" />}>
                <PublicBookingScheduler />
            </Suspense>
        </main>
    );
}
