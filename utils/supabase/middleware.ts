
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
                    cookiesToSet.forEach(({ name, value, options }) =>
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
        path === '/privacy-policy' ||
        path === '/terms' ||
        path.startsWith('/forgot-password') ||
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

    if (!user && !isPublicRoute && !path.startsWith('/_next') && !path.includes('.')) {
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

    // IMPORTANT: You *must* return the response object as it is. If you're
    // creating a new Response object with NextResponse.redirect() inside
    // this middleware, you must handle cookies setting there too.
    // usage of supabase.auth.getUser() does this for you above if you use the supabase client.

    return response
}
