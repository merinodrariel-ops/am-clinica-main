/**
 * DEV-ONLY: Email template preview
 * Renderiza cualquier template de email en el browser para diseño y QA.
 *
 * Uso: GET /api/dev/email-preview?template=timeline&send=true&to=email@example.com
 *
 * Templates disponibles:
 *   - timeline        → Email de avance de tratamiento con línea de tiempo
 *   - welcome         → Email de bienvenida a nuevo paciente
 *   - magic-link      → Email de acceso al portal del paciente
 *   - invitation      → Email de invitación a miembro del equipo
 */

import { NextResponse } from 'next/server';
import {
    generateTreatmentTimelineEmail,
    generatePremiumWelcomeEmail,
    generatePatientMagicLinkEmail,
    generateInvitationMessage,
} from '@/lib/email-templates';
import { EmailService } from '@/lib/email-service';

// Solo disponible en desarrollo
const isDev = process.env.NODE_ENV !== 'production';

// Datos de ejemplo para preview
const MOCK_STAGES_ALINEADORES = [
    { name: 'Consulta inicial y diagnóstico', order_index: 1 },
    { name: 'Toma de registros y fotografías', order_index: 2 },
    { name: 'Planificación digital (setup)', order_index: 3 },
    { name: 'Fabricación de alineadores', order_index: 4 },
    { name: 'Entrega alineador 1 — inicio activo', order_index: 5 },
    { name: 'Control intermedio', order_index: 6 },
    { name: 'Alineador final', order_index: 7 },
    { name: 'Retención y alta', order_index: 8 },
];

const MOCK_STAGES_IMPLANTES = [
    { name: 'Consulta y plan de implante', order_index: 1 },
    { name: 'Estudios previos (CBCT / OPG)', order_index: 2 },
    { name: 'Seña abonada — inicio de caso', order_index: 3 },
    { name: 'Cirugía de colocación', order_index: 4 },
    { name: 'Osteointegración (3–6 meses)', order_index: 5 },
    { name: 'Descubierta e impresión', order_index: 6 },
    { name: 'Colocación de corona definitiva', order_index: 7 },
    { name: 'Alta y mantenimiento', order_index: 8 },
];

const MOCK_STAGES_DISENO = [
    { name: 'Consulta estética', order_index: 1 },
    { name: 'Fotografías y registros digitales', order_index: 2 },
    { name: 'Diseño Digital de Sonrisa (DDS)', order_index: 3 },
    { name: 'Aprobación del diseño', order_index: 4 },
    { name: 'Preparación y provisorios', order_index: 5 },
    { name: 'Prueba de carillas definitivas', order_index: 6 },
    { name: 'Cementado final', order_index: 7 },
    { name: 'Controles y alta estética', order_index: 8 },
];

function getTemplateHtml(template: string, currentStage: number): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    switch (template) {
        case 'timeline':
        case 'timeline-alineadores':
            return generateTreatmentTimelineEmail({
                nombre: 'Valentina',
                workflowName: 'Diseño de Alineadores Invisibles',
                currentStageName: MOCK_STAGES_ALINEADORES[currentStage - 1]?.name ?? 'Etapa de muestra',
                currentStageOrder: currentStage,
                allStages: MOCK_STAGES_ALINEADORES,
                portalUrl: `${appUrl}/mi-clinica`,
                nextAppointmentDate: 'martes, 18 de marzo de 2025',
            });

        case 'timeline-implantes':
            return generateTreatmentTimelineEmail({
                nombre: 'Rodrigo',
                workflowName: 'Cirugía e Implantes',
                currentStageName: MOCK_STAGES_IMPLANTES[currentStage - 1]?.name ?? 'Etapa de muestra',
                currentStageOrder: currentStage,
                allStages: MOCK_STAGES_IMPLANTES,
                portalUrl: `${appUrl}/mi-clinica`,
                nextAppointmentDate: 'jueves, 10 de abril de 2025',
            });

        case 'timeline-diseno':
            return generateTreatmentTimelineEmail({
                nombre: 'Luciana',
                workflowName: 'Diseño de Sonrisa',
                currentStageName: MOCK_STAGES_DISENO[currentStage - 1]?.name ?? 'Etapa de muestra',
                currentStageOrder: currentStage,
                allStages: MOCK_STAGES_DISENO,
                portalUrl: `${appUrl}/mi-clinica`,
                nextAppointmentDate: null,
            });

        case 'welcome':
            return generatePremiumWelcomeEmail('Valentina', `${appUrl}/mi-clinica`);

        case 'magic-link':
            return generatePatientMagicLinkEmail('Valentina', `${appUrl}/mi-clinica/TOKEN_DE_EJEMPLO`);

        case 'invitation':
            return generateInvitationMessage('Dr. Merino', `${appUrl}/auth/accept?token=TOKEN_DE_EJEMPLO`);

        default:
            return `
                <html><body style="font-family:monospace;padding:40px;background:#111;color:#C9A96E;">
                    <h2>Templates disponibles:</h2>
                    <ul style="line-height:2.2;color:#fff;">
                        <li><a style="color:#C9A96E;" href="?template=timeline&stage=1">timeline (alineadores, etapa 1)</a></li>
                        <li><a style="color:#C9A96E;" href="?template=timeline&stage=3">timeline (alineadores, etapa 3)</a></li>
                        <li><a style="color:#C9A96E;" href="?template=timeline&stage=6">timeline (alineadores, etapa 6)</a></li>
                        <li><a style="color:#C9A96E;" href="?template=timeline-implantes&stage=4">timeline-implantes (etapa 4 — cirugía)</a></li>
                        <li><a style="color:#C9A96E;" href="?template=timeline-diseno&stage=3">timeline-diseno (etapa 3 — DDS)</a></li>
                        <li><a style="color:#C9A96E;" href="?template=welcome">welcome</a></li>
                        <li><a style="color:#C9A96E;" href="?template=magic-link">magic-link</a></li>
                        <li><a style="color:#C9A96E;" href="?template=invitation">invitation</a></li>
                    </ul>
                    <p style="color:#555;margin-top:32px;">
                        Parámetros: <code style="color:#C9A96E;">?template=timeline&amp;stage=3&amp;send=true&amp;to=tu@email.com</code>
                    </p>
                </body></html>
            `;
    }
}

export async function GET(request: Request) {
    if (!isDev) {
        return NextResponse.json({ error: 'Solo disponible en desarrollo' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const template = searchParams.get('template') || '';
    const stage = Math.max(1, Math.min(8, parseInt(searchParams.get('stage') || '3', 10)));
    const shouldSend = searchParams.get('send') === 'true';
    const to = searchParams.get('to') || process.env.GMAIL_USER || '';

    const html = getTemplateHtml(template, stage);

    // Si se pasa ?send=true&to=email, envía el email real además de mostrarlo
    if (shouldSend && to) {
        const subjectMap: Record<string, string> = {
            'timeline': `[PREVIEW] Tu tratamiento avanzó — Etapa ${stage}`,
            'timeline-implantes': `[PREVIEW] Tu tratamiento avanzó — Implantes Etapa ${stage}`,
            'timeline-diseno': `[PREVIEW] Tu tratamiento avanzó — Diseño de Sonrisa Etapa ${stage}`,
            'welcome': '[PREVIEW] Bienvenido a AM Clínica',
            'magic-link': '[PREVIEW] Acceso al Portal',
            'invitation': '[PREVIEW] Invitación al equipo',
        };

        await EmailService.send({
            to,
            subject: subjectMap[template] || `[PREVIEW] Template: ${template}`,
            html,
        });
    }

    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
