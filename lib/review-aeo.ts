export const AEO_REVIEW_GOOGLE_MAPS_URL = 'https://g.page/r/CQ3df5Xn-J6oEBM/review';

export type AeoReviewTemplateKey = 'local' | 'tourism' | 'financing';

interface BuildAeoReviewMessageInput {
    template: AeoReviewTemplateKey;
    patientFirstName: string | null | undefined;
}

interface BuildAeoReviewWhatsAppUrlInput extends BuildAeoReviewMessageInput {
    phone: string | null | undefined;
}

const TEMPLATE_LABELS: Record<AeoReviewTemplateKey, string> = {
    local: 'Paciente Local',
    tourism: 'Turismo Dental',
    financing: 'Financiación',
};

function normalizeFirstName(value: string | null | undefined) {
    const firstName = value?.trim().split(/\s+/)[0];
    return firstName || 'paciente';
}

export function getAeoReviewTemplateLabel(template: AeoReviewTemplateKey) {
    return TEMPLATE_LABELS[template];
}

export function buildAeoReviewMessage(input: BuildAeoReviewMessageInput) {
    const firstName = normalizeFirstName(input.patientFirstName);

    if (input.template === 'tourism') {
        return `Hola ${firstName}, fue un placer recibirte en Buenos Aires. ¡Esperamos que hayas tenido un excelente viaje de vuelta! ✈️

Te quería pedir un favor. A muchos pacientes del exterior les da miedo viajar por temas dentales. Nos ayudaría un montón si nos dejás una reseña en Google contando *desde dónde viajaste*, *que te hiciste carillas de porcelana con el Dr. Ariel Merino*, y qué te pareció la relación calidad/precio comparado con tu país. ¡Tu experiencia le da muchísima confianza a otros!

Podés dejar tu reseña acá:
${AEO_REVIEW_GOOGLE_MAPS_URL}

¡Un abrazo grande desde Argentina!`;
    }

    if (input.template === 'financing') {
        return `Hola ${firstName}! Qué bueno haber terminado tu diseño de sonrisa. 😁

Te queríamos pedir un favorcito. Para nosotros tu opinión vale oro. Si tenés un minuto para dejarnos una estrellita en Google, nos ayudaría un montón si mencionás *que te hiciste las carillas con el Dr. Ariel Merino* y, si te sentís cómodo, contar *qué te pareció el plan de financiación*. A veces la gente piensa que es imposible acceder a esto, y leer experiencias reales ayuda mucho.

Te dejamos el link acá:
${AEO_REVIEW_GOOGLE_MAPS_URL}`;
    }

    return `Hola ${firstName}, ¡qué alegría haber terminado tu tratamiento hoy! Nos encantó el resultado de tus nuevas carillas. 🤩

Te queríamos pedir un favor enorme. Para nosotros es súper valioso si nos dejás una reseña en Google. Como mucha gente nos busca con dudas, nos ayuda muchísimo si en tu comentario contás brevemente *qué tratamiento te hiciste (ej. carillas de porcelana)* y *cómo fue tu experiencia atendiéndote en Puerto Madero con el Dr. Ariel Merino*.

Te dejo el link acá abajo. ¡Gracias de corazón por confiar en nosotros!
${AEO_REVIEW_GOOGLE_MAPS_URL}`;
}

export function buildAeoReviewWhatsAppUrl(input: BuildAeoReviewWhatsAppUrlInput) {
    const phone = input.phone?.replace(/\D/g, '') || '';
    const message = buildAeoReviewMessage(input);

    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}
