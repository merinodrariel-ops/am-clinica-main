import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

type RemoveBgProviderResult =
    | { success: true; blob: Blob }
    | { success: false; error: string };

function toPngResponse(blob: Blob) {
    return new NextResponse(blob, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
        },
    });
}

function readNestedValue(source: unknown, path: string[]): unknown {
    let current: unknown = source;
    for (const key of path) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

function extractBase64(json: unknown) {
    const candidates = [
        ['image_base64'],
        ['imageBase64'],
        ['base64'],
        ['data', 'image_base64'],
        ['data', 'imageBase64'],
        ['result', 'image_base64'],
        ['result', 'imageBase64'],
    ];

    for (const path of candidates) {
        const value = readNestedValue(json, path);
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

function extractImageUrl(json: unknown) {
    const candidates = [
        ['image_url'],
        ['imageUrl'],
        ['url'],
        ['data', 'image_url'],
        ['data', 'imageUrl'],
        ['data', 'url'],
        ['result', 'image_url'],
        ['result', 'imageUrl'],
        ['result', 'url'],
    ];

    for (const path of candidates) {
        const value = readNestedValue(json, path);
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

function base64ToBlob(rawBase64: string) {
    const payload = rawBase64.includes(',') ? rawBase64.split(',')[1] || '' : rawBase64;
    const mimeType = rawBase64.startsWith('data:image/webp')
        ? 'image/webp'
        : rawBase64.startsWith('data:image/jpeg') || rawBase64.startsWith('data:image/jpg')
            ? 'image/jpeg'
            : 'image/png';

    const bytes = Buffer.from(payload, 'base64');
    return new Blob([bytes], { type: mimeType });
}

async function removeBackgroundWithStitch(input: {
    image: File;
    endpoint: string;
    apiKey?: string;
}): Promise<RemoveBgProviderResult> {
    try {
        const outbound = new FormData();
        outbound.append('image', input.image);
        outbound.append('output', 'png');
        outbound.append('background', 'transparent');

        const headers: Record<string, string> = {};
        if (input.apiKey) {
            headers.Authorization = `Bearer ${input.apiKey}`;
            headers['X-Api-Key'] = input.apiKey;
        }

        const response = await fetch(input.endpoint, {
            method: 'POST',
            headers,
            body: outbound,
        });

        if (!response.ok) {
            const message = await response.text();
            return {
                success: false,
                error: `Stitch error ${response.status}: ${message.slice(0, 200)}`,
            };
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('image/')) {
            const blob = await response.blob();
            if (!blob || blob.size === 0) {
                return { success: false, error: 'Stitch devolvio imagen vacia' };
            }
            return { success: true, blob };
        }

        const json = await response.json();
        const imageBase64 = extractBase64(json);
        if (imageBase64) {
            return { success: true, blob: base64ToBlob(imageBase64) };
        }

        const imageUrl = extractImageUrl(json);
        if (imageUrl) {
            const download = await fetch(imageUrl);
            if (!download.ok) {
                return { success: false, error: `Stitch URL invalida: ${download.status}` };
            }
            const blob = await download.blob();
            if (!blob || blob.size === 0) {
                return { success: false, error: 'Stitch URL devolvio imagen vacia' };
            }
            return { success: true, blob };
        }

        return { success: false, error: 'Stitch devolvio formato no reconocido' };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error inesperado Stitch';
        return { success: false, error: message };
    }
}

async function removeBackgroundWithRemoveBg(input: {
    image: File;
    apiKey: string;
}): Promise<RemoveBgProviderResult> {
    try {
        const outbound = new FormData();
        outbound.append('image_file', input.image);
        outbound.append('size', 'auto');
        outbound.append('format', 'png');

        const response = await fetch('https://api.remove.bg/v1.0/removebg', {
            method: 'POST',
            headers: {
                'X-Api-Key': input.apiKey,
            },
            body: outbound,
        });

        if (!response.ok) {
            const message = await response.text();
            return {
                success: false,
                error: `remove.bg error ${response.status}: ${message.slice(0, 200)}`,
            };
        }

        const blob = await response.blob();
        if (!blob || blob.size === 0) {
            return { success: false, error: 'remove.bg devolvio imagen vacia' };
        }

        return { success: true, blob };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error inesperado remove.bg';
        return { success: false, error: message };
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        const role = (profile?.role || user.user_metadata?.role || '').toLowerCase();
        if (!['owner', 'admin', 'developer'].includes(role)) {
            return NextResponse.json({ error: 'Sin permisos para quitar fondo' }, { status: 403 });
        }

        const stitchEndpoint = process.env.STITCH_REMOVE_BG_URL;
        const stitchApiKey = process.env.STITCH_API_KEY || process.env.STITCH_API_TOKEN;
        const removeBgKey = process.env.REMOVE_BG_API_KEY;

        if (!stitchEndpoint && !removeBgKey) {
            return NextResponse.json(
                {
                    error: 'Configura STITCH_REMOVE_BG_URL o REMOVE_BG_API_KEY para usar fondo transparente',
                },
                { status: 503 }
            );
        }

        const body = await request.formData();
        const image = body.get('image');

        if (!(image instanceof File)) {
            return NextResponse.json({ error: 'Imagen invalida' }, { status: 400 });
        }

        const providerErrors: string[] = [];

        if (stitchEndpoint) {
            const stitchResult = await removeBackgroundWithStitch({
                image,
                endpoint: stitchEndpoint,
                apiKey: stitchApiKey,
            });

            if (stitchResult.success) {
                return toPngResponse(stitchResult.blob);
            }

            providerErrors.push(stitchResult.error);
        }

        if (removeBgKey) {
            const removeBgResult = await removeBackgroundWithRemoveBg({ image, apiKey: removeBgKey });
            if (removeBgResult.success) {
                return toPngResponse(removeBgResult.blob);
            }

            providerErrors.push(removeBgResult.error);
        }

        return NextResponse.json(
            {
                error: 'No se pudo remover fondo con los proveedores configurados',
                providers: providerErrors,
            },
            { status: 502 }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error al remover fondo';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
