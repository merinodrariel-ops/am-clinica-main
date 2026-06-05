'use client';

import { Suspense, useState, useActionState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { login } from '@/app/actions/auth';

function LoginForm() {
    const searchParams = useSearchParams();
    const redirectPath = searchParams.get('redirect') || '/dashboard';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    
    // Server action driven state
    const [state, formAction, isPending] = useActionState(
        async (prevState: any, formData: FormData) => {
            setLocalError(null);
            if (!formData.has('redirect')) formData.append('redirect', redirectPath);
            return login(formData);
        },
        null
    );

    // Handle client-side redirect after server success
    // Must use window.location.href (hard reload) so the client-side Supabase instance
    // re-reads the session from cookies set by the server action.
    // router.push() keeps the existing AuthContext alive (which has user=null),
    // causing the sidebar and role-based UI to not render until a manual refresh.
    useEffect(() => {
        const authState = state as { success?: boolean; redirect?: string; error?: string };
        if (authState?.success && authState?.redirect) {
            window.location.href = authState.redirect;
        }
    }, [state]);

    const error = (state as { error?: string })?.error || localError || null;
    const isLoading = isPending;

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
            style={{ background: 'hsl(230 25% 8%)' }}
        >
            {/* Background glow effects */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-20"
                style={{ background: 'radial-gradient(circle, hsl(165 100% 42% / 0.3), transparent 70%)' }}
            />
            <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-15"
                style={{ background: 'radial-gradient(circle, hsl(217 91% 60% / 0.3), transparent 70%)' }}
            />

            <div className="max-w-md w-full space-y-8 p-8 rounded-2xl relative z-10 animate-fade-in"
                style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.4)',
                }}
            >
                <div className="text-center">
                    <h2 className="mt-2 text-3xl font-bold tracking-tight" style={{
                        background: 'linear-gradient(135deg, hsl(165 100% 42%), hsl(165 85% 60%))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Acceso Interno · AM Clínica
                    </h2>
                    <p className="mt-2 text-sm" style={{ color: 'hsl(230 10% 50%)' }}>
                        Iniciá sesión con tu email para administrar la clínica
                    </p>
                </div>

                <form className="mt-6 space-y-6" action={formAction}>
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="email-address" className="sr-only">Email</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="relative block w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-200 focus:outline-none focus:ring-2"
                                style={{
                                    background: 'hsl(230 15% 14%)',
                                    border: '1px solid hsl(230 15% 20%)',
                                    color: 'hsl(210 20% 95%)',
                                }}
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Contraseña</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="relative block w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-200 focus:outline-none focus:ring-2"
                                style={{
                                    background: 'hsl(230 15% 14%)',
                                    border: '1px solid hsl(230 15% 20%)',
                                    color: 'hsl(210 20% 95%)',
                                }}
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-center p-2.5 rounded-xl badge-destructive">
                            {error}
                        </div>
                    )}


                    <div className="flex items-center justify-end">
                        <div className="text-sm">
                            <a href="/forgot-password" className="font-medium hover:underline" style={{ color: 'hsl(165 85% 50%)' }}>
                                ¿Olvidaste tu contraseña?
                            </a>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-2.5 px-4 text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                background: 'linear-gradient(135deg, hsl(165 100% 38%), hsl(165 100% 30%))',
                                color: 'white',
                                boxShadow: '0 4px 14px hsla(165, 100%, 42%, 0.25)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px hsla(165, 100%, 42%, 0.35)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px hsla(165, 100%, 42%, 0.25)'}
                        >
                            {isLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                'Iniciar Sesión'
                            )}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(230 25% 8%)' }}>
                <Loader2 className="animate-spin h-8 w-8" style={{ color: 'hsl(165 100% 42%)' }} />
            </div>
        }>
            <LoginForm />
        </Suspense>
    );
}
