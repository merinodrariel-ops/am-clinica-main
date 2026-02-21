'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Role = 'owner' | 'admin' | 'pricing_manager' | 'reception' | 'partner_viewer' | 'developer' | 'laboratorio' | 'asistente' | 'odontologo';

interface Profile {
    id: string;
    email: string | null;
    full_name: string | null;
    role: Role;
    is_active: boolean;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    signOut: () => Promise<void>;
    role: Role | null;
    isAdmin: boolean;
    isOwner: boolean;
    isRealOwner: boolean;
    impersonatedRole: Role | null;
    setImpersonatedRole: (role: Role | null) => void;
    canEdit: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [impersonatedRole, setImpersonatedRole] = useState<Role | null>(null);

    const ownerEmail = (process.env.NEXT_PUBLIC_OWNER_EMAIL || 'dr.arielmerinopersonal@gmail.com').toLowerCase();
    const isHardcodedOwner = user?.email?.toLowerCase() === ownerEmail;
    const isRealOwner = isHardcodedOwner || profile?.role === 'owner';
    const metadataRole = user?.user_metadata?.role as Role | undefined;

    // Calculate effective role:
    // 1. If impersonating, use that.
    // 2. If hardcoded owner, force 'owner' (unless impersonating).
    // 3. Otherwise use profile role or metadata.
    const effectiveRole = (isRealOwner && impersonatedRole)
        ? impersonatedRole
        : (isHardcodedOwner ? 'owner' : (profile?.role || metadataRole || null));

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setSession(null);
        setImpersonatedRole(null);
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
                        role: (user.user_metadata?.role as Role) || 'partner_viewer',
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
                setProfile(data as Profile);
            }
        } catch (error) {
            console.error('Unexpected error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Load impersonated role from localStorage if exists
        const savedRole = localStorage.getItem('impersonatedRole') as Role;
        if (savedRole) setImpersonatedRole(savedRole);

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
                    role: (currentUser.user_metadata?.role as Role) || 'partner_viewer',
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
                    role: (currentUser.user_metadata?.role as Role) || 'partner_viewer',
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


    const handleSetImpersonatedRole = (role: Role | null) => {
        setImpersonatedRole(role);
        if (role) {
            localStorage.setItem('impersonatedRole', role);
        } else {
            localStorage.removeItem('impersonatedRole');
        }
    };

    const isAdmin = effectiveRole === 'admin' || effectiveRole === 'owner';
    const isOwner = effectiveRole === 'owner';

    // Permission Logic (Simplified Default Rule)
    const canEdit = (module: string): boolean => {
        const role = effectiveRole;
        if (!role) return false;
        if (role === 'owner') return true;
        if (role === 'partner_viewer') return false;

        // Admin edits everything operational
        if (role === 'admin') return true;

        // Reception
        if (role === 'reception') {
            return ['turnos', 'pacientes', 'caja_recepcion'].includes(module);
        }

        // Pricing Manager
        if (role === 'pricing_manager') {
            return ['tarifario', 'financiamiento'].includes(module);
        }

        // Laboratorio
        if (role === 'laboratorio') {
            return ['inventario', 'laboratorio', 'pacientes'].includes(module);
        }

        // Asistente
        if (role === 'asistente') {
            return ['inventario', 'pacientes', 'recalls', 'todos', 'turnos'].includes(module);
        }

        // Odontólogo
        if (role === 'odontologo') {
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
            role: effectiveRole || null,
            isAdmin,
            isOwner,
            isRealOwner,
            impersonatedRole,
            setImpersonatedRole: handleSetImpersonatedRole,
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
