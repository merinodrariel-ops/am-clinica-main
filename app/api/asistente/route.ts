import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/utils/supabase/server';
import { searchPatients, getAppointments, getDoctors, createAppointment } from '@/app/actions/agenda';

export const maxDuration = 60;

const ALLOWED_ROLES = new Set(['owner', 'admin', 'reception', 'dr', 'developer', 'recaptacion']);
const MAX_TOOL_ITERATIONS = 8;
const TIMEZONE = 'America/Argentina/Buenos_Aires';

// Stable system prompt (cached). The current date goes in a separate block
// after the cache breakpoint so it doesn't invalidate the prefix.
const SYSTEM_PROMPT = `Sos el asistente de agenda de AM Estética Dental, una clínica dental boutique en Argentina. Hablás en español rioplatense, con calidez y de forma breve — tus usuarias son las recepcionistas de la clínica usando el celular.

Tu trabajo:
- Buscar pacientes, consultar la agenda de un día y agendar turnos.
- Antes de crear un turno SIEMPRE: (1) identificá al paciente con buscar_paciente, (2) mirá la agenda del día con ver_agenda para no superponer turnos del mismo doctor, (3) confirmá con la usuaria el resumen (paciente, día, hora, duración, doctor) y recién después llamá crear_turno.
- Si hay varios pacientes con nombre parecido, mostrá las opciones y pedí que elija.
- Duración por defecto de un turno: 60 minutos, salvo que indiquen otra cosa.
- Horario de atención habitual: lunes a viernes 9:00-20:00, sábados 9:00-13:00.
- Las fechas y horas que recibís y enviás a las herramientas son ISO 8601 en hora de Argentina (UTC-3), por ejemplo 2026-06-11T15:00:00-03:00.
- Nunca inventes pacientes, doctores ni horarios: usá las herramientas. Si una herramienta da error, explicalo simple y sugerí qué hacer.
- No des información clínica ni diagnósticos; solo gestión de agenda.`;

const TOOLS: Anthropic.Tool[] = [
    {
        name: 'buscar_paciente',
        description: 'Busca pacientes registrados por nombre, apellido, documento o teléfono. Llamala siempre antes de agendar para obtener el patient_id. Devuelve hasta 10 coincidencias.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Nombre, apellido, DNI o teléfono del paciente' },
            },
            required: ['query'],
        },
    },
    {
        name: 'ver_agenda',
        description: 'Devuelve los turnos de un día (hora inicio/fin, paciente, doctor, tipo, estado). Usala para ver disponibilidad antes de proponer o crear un turno.',
        input_schema: {
            type: 'object',
            properties: {
                fecha: { type: 'string', description: 'Día a consultar en formato YYYY-MM-DD' },
            },
            required: ['fecha'],
        },
    },
    {
        name: 'listar_doctores',
        description: 'Lista los doctores activos de la clínica con su id. Usala cuando necesites el doctor_id para crear un turno o cuando pregunten qué doctores hay.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'crear_turno',
        description: 'Crea un turno en la agenda. Llamala solo después de confirmar paciente, fecha, hora y doctor con la usuaria.',
        input_schema: {
            type: 'object',
            properties: {
                titulo: { type: 'string', description: 'Título corto del turno, ej: "Consulta - María López"' },
                patient_id: { type: 'string', description: 'ID del paciente (de buscar_paciente)' },
                doctor_id: { type: 'string', description: 'ID del doctor (de listar_doctores). Opcional.' },
                inicio: { type: 'string', description: 'Inicio ISO 8601 con offset -03:00' },
                fin: { type: 'string', description: 'Fin ISO 8601 con offset -03:00' },
                tipo: { type: 'string', description: 'Tipo de turno: consulta, limpieza, tratamiento, control, urgencia', },
                notas: { type: 'string', description: 'Notas opcionales' },
            },
            required: ['titulo', 'patient_id', 'inicio', 'fin'],
        },
    },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
    switch (name) {
        case 'buscar_paciente': {
            const results = await searchPatients(String(input.query ?? ''));
            if (!results.length) return 'Sin coincidencias.';
            return JSON.stringify(results.slice(0, 10));
        }
        case 'ver_agenda': {
            const fecha = String(input.fecha ?? '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Error: fecha inválida, usar YYYY-MM-DD.';
            const appointments = await getAppointments(
                `${fecha}T00:00:00-03:00`,
                `${fecha}T23:59:59-03:00`
            );
            if (!appointments.length) return `No hay turnos cargados el ${fecha}.`;
            const condensed = appointments.map((apt) => ({
                inicio: apt.start_time,
                fin: apt.end_time,
                paciente: apt.patient?.full_name ?? apt.title,
                doctor: apt.doctor?.full_name ?? 'Sin doctor',
                tipo: apt.type,
                estado: apt.status,
            }));
            return JSON.stringify(condensed);
        }
        case 'listar_doctores': {
            const doctors = await getDoctors();
            if (!doctors.length) return 'No hay doctores activos cargados.';
            return JSON.stringify(doctors);
        }
        case 'crear_turno': {
            const formData = new FormData();
            formData.set('title', String(input.titulo ?? 'Turno'));
            formData.set('patientId', String(input.patient_id ?? ''));
            if (input.doctor_id) formData.set('doctorId', String(input.doctor_id));
            formData.set('startTime', String(input.inicio ?? ''));
            formData.set('endTime', String(input.fin ?? ''));
            formData.set('type', String(input.tipo ?? 'consulta'));
            formData.set('status', 'confirmed');
            if (input.notas) formData.set('notes', String(input.notas));
            const result = await createAppointment(formData);
            return result.success
                ? 'Turno creado correctamente.'
                : `Error al crear el turno: ${result.error}`;
        }
        default:
            return `Herramienta desconocida: ${name}`;
    }
}

interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .single();

    if (!profile || !ALLOWED_ROLES.has(profile.categoria || '')) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
            { error: 'El asistente no está configurado (falta ANTHROPIC_API_KEY).' },
            { status: 503 }
        );
    }

    let history: ChatTurn[];
    try {
        const body = await request.json();
        history = Array.isArray(body?.messages) ? body.messages : [];
    } catch {
        return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    if (!history.length || history[history.length - 1].role !== 'user') {
        return NextResponse.json({ error: 'Falta el mensaje del usuario' }, { status: 400 });
    }

    const client = new Anthropic();
    const today = new Date().toLocaleDateString('es-AR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TIMEZONE,
    });

    const messages: Anthropic.MessageParam[] = history.slice(-20).map((turn) => ({
        role: turn.role,
        content: turn.content,
    }));

    try {
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
            const response = await client.messages.create({
                model: 'claude-haiku-4-5',
                max_tokens: 1024,
                system: [
                    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
                    { type: 'text', text: `Hoy es ${today} (hora de Argentina).` },
                ],
                tools: TOOLS,
                messages,
            });

            const toolUseBlocks = response.content.filter(
                (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
            );

            if (!toolUseBlocks.length) {
                const text = response.content
                    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                    .map((b) => b.text)
                    .join('\n');
                return NextResponse.json({ reply: text || 'No tengo respuesta para eso.' });
            }

            messages.push({ role: 'assistant', content: response.content });

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of toolUseBlocks) {
                let result: string;
                try {
                    result = await executeTool(block.name, block.input as Record<string, unknown>);
                } catch (err) {
                    result = `Error ejecutando ${block.name}: ${err instanceof Error ? err.message : 'desconocido'}`;
                }
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
            }

            messages.push({ role: 'user', content: toolResults });
        }

        return NextResponse.json({
            reply: 'La consulta se volvió demasiado larga. Probá pedirlo de nuevo en pasos más simples.',
        });
    } catch (error) {
        console.error('[asistente] error:', error);
        return NextResponse.json(
            { error: 'El asistente tuvo un problema. Probá de nuevo en unos segundos.' },
            { status: 500 }
        );
    }
}
