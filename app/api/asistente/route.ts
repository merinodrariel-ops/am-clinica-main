import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { searchPatients, getAppointments, getDoctors, createAppointment } from '@/app/actions/agenda';
import { canAccessInternalAssistant } from '@/lib/asistente-access';
import { runAdminAgentCommand } from '@/lib/admin-agent/service';

export const maxDuration = 60;

const MAX_TOOL_ITERATIONS = 8;
const TIMEZONE = 'America/Argentina/Buenos_Aires';

// Stable system prompt (cached). The current date goes in a separate block
// after the cache breakpoint so it doesn't invalidate the prefix.
const SYSTEM_PROMPT = `Sos el asistente interno de administración de AM Estética Dental, una clínica dental boutique en Argentina. Hablás en español rioplatense, de forma breve, concreta y operativa.

Tu trabajo:
- Responder preguntas de dueños/administración usando herramientas reales.
- Buscar pacientes, consultar agenda, revisar caja, emails enviados y snapshots administrativos.
- Para preguntas de caja, cobros, pacientes, emails, liquidaciones, pagos a profesionales, prestaciones, piezas dentarias o métricas administrativas, usá las herramientas admin_* antes de responder.
- Si preguntan cuántas piezas/prestaciones se le pagaron a un profesional por un mes, usá admin_prestaciones_profesional. Para "este mes" usá el mes actual informado por el sistema; para "correspondientes a junio" usá 2026-06 como mes de realización si el año actual es 2026.
- Cuando admin_prestaciones_profesional devuelva paidValidatedCount, respondé con ese número primero. Si la liquidación no figura pagada o no coincide con el mes de pago consultado, aclaralo explícitamente.
- Antes de crear un turno SIEMPRE: (1) identificá al paciente con buscar_paciente, (2) mirá la agenda del día con ver_agenda para no superponer turnos del mismo doctor, (3) confirmá con la usuaria el resumen (paciente, día, hora, duración, doctor) y recién después llamá crear_turno.
- Si hay varios pacientes con nombre parecido, mostrá las opciones y pedí que elija.
- Duración por defecto de un turno: 60 minutos, salvo que indiquen otra cosa.
- Horario de atención habitual: lunes a viernes 9:00-20:00, sábados 9:00-13:00.
- Las fechas y horas que recibís y enviás a las herramientas son ISO 8601 en hora de Argentina (UTC-3), por ejemplo 2026-06-11T15:00:00-03:00.
- Nunca inventes pacientes, doctores ni horarios: usá las herramientas. Si una herramienta da error, explicalo simple y sugerí qué hacer.
- No des información clínica ni diagnósticos.
- No pidas SQL ni prometas acciones fuera de tus herramientas.
- Las herramientas admin_* son de lectura. No modifican datos.`;

const TOOLS: Anthropic.Tool[] = [
    {
        name: 'admin_overview',
        description: 'Snapshot administrativo read-only: pacientes activos, agenda de hoy y resumen de caja del mes actual.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'admin_buscar_paciente',
        description: 'Busca pacientes para administración con contacto redactado y estado financiero resumido.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Nombre, apellido, DNI, email o teléfono del paciente' },
            },
            required: ['query'],
        },
    },
    {
        name: 'admin_agenda',
        description: 'Resumen read-only de agenda para hoy o los próximos 7 días.',
        input_schema: {
            type: 'object',
            properties: {
                rango: { type: 'string', enum: ['today', 'week'], description: 'today o week' },
            },
        },
    },
    {
        name: 'admin_caja',
        description: 'Resumen read-only de caja recepción y caja administración para un mes YYYY-MM.',
        input_schema: {
            type: 'object',
            properties: {
                mes: { type: 'string', description: 'Mes en formato YYYY-MM. Si falta, usa el mes actual.' },
            },
        },
    },
    {
        name: 'admin_prestaciones_profesional',
        description: 'Detalle read-only de prestaciones/piezas de un profesional por mes de realización, incluyendo liquidación mensual y estado de pago. Usar para preguntas como "cuántas piezas definitivas le pagamos a Julián correspondientes a junio".',
        input_schema: {
            type: 'object',
            properties: {
                profesional: { type: 'string', description: 'Nombre o apellido del profesional, ej: Julian' },
                mes_realizacion: { type: 'string', description: 'Mes de las prestaciones en formato YYYY-MM, ej: 2026-06' },
                mes_pago: { type: 'string', description: 'Mes en que se pagó la liquidación en formato YYYY-MM, opcional. Para "este mes", usar el mes actual.' },
                prestacion: { type: 'string', description: 'Filtro textual opcional, ej: definitivas, pieza dentaria definitiva' },
            },
            required: ['profesional', 'mes_realizacion'],
        },
    },
    {
        name: 'admin_emails',
        description: 'Resumen read-only de emails/logs enviados durante los últimos N días.',
        input_schema: {
            type: 'object',
            properties: {
                dias: { type: 'number', description: 'Cantidad de días hacia atrás, entre 1 y 90.' },
            },
        },
    },
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

async function executeAdminTool(operatorEmail: string, args: string[]): Promise<string> {
    const result = await runAdminAgentCommand({
        supabase: createAdminClient(),
        operatorEmail,
    }, args);

    return typeof result === 'string' ? result : JSON.stringify(result.data);
}

async function executeTool(name: string, input: Record<string, unknown>, operatorEmail: string): Promise<string> {
    switch (name) {
        case 'admin_overview':
            return executeAdminTool(operatorEmail, ['overview']);
        case 'admin_buscar_paciente':
            return executeAdminTool(operatorEmail, ['patient', String(input.query ?? '')]);
        case 'admin_agenda':
            return executeAdminTool(operatorEmail, ['agenda', String(input.rango ?? 'today')]);
        case 'admin_caja': {
            const mes = String(input.mes ?? '').trim();
            return executeAdminTool(operatorEmail, mes ? ['cash', mes] : ['cash']);
        }
        case 'admin_prestaciones_profesional': {
            const args = [
                'provider-services',
                String(input.profesional ?? ''),
                String(input.mes_realizacion ?? ''),
            ];
            const mesPago = String(input.mes_pago ?? '').trim();
            if (mesPago) args.push('--paid-month', mesPago);
            const prestacion = String(input.prestacion ?? '').trim();
            if (prestacion) args.push(prestacion);
            return executeAdminTool(operatorEmail, args);
        }
        case 'admin_emails': {
            const dias = input.dias === undefined ? '30' : String(input.dias);
            return executeAdminTool(operatorEmail, ['emails', dias]);
        }
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
        .select('categoria,email')
        .eq('id', user.id)
        .single();

    if (!profile || !canAccessInternalAssistant(profile.categoria)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const operatorEmail = profile.email || user.email;
    if (!operatorEmail) {
        return NextResponse.json({ error: 'No se pudo identificar el email del operador' }, { status: 403 });
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
                    result = await executeTool(block.name, block.input as Record<string, unknown>, operatorEmail);
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
