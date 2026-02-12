'use client';

import { ReactNode } from 'react';
import { PrivacyProvider } from '@/contexts/PrivacyContext';
import { AuthProvider } from '@/contexts/AuthContext';

import { Toaster } from 'sonner';

interface Props {
    children: ReactNode;
}

export default function Providers({ children }: Props) {
    return (
        <AuthProvider>
            <PrivacyProvider>
                {children}
                <Toaster richColors position="top-center" />
            </PrivacyProvider>
        </AuthProvider>
    );
}
