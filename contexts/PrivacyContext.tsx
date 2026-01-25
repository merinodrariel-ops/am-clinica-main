'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// =============================================
// Types
// =============================================

export type UserRole = 'recepcion' | 'administracion' | 'direccion';

interface PrivacyContextType {
    // State
    privacyMode: boolean;
    userRole: UserRole;
    revealedFields: Set<string>;

    // Actions
    togglePrivacyMode: () => void;
    setPrivacyMode: (active: boolean) => void;
    revealField: (fieldId: string) => void;
    hideField: (fieldId: string) => void;
    hideAllFields: () => void;
    setUserRole: (role: UserRole) => void;

    // Computed
    canRevealSensitive: boolean;
    canControlPrivacyMode: boolean;
    isFieldRevealed: (fieldId: string) => boolean;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

// =============================================
// Hook
// =============================================

export function usePrivacy(): PrivacyContextType {
    const context = useContext(PrivacyContext);
    if (!context) {
        throw new Error('usePrivacy must be used within a PrivacyProvider');
    }
    return context;
}

// =============================================
// Provider
// =============================================

interface PrivacyProviderProps {
    children: ReactNode;
    defaultRole?: UserRole;
}

export function PrivacyProvider({ children, defaultRole = 'direccion' }: PrivacyProviderProps) {
    // Privacy mode is ON by default for protection
    const [privacyMode, setPrivacyModeState] = useState(false);
    const [userRole, setUserRole] = useState<UserRole>(defaultRole);
    const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

    // Auto-hide timeout (30 seconds of inactivity)
    const AUTO_HIDE_TIMEOUT = 30000;

    // Computed permissions
    const canRevealSensitive = userRole === 'administracion' || userRole === 'direccion';
    const canControlPrivacyMode = userRole === 'direccion';

    // Reset revealed fields on tab visibility change
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                setRevealedFields(new Set());
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Auto-hide after inactivity
    useEffect(() => {
        if (revealedFields.size === 0) return;

        const timeout = setTimeout(() => {
            setRevealedFields(new Set());
        }, AUTO_HIDE_TIMEOUT);

        // Reset timeout on user activity
        const resetTimeout = () => {
            clearTimeout(timeout);
        };

        window.addEventListener('mousemove', resetTimeout, { once: true });
        window.addEventListener('keydown', resetTimeout, { once: true });

        return () => {
            clearTimeout(timeout);
            window.removeEventListener('mousemove', resetTimeout);
            window.removeEventListener('keydown', resetTimeout);
        };
    }, [revealedFields]);

    // Actions
    const togglePrivacyMode = useCallback(() => {
        if (!canControlPrivacyMode) return;
        setPrivacyModeState(prev => {
            if (!prev) {
                // When activating privacy mode, hide all fields
                setRevealedFields(new Set());
            }
            return !prev;
        });
    }, [canControlPrivacyMode]);

    const setPrivacyMode = useCallback((active: boolean) => {
        if (!canControlPrivacyMode) return;
        setPrivacyModeState(active);
        if (active) {
            setRevealedFields(new Set());
        }
    }, [canControlPrivacyMode]);

    const revealField = useCallback((fieldId: string) => {
        if (!canRevealSensitive || privacyMode) return;
        setRevealedFields(prev => new Set([...prev, fieldId]));
    }, [canRevealSensitive, privacyMode]);

    const hideField = useCallback((fieldId: string) => {
        setRevealedFields(prev => {
            const next = new Set(prev);
            next.delete(fieldId);
            return next;
        });
    }, []);

    const hideAllFields = useCallback(() => {
        setRevealedFields(new Set());
    }, []);

    const isFieldRevealed = useCallback((fieldId: string) => {
        return revealedFields.has(fieldId) && !privacyMode;
    }, [revealedFields, privacyMode]);

    const value: PrivacyContextType = {
        privacyMode,
        userRole,
        revealedFields,
        togglePrivacyMode,
        setPrivacyMode,
        revealField,
        hideField,
        hideAllFields,
        setUserRole,
        canRevealSensitive,
        canControlPrivacyMode,
        isFieldRevealed,
    };

    return (
        <PrivacyContext.Provider value={value}>
            {children}
        </PrivacyContext.Provider>
    );
}
