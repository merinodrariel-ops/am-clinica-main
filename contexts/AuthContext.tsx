'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

const supabase = createClient();

import { WorkerCategory } from '@/types/worker-portal';

interface Profile {
    id: string;
    email: string | null;
    full_name: string | null;
    categoria: WorkerCategory;
    is_active: boolean;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    signOut: () => Promise<void>;
    categoria: WorkerCategory | null;
    isAdmin: boolean;
    isOwner: boolean;
    isRealOwner: boolean;
    impersonatedCategoria: WorkerCategory | null;
    setImpersonatedCategoria: (categoria: WorkerCategory | null) => void;
    canEdit: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [impersonatedCategoria, setImpersonatedCategoria] = useState<WorkerCategory | null>(null);

    const ownerEmail = (process.env.NEXT_PUBLIC_OWNER_EMAIL || 'dr.arielmerinopersonal@gmail.com').toLowerCase();
    const isHardcodedOwner = user?.email?.toLowerCase() === ownerEmail;
    const metadataCategoria = normalizeCategoriaAlias(user?.user_metadata?.categoria as string | undefined) as WorkerCategory | null;
    const profileCategoria = normalizeCategoriaAlias(profile?.categoria as string | undefined) as WorkerCategory | null;
    const isRealOwner = isHardcodedOwner || profileCategoria === 'owner';

    // Calculate effective category:
    // 1. If impersonating, use that.
    // 2. If hardcoded owner, force 'owner' (unless impersonating).
    // 3. Otherwise use profile categoria or metadata.
    const effectiveCategoria = (isRealOwner && impersonatedCategoria)
        ? impersonatedCategoria
        : (isHardcodedOwner ? 'owner' : (profileCategoria || metadataCategoria || null));

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setSession(null);
        setImpersonatedCategoria(null);
    };

    const fetchProfile = async (userId: string) => {
        try {
            console.log('Fetching profile for userId:', userId);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.warn('Error fetching profile from DB:', error.message);
                // Fallback: If profile fetch fails, we can construct a minimal profile from auth user metadata
                if (user) {
                    setProfile({
                        id: user.id,
                        email: user.email || null,
                        full_name: (user.user_metadata?.full_name as string) || null,
                        categoria: (normalizeCategoriaAlias(user.user_metadata?.categoria as string | undefined) as WorkerCategory) || 'partner_viewer',
                        is_active: true
                    });
                }
            } else if (data) {
                console.log('Profile fetched successfully:', data);
                if (data.is_active === false) {
                    await signOut();
                    window.location.href = '/login?error=account_disabled';
                    return;
                }
                setProfile({
                    ...(data as Profile),
                    categoria: (normalizeCategoriaAlias((data as Profile).categoria) as WorkerCategory) || 'partner_viewer',
                });
            }
        } catch (error) {
            console.error('Unexpected error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Load impersonated category from localStorage if exists
        const savedCategoria = localStorage.getItem('impersonatedCategoria') as WorkerCategory;
        if (savedCategoria) setImpersonatedCategoria(savedCategoria);

        // Check active session
        console.log('AuthContext: Checking session...');
        supabase.auth.getSession().then((response: { data: { session: Session | null } }) => {
            const session = response.data.session;
            console.log('AuthContext: Session response:', {
                hasSession: !!session,
                userEmail: session?.user?.email
            });
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);


            if (currentUser) {
                // Pre-populate profile from metadata while fetching
                setProfile({
                    id: currentUser.id,
                    email: currentUser.email || null,
                    full_name: (currentUser.user_metadata?.full_name as string) || null,
                    categoria: (normalizeCategoriaAlias(currentUser.user_metadata?.categoria as string | undefined) as WorkerCategory) || 'partner_viewer',
                    is_active: true
                });
                fetchProfile(currentUser.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);

            if (currentUser) {
                // Pre-populate profile from metadata while fetching
                setProfile({
                    id: currentUser.id,
                    email: currentUser.email || null,
                    full_name: (currentUser.user_metadata?.full_name as string) || null,
                    categoria: (normalizeCategoriaAlias(currentUser.user_metadata?.categoria as string | undefined) as WorkerCategory) || 'partner_viewer',
                    is_active: true
                });
                fetchProfile(currentUser.id);
            } else {
                setProfile(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    const handleSetImpersonatedCategoria = (categoria: WorkerCategory | null) => {
        setImpersonatedCategoria(categoria);
        if (categoria) {
            localStorage.setItem('impersonatedCategoria', categoria);
        } else {
            localStorage.removeItem('impersonatedCategoria');
        }
    };

    const isAdmin = effectiveCategoria === 'admin' || effectiveCategoria === 'owner';
    const isOwner = effectiveCategoria === 'owner';

    // Permission Logic (Simplified Default Rule)
    const canEdit = (module: string): boolean => {
        const categoria = effectiveCategoria;
        if (!categoria) return false;
        if (categoria === 'owner') return true;
        if (categoria === 'partner_viewer') return false;

        // Admin edits everything operational
        if (categoria === 'admin') return true;

        // Reception
        if (categoria === 'reception') {
            return ['turnos', 'pacientes', 'caja_recepcion'].includes(module);
        }

        // Pricing Manager
        if (categoria === 'pricing_manager') {
            return ['tarifario', 'financiamiento'].includes(module);
        }

        // Laboratorio / Technician
        if (categoria === 'laboratorio' || categoria === 'lab' || categoria === 'technician') {
            return ['inventario', 'laboratorio', 'pacientes', 'turnos'].includes(module);
        }

        // Asistente / Assistant
        if (categoria === 'asistente' || categoria === 'assistant') {
            return ['inventario', 'pacientes', 'recalls', 'todos', 'turnos'].includes(module);
        }

        // Recaptacion
        if (categoria === 'recaptacion') {
            return ['pacientes', 'recalls', 'todos', 'turnos'].includes(module);
        }

        // Odontólogo / Dentist
        if (categoria === 'odontologo' || categoria === 'dentist') {
            return ['pacientes', 'turnos', 'recalls', 'todos'].includes(module);
        }

        return false;
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            profile,
            loading,
            signOut,
            categoria: effectiveCategoria || null,
            isAdmin,
            isOwner,
            isRealOwner,
            impersonatedCategoria,
            setImpersonatedCategoria: handleSetImpersonatedCategoria,
            canEdit
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
