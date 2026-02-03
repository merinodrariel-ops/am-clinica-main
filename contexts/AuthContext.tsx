'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';

type Role = 'owner' | 'admin' | 'pricing_manager' | 'reception' | 'partner_viewer' | 'developer';

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
    isAdmin: boolean;
    isOwner: boolean;
    canEdit: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setSession(null);
    };

    const fetchProfile = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
            } else if (data) {
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
        // Check active session
        supabase.auth.getSession().then((response: { data: { session: Session | null } }) => {
            const session = response.data.session;
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setProfile(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';
    const isOwner = profile?.role === 'owner';

    // Permission Logic (Simplified Default Rule)
    const canEdit = (module: string): boolean => {
        if (!profile) return false;
        if (profile.role === 'owner') return true;
        if (profile.role === 'partner_viewer') return false;

        // Admin edits everything operational
        if (profile.role === 'admin') return true;

        // Reception
        if (profile.role === 'reception') {
            return ['turnos', 'pacientes', 'caja_recepcion'].includes(module);
        }

        // Pricing Manager
        if (profile.role === 'pricing_manager') {
            return ['tarifario', 'financiamiento'].includes(module);
        }

        return false;
    };

    return (
        <AuthContext.Provider value={{ user, session, profile, loading, signOut, isAdmin, isOwner, canEdit }}>
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
