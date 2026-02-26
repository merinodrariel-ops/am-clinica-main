'use client';

import { Suspense, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { signInWithGoogleOAuth } from '@/lib/googleAuthService';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectPath = searchParams.get('redirect') || '/dashboard';
    const supabase = createClient();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setError(error.message);
            } else {
                router.push(redirectPath);
            }
        } catch {
            setError('Ocurrió un error inesperado');
        } finally {
            setLoading(false);
        }
    };


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
                        Iniciá sesión para administrar la clínica
                    </p>
                </div>
                <div className="mt-6 flex flex-col gap-2">
                    <button
                        onClick={async () => {
                            setLoading(true);
                            setError(null);
                            const { error } = await signInWithGoogleOAuth({
                                nextPath: redirectPath,
                            });
                            if (error) {
                                setError(error.message);
                                setLoading(false);
                            }
                        }}
                        type="button"
                        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200"
                        style={{
                            background: 'hsl(230 15% 14%)',
                            border: '1px solid hsl(230 15% 20%)',
                            color: 'hsl(210 20% 90%)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'hsl(230 15% 17%)'; e.currentTarget.style.borderColor = 'hsl(230 15% 25%)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'hsl(230 15% 14%)'; e.currentTarget.style.borderColor = 'hsl(230 15% 20%)'; }}
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        Continuar con Google
                    </button>

                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full" style={{ borderTop: '1px solid hsl(230 15% 20%)' }} />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="px-2 rounded" style={{ background: 'hsl(230 20% 11%)', color: 'hsl(230 10% 45%)' }}>O con email</span>
                        </div>
                    </div>
                </div>

                <form className="mt-6 space-y-6" onSubmit={handleLogin}>
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
                            disabled={loading}
                            className="w-full flex justify-center py-2.5 px-4 text-sm font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                background: 'linear-gradient(135deg, hsl(165 100% 38%), hsl(165 100% 30%))',
                                color: 'white',
                                boxShadow: '0 4px 14px hsla(165, 100%, 42%, 0.25)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px hsla(165, 100%, 42%, 0.35)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px hsla(165, 100%, 42%, 0.25)'}
                        >
                            {loading ? (
                                <Loader2 className="animate-spin h-5 w-5" />
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
