
import { ReactNode } from 'react';

export default function PortalLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex justify-center">
            {/* Mobile-First Container: Max width resembles a phone/tablet app */}
            <main className="w-full max-w-lg min-h-screen bg-white dark:bg-slate-900 shadow-2xl relative flex flex-col">
                {children}
            </main>
        </div>
    );
}
