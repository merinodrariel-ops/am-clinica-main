import { NextResponse } from 'next/server';
import { submitAdmissionAction } from '@/app/actions/admission';
import { admissionSubmissionSchema } from '@/lib/admission-schema';

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': 'https://am-clinica-admision.vercel.app',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Use the existing schema for validation
        const parsed = admissionSubmissionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Validación fallida',
                    details: parsed.error.issues.map(i => ({ path: i.path, message: i.message }))
                },
                {
                    status: 400,
                    headers: {
                        'Access-Control-Allow-Origin': 'https://am-clinica-admision.vercel.app',
                    }
                }
            );
        }

        // Call the existing server action logic
        const result = await submitAdmissionAction(parsed.data);

        return NextResponse.json(result, {
            status: result.success ? 200 : 500,
            headers: {
                'Access-Control-Allow-Origin': 'https://am-clinica-admision.vercel.app',
            },
        });
    } catch (error) {
        console.error('API Admission Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Error interno del servidor' },
            {
                status: 500,
                headers: {
                    'Access-Control-Allow-Origin': 'https://am-clinica-admision.vercel.app',
                }
            }
        );
    }
}
