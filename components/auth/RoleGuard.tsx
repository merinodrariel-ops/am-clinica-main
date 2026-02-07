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
    const { user, profile, loading, role } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        console.log('RoleGuard state:', { loading, userEmail: user?.email, role, requireOwner });
        if (!loading) {

            if (!user) {
                router.push('/login');
            } else if (role) {
                if (requireOwner && role !== 'owner') {
                    router.push('/dashboard?error=unauthorized');
                    return;
                }

                if (allowedRoles && role !== 'owner' && !allowedRoles.includes(role)) {
                    router.push('/dashboard?error=unauthorized');
                }
            } else if (!role && !loading) {
                // If we have a user but no role/profile, and it's not the hardcoded owner, something is wrong
                if (!user.email?.includes('dr.arielmerinopersonal@gmail.com')) {
                    router.push('/dashboard?error=profile_not_found');
                }
            }
        }
    }, [user, role, loading, requireOwner, allowedRoles, router]);

    if (loading) {
        return (
            <div className="flex bg-gray-50 dark:bg-gray-900 items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!user || (requireOwner && role !== 'owner') || (allowedRoles && role !== 'owner' && !allowedRoles.includes(role || ''))) {
        return null; // Don't render content while redirecting
    }


    return <>{children}</>;
}
