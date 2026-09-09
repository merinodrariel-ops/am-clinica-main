'use client';

import { ReactNode, useEffect } from 'react';
import { PrivacyProvider } from '@/contexts/PrivacyContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from 'next-themes';

import { Toaster } from 'sonner';
import { syncOperationalClock } from '@/lib/local-date';

interface Props {
    children: ReactNode;
}

export default function Providers({ children }: Props) {
    useEffect(() => {
        const sync = async () => {
            try {
                const response = await fetch('/api/operational-time', { cache: 'no-store' });
                if (!response.ok) return;
                const data = await response.json() as { now?: string };
                if (data.now) syncOperationalClock(data.now);
            } catch {
                // Offline mode keeps the bootstrapped clock as a best effort fallback.
            }
        };
        void sync();
        const interval = window.setInterval(() => void sync(), 15 * 60 * 1000);
        return () => window.clearInterval(interval);
    }, []);

    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AuthProvider>
                <PrivacyProvider>
                    {children}
                    <Toaster richColors position="top-center" />
                </PrivacyProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
