import Anthropic from '@anthropic-ai/sdk';
import { getAiModel } from '@/lib/ai-models';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_ROLES = new Set(['owner', 'admin', 'reception', 'marketing']);

type ChatTurn = { role: 'user' | 'assistant'; content: string };
type Draft = {
    title?: string;
    description?: string;
    photoDescriptions?: string[];
};

const CASE_WRITER_PROMPT = `Sos el asistente editorial de AM Estética Dental. Ayudás a transformar la explicación real de un caso odontológico en una historia clara, humana y útil para la web.

Reglas obligatorias:
- Escribí en español rioplatense, con tono profesional, cálido y concreto.
- No inventes diagnósticos, procedimientos, resultados, tiempos ni datos que la persona no haya contado.
- No incluyas el nombre, iniciales ni datos identificatorios del paciente.
- No prometas resultados universales ni uses afirmaciones médicas absolutas.
- Priorizá una historia comprensible y SEO natural; evitá listas de palabras clave y lenguaje publicitario exagerado.
- El título debe describir el tratamiento o transformación, nunca identificar al paciente.
- La descripción general debe poder publicarse tal como está.
- Generá una descripción específica por cada foto, respetando el orden y sin afirmar qué muestra una imagen si no surge del relato. Si falta contexto, describila de forma neutral.
- Entregá también una versión en inglés natural, orientada a pacientes internacionales. Debe conservar exactamente los mismos hechos, sin agregar ni quitar información clínica.
- Si faltan datos importantes, señalalo brevemente en assistantMessage, pero entregá igualmente el mejor borrador posible con lo confirmado.`;

const PROPOSAL_TOOL: Anthropic.Tool = {
    name: 'proponer_caso_web',
    description: 'Devuelve el borrador editorial estructurado para que la persona lo revise antes de publicar.',
    input_schema: {
        type: 'object',
        properties: {
            assistantMessage: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            photoDescriptions: {
                type: 'array',
                items: { type: 'string' },
            },
            titleEn: { type: 'string' },
            descriptionEn: { type: 'string' },
            photoDescriptionsEn: {
                type: 'array',
                items: { type: 'string' },
            },
        },
        required: [
            'assistantMessage',
            'title',
            'description',
            'photoDescriptions',
            'titleEn',
            'descriptionEn',
            'photoDescriptionsEn',
        ],
    },
};

async function canPublish() {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return false;
    const admin = createAdminClient();
    const { data } = await admin.from('personal').select('categoria').eq('user_id', user.id).maybeSingle();
    const role = String(data?.categoria || user.user_metadata?.role || '').toLowerCase();
    return ALLOWED_ROLES.has(role);
}

export async function POST(request: Request) {
    if (!(await canPublish())) {
        return NextResponse.json({ error: 'Sin permiso para preparar casos públicos' }, { status: 403 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: 'El asistente no está configurado' }, { status: 503 });
    }

    const body = await request.json().catch(() => null) as {
        messages?: ChatTurn[];
        draft?: Draft;
        photoNames?: string[];
    } | null;
    const messages = (body?.messages || [])
        .filter(turn => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
        .slice(-12);
    const photoNames = (body?.photoNames || []).filter(name => typeof name === 'string').slice(0, 40);
    if (!messages.length || messages[messages.length - 1].role !== 'user' || photoNames.length === 0) {
        return NextResponse.json({ error: 'Falta la historia del caso o la selección de fotos' }, { status: 400 });
    }

    const context = JSON.stringify({
        cantidadDeFotos: photoNames.length,
        nombresTecnicosDeArchivos: photoNames,
        borradorActual: body?.draft || {},
    });
    const anthropicMessages: Anthropic.MessageParam[] = [
        {
            role: 'user',
            content: `Contexto técnico de la selección (no contiene la identidad del paciente): ${context}`,
        },
        ...messages.map(turn => ({ role: turn.role, content: turn.content }) as Anthropic.MessageParam),
    ];

    try {
        const response = await new Anthropic().messages.create({
            model: getAiModel('clinicalCaseWriter'),
            max_tokens: 1800,
            system: CASE_WRITER_PROMPT,
            tools: [PROPOSAL_TOOL],
            tool_choice: { type: 'tool', name: 'proponer_caso_web' },
            messages: anthropicMessages,
        });
        const proposal = response.content.find(
            (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'proponer_caso_web'
        );
        if (!proposal) throw new Error('El modelo no devolvió un borrador estructurado');
        const input = proposal.input as Record<string, unknown>;
        const descriptions = Array.isArray(input.photoDescriptions)
            ? input.photoDescriptions.map(value => String(value || '')).slice(0, photoNames.length)
            : [];
        while (descriptions.length < photoNames.length) descriptions.push('');
        const descriptionsEn = Array.isArray(input.photoDescriptionsEn)
            ? input.photoDescriptionsEn.map(value => String(value || '')).slice(0, photoNames.length)
            : [];
        while (descriptionsEn.length < photoNames.length) descriptionsEn.push('');

        return NextResponse.json({
            reply: String(input.assistantMessage || 'Preparé un borrador para que lo revises.'),
            proposal: {
                title: String(input.title || '').trim(),
                description: String(input.description || '').trim(),
                photoDescriptions: descriptions,
                titleEn: String(input.titleEn || '').trim(),
                descriptionEn: String(input.descriptionEn || '').trim(),
                photoDescriptionsEn: descriptionsEn,
            },
        });
    } catch (error) {
        console.error('[clinical-cases/assistant]', error instanceof Error ? error.message : 'unknown error');
        return NextResponse.json({ error: 'El asistente no pudo preparar el caso. Probá otra vez.' }, { status: 500 });
    }
}
