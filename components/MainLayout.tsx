
'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

export default function MainLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { user } = useAuth();

    // If no user or on login page, don't add margin (Sidebar is hidden)
    const isSidebarVisible = user && pathname !== '/login' && !pathname.startsWith('/portal-profesional');

    return (
        <main className={clsx("min-h-screen transition-all duration-200", isSidebarVisible ? "ml-64" : "")}>
            {children}
        </main>
    );
}
