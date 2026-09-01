// Fuente de verdad de marca para la propuesta comercial (PDF de presupuesto).
// Los valores replican el sitio público amesteticadental.com para que el paciente
// reciba la misma identidad que ya vio online.

export const AM_COLORS = {
    ink: [13, 13, 13] as [number, number, number],
    inkSoft: [24, 23, 21] as [number, number, number],
    cream: [242, 240, 233] as [number, number, number],
    gold: [201, 169, 110] as [number, number, number],
    goldDeep: [138, 112, 66] as [number, number, number],
    muted: [138, 133, 120] as [number, number, number],
};

export const AM_SITE = 'https://www.amesteticadental.com';

export const AM_LINKS = {
    site: AM_SITE,
    cases: `${AM_SITE}/casos-antes-y-despues`,
    financing: `${AM_SITE}/#financiacion`,
    reviews: 'https://g.page/r/CQ3df5Xn-J6oEBM/review',
    forbes: 'https://www.forbesargentina.com/innovacion/del-1-10-que-tan-linda-tu-sonrisa-ia-te-lo-dira-segundos-n51306',
    maps: "https://maps.google.com/?q=Camila+O'Gorman+412+Puerto+Madero+Buenos+Aires",
};

export const AM_CLINIC = {
    name: 'AM ESTÉTICA DENTAL',
    tagline: 'PUERTO MADERO · BUENOS AIRES',
    address: "Camila O'Gorman 412, Of. 101 · Puerto Madero",
    phone: '+54 9 11 7021-9298',
    doctor: 'Dr. Ariel Merino · M.N. 34.869',
};

export function whatsappUrl(text: string): string {
    return `https://api.whatsapp.com/send?phone=5491170219298&text=${encodeURIComponent(text)}`;
}

export const AM_AUTHORITY: { value: string; label: string }[] = [
    { value: 'Forbes', label: 'Única clínica dental\nde Argentina' },
    { value: '4.9', label: 'Google · +120\nreseñas verificadas' },
    { value: '20+', label: 'años transformando\nsonrisas' },
];

export const AM_TESTIMONIALS: { quote: string; author: string; context: string }[] = [
    {
        quote: 'Nunca sentí que me vendieran algo. Me explicaron todo y el resultado se vio natural desde el primer momento.',
        author: 'Julieta Márquez',
        context: 'Carillas premium · Google Review',
    },
    {
        quote: 'La única pregunta que me hago hoy es por qué no me animé antes a regalarme esta sonrisa que cambió mi vida.',
        author: 'Camila Rossi',
        context: 'Transformación de sonrisa · Google Review',
    },
];

export type ReferenceCase = {
    slug: string;
    kicker: string;
    stat: string;
    headline: string;
    detail: string;
    image: string;
    url: string;
};

// Portadas reales publicadas en el sitio. Se piden a Cloudinary en un tamaño
// liviano para no inflar el PDF que se envía por WhatsApp.
const caseImage = (path: string) =>
    `https://res.cloudinary.com/drctvgyqd/image/upload/w_1000,c_limit,q_auto:good,f_jpg/${path}`;

export const AM_REFERENCE_CASES: ReferenceCase[] = [
    {
        slug: 'agenesia-dental-rehabilitacion-completa-implantes-24-ceramicas',
        kicker: 'AGENESIA DENTAL',
        stat: '2 AÑOS',
        headline: 'Le faltaban dientes de nacimiento. Hoy tiene la cara que siempre quiso.',
        detail: 'Agenesia + microdoncia + dientes oscuros, resuelto con alineadores, implantes y 24 cerámicas.',
        image: caseImage('casos/agenesia-dental/caso-agenesia-dental-antes-despues-rostro-portada-mega-transformacion-rehabilitacion-oral-dr-ariel-merino-am-estetica-dental'),
        url: `${AM_SITE}/casos/agenesia-dental-rehabilitacion-completa-implantes-24-ceramicas`,
    },
    {
        slug: 'rehabilitacion-oral-completa-carillas-coronas-implantes',
        kicker: 'REHABILITACIÓN ORAL',
        stat: 'MENOS DE 1 MES',
        headline: 'Renovó su sonrisa completa en menos de un mes.',
        detail: 'Recambio de coronas, puentes y coronas sobre implantes + carillas cerámicas, con mejora de la mordida.',
        image: caseImage('casos/rehabilitacion-completa-sonrisa/rehabilitacion-oral-completa-antes-despues-rostro-labios-portada-carillas-coronas-implantes-dr-ariel-merino-am-estetica-dental-puerto-madero-buenos-aires.png'),
        url: `${AM_SITE}/casos/rehabilitacion-oral-completa-carillas-coronas-implantes`,
    },
    {
        slug: 'rehabilitacion-ceramica-ambos-maxilares-sin-cirugia-ortodoncia',
        kicker: 'REHABILITACIÓN CERÁMICA',
        stat: '13+ AÑOS EN BOCA',
        headline: 'Una transformación que lleva más de 13 años en boca.',
        detail: 'Apiñamiento resuelto con diseño de sonrisa y cerámica en ambos maxilares, sin cirugía y sin ortodoncia.',
        image: caseImage('casos/carillas-dentales-rehabilitacion-estetica-sonrisa/01-carillas-dentales-antes-despues-retrato-am-estetica-dental-puerto-madero.png'),
        url: `${AM_SITE}/casos/rehabilitacion-ceramica-ambos-maxilares-sin-cirugia-ortodoncia`,
    },
    {
        slug: '20-carillas-porcelana-apinamiento-sin-ortodoncia',
        kicker: 'CARILLAS DE PORCELANA',
        stat: '10 DÍAS',
        headline: '20 carillas en 10 días. Sin ortodoncia. Sin que nadie lo note.',
        detail: 'Apiñamiento residual, desgaste y color resueltos solo con la forma de las carillas.',
        image: caseImage('casos/carillas-sin-ortodoncia/carillas-porcelana-20-piezas-mordida-antes-despues-am-estetica-dental'),
        url: `${AM_SITE}/casos/20-carillas-porcelana-apinamiento-sin-ortodoncia`,
    },
    {
        slug: 'diseno-sonrisa-plano-quebrado-carillas-ceramicas-paciente-italia-milan',
        kicker: 'DISEÑO DE SONRISA',
        stat: '1 SEMANA',
        headline: 'Vino de Milán con la sonrisa quebrada. La resolvimos en una semana.',
        detail: 'Plano de sonrisa quebrado y bordes incisales fracturados, con carillas cerámicas AM.',
        image: caseImage('casos/diseno-sonrisa-plano-quebrado-carillas-ceramicas-paciente-italia-milan/diseno-sonrisa-plano-quebrado-carillas-ceramicas-antes-despues-portada-paciente-italia-milan-dr-ariel-merino-am-estetica-dental'),
        url: `${AM_SITE}/casos/diseno-sonrisa-plano-quebrado-carillas-ceramicas-paciente-italia-milan`,
    },
    {
        slug: 'carilla-unitaria-incisivo-central-oscurecido',
        kicker: 'CARILLA UNITARIA',
        stat: 'CASO PERSONALIZADO',
        headline: 'Un solo diente puede cambiar toda una sonrisa.',
        detail: 'Incisivo central oscurecido por traumatismo, resuelto con blanqueamiento, resinas y una cerámica estratificada.',
        image: caseImage('casos/carilla-unitaria-incisivo-central-oscurecido/carilla-unitaria-incisivo-central-oscurecido-antes-despues-portada-dr-ariel-merino-am-estetica-dental-puerto-madero'),
        url: `${AM_SITE}/casos/carilla-unitaria-incisivo-central-oscurecido`,
    },
];

export const DEFAULT_CASE_SLUGS = [
    AM_REFERENCE_CASES[0].slug,
    AM_REFERENCE_CASES[1].slug,
];

export function findReferenceCases(slugs: string[] | undefined): ReferenceCase[] {
    const wanted = slugs && slugs.length > 0 ? slugs : DEFAULT_CASE_SLUGS;
    return wanted
        .map((slug) => AM_REFERENCE_CASES.find((item) => item.slug === slug))
        .filter((item): item is ReferenceCase => Boolean(item))
        .slice(0, 2);
}
