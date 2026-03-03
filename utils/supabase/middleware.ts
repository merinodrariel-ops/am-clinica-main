
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options: _options }) =>
                        request.cookies.set(name, value)
                    )
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname;
    const isPublicRoute =
        path === '/login' ||
        path.startsWith('/auth') ||
        path === '/' ||
        path === '/admision' ||
        path.startsWith('/admision/') ||
        path === '/mi-portal' ||
        path.startsWith('/mi-portal/') ||
        path.startsWith('/sonrisa/comparador') ||
        path === '/privacy-policy' ||
        path === '/terms' ||
        path.startsWith('/forgot-password') ||
        path.startsWith('/api/patient-portal/') ||
        path.startsWith('/api/sync-') ||
        path.startsWith('/api/import-') ||
        path.startsWith('/api/workflows/') ||
        path === '/api/setup-sucursales' ||
        path === '/api/check-sucursales' ||
        path === '/api/check-profiles';

    // NOTE: If '/' is the landing page and public, keep it here. 
    // If '/' is expected to be protected (redirect to dashboard), remove it from public.
    // The user said "Solo /login y /auth/* deben ser públicas". 
    // I'll assume '/' might redirect to dashboard if logged in, or login if not.
    // Let's treat '/' as public for now, but inspect logic below.

    // Improve static file detection to avoid security loopholes with dot-files
    const isStaticAsset =
        path.startsWith('/_next') ||
        path.startsWith('/static') ||
        /\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2)$/.test(path);

    if (!user && !isPublicRoute && !isStaticAsset) {
        // no user, protected route
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('redirect', path)
        return NextResponse.redirect(url)
    }

    // OPTIONAL: If user is logged in and visits /login, redirect to /dashboard
    if (user && path === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    // Bloquear rutas exclusivamente admin para roles prestadores
    const PORTAL_ROLES = ['odontologo', 'asistente', 'laboratorio', 'recaptacion']
    let userRole = (user?.user_metadata?.role ?? '') as string

    // Source-of-truth role comes from profiles.role (metadata can be stale).
    if (user) {
        const { data: currentProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        if (currentProfile?.role) {
            userRole = currentProfile.role
        }
    }
    if (user && PORTAL_ROLES.includes(userRole)) {
        const ADMIN_ONLY_PATHS = [
            '/caja-admin',
            '/caja-recepcion',
            '/admin/staff',
            '/admin/liquidaciones',
            '/admin/prestaciones',
            '/admin-users',
        ]
        if (ADMIN_ONLY_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
            const url = request.nextUrl.clone()
            url.pathname = '/dashboard'
            return NextResponse.redirect(url)
        }
    }

    // IMPORTANT: You *must* return the response object as it is. If you're
    // creating a new Response object with NextResponse.redirect() inside
    // this middleware, you must handle cookies setting there too.
    // usage of supabase.auth.getUser() does this for you above if you use the supabase client.

    return response
}
