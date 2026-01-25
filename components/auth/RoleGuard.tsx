'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRoles?: string[];
    requireOwner?: boolean;
}

export default function RoleGuard({ children, allowedRoles, requireOwner }: RoleGuardProps) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                // Redirect to login if not authenticated
                router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
                return;
            }

            if (profile) {
                if (requireOwner && profile.role !== 'owner') {
                    router.push('/dashboard?error=unauthorized');
                    return;
                }

                if (allowedRoles && !allowedRoles.includes(profile.role) && profile.role !== 'owner') {
                    // Owner always access
                    // Note: allowedRoles should include 'admin' if admin is allowed
                    router.push('/dashboard?error=unauthorized');
                    return;
                }
            }
        }
    }, [user, profile, loading, router, pathname, allowedRoles, requireOwner]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!user || (requireOwner && profile?.role !== 'owner') || (allowedRoles && profile?.role !== 'owner' && !allowedRoles.includes(profile?.role || ''))) {
        return null; // Don't render content while redirecting
    }

    return <>{children}</>;
}
