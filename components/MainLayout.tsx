
'use client';

import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { readSidebarCollapsed, SIDEBAR_COLLAPSED_EVENT } from '@/lib/sidebar-preferences';

export default function MainLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { user } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());

    useEffect(() => {
        const syncCollapsed = () => {
            setSidebarCollapsed(readSidebarCollapsed());
        };

        window.addEventListener(SIDEBAR_COLLAPSED_EVENT, syncCollapsed as EventListener);
        return () => {
            window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, syncCollapsed as EventListener);
        };
    }, []);

    // If no user or on login page, don't add margin (Sidebar is hidden)
    const isSidebarVisible = user && pathname !== '/login' && !pathname.startsWith('/portal-profesional');

    return (
        <main className={clsx(
            'min-h-screen transition-all duration-200',
            isSidebarVisible ? (sidebarCollapsed ? 'ml-20' : 'ml-64') : ''
        )}>
            {children}
        </main>
    );
}
