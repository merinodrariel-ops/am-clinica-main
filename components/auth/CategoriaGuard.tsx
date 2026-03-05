'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface CategoriaGuardProps {
    children: React.ReactNode;
    allowedCategorias?: string[];
    requireOwner?: boolean;
}

export default function CategoriaGuard({ children, allowedCategorias, requireOwner }: CategoriaGuardProps) {
    const { user, loading, categoria } = useAuth();
    const router = useRouter();
    const _pathname = usePathname();

    useEffect(() => {
        console.log('CategoriaGuard state:', { loading, userEmail: user?.email, categoria, requireOwner });
        if (!loading) {

            if (!user) {
                router.push('/login');
            } else if (categoria) {
                if (requireOwner && categoria !== 'owner') {
                    router.push('/dashboard?error=unauthorized');
                    return;
                }

                if (allowedCategorias && categoria !== 'owner' && !allowedCategorias.includes(categoria)) {
                    router.push('/dashboard?error=unauthorized');
                }
            } else if (!categoria && !loading) {
                // If we have a user but no categoria/profile, and it's not the hardcoded owner, something is wrong
                const ownerEmail = (process.env.NEXT_PUBLIC_OWNER_EMAIL || 'dr.arielmerinopersonal@gmail.com').toLowerCase();
                if (user.email?.toLowerCase() !== ownerEmail) {
                    router.push('/dashboard?error=profile_not_found');
                }
            }
        }
    }, [user, categoria, loading, requireOwner, allowedCategorias, router]);

    if (loading) {
        return (
            <div className="flex bg-gray-50 dark:bg-gray-900 items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!user || (requireOwner && categoria !== 'owner') || (allowedCategorias && categoria !== 'owner' && !allowedCategorias.includes(categoria || ''))) {
        return null; // Don't render content while redirecting
    }


    return <>{children}</>;
}
