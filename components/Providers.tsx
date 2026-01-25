'use client';

import { ReactNode } from 'react';
import { PrivacyProvider } from '@/contexts/PrivacyContext';
import { AuthProvider } from '@/contexts/AuthContext';

interface Props {
    children: ReactNode;
}

export default function Providers({ children }: Props) {
    return (
        <AuthProvider>
            <PrivacyProvider>
                {children}
            </PrivacyProvider>
        </AuthProvider>
    );
}
