import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}
const supabase = createClient(supabaseUrl, serviceKey);

function getAuth() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN });
    return auth;
}

function extractPresentationId(link: string | null | undefined): string | null {
    if (!link) return null;
    const match = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

interface SlideElement {
    image?: unknown;
    shape?: { shapeType?: string };
}
interface SlidePage {
    pageElements?: SlideElement[];
}
interface PresentationData {
    slides?: SlidePage[];
}

function countImageSlides(pres: PresentationData): { totalSlides: number; imageSlides: number } {
    const slidesArr = pres.slides || [];
    let imageSlides = 0;
    for (const slide of slidesArr) {
        const elements = slide.pageElements || [];
        if (elements.some((el) => !!el.image)) imageSlides++;
    }
    return { totalSlides: slidesArr.length, imageSlides };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const auth = getAuth();
    const slidesApi = google.slides({ version: 'v1', auth });

    const { data: patients, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, link_google_slides, foto_perfil_url, link_historia_clinica')
        .eq('is_deleted', false)
        .not('link_google_slides', 'is', null)
        .neq('link_google_slides', '');

    if (error) throw error;
    if (!patients) throw new Error('Sin datos');

    console.log(`Analizando ${patients.length} presentaciones de Google Slides...`);

    const ghosts: { id: string; nombre: string; totalSlides: number; hasFoto: boolean; hasHistoria: boolean }[] = [];
    const real: { id: string; nombre: string; totalSlides: number; imageSlides: number }[] = [];
    const errors: { id: string; nombre: string; error: string }[] = [];

    for (let i = 0; i < patients.length; i++) {
        const p = patients[i] as {
            id_paciente: string;
            nombre: string | null;
            apellido: string | null;
            link_google_slides: string | null;
            foto_perfil_url: string | null;
            link_historia_clinica: string | null;
        };
        const presId = extractPresentationId(p.link_google_slides);
        const nombre = `${p.nombre || ''} ${p.apellido || ''}`.trim();

        if (!presId) continue;

        try {
            const res = await slidesApi.presentations.get({ presentationId: presId });
            const { totalSlides, imageSlides } = countImageSlides(res.data as PresentationData);
            if (imageSlides === 0) {
                ghosts.push({
                    id: p.id_paciente,
                    nombre,
                    totalSlides,
                    hasFoto: !!p.foto_perfil_url,
                    hasHistoria: !!p.link_historia_clinica,
                });
            } else {
                real.push({ id: p.id_paciente, nombre, totalSlides, imageSlides });
            }
        } catch (e) {
            errors.push({ id: p.id_paciente, nombre, error: e instanceof Error ? e.message : String(e) });
        }

        if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${patients.length}...`);
        await sleep(250);
    }

    console.log(`\n=== RESULTADOS ===`);
    console.log(`Total analizados: ${patients.length}`);
    console.log(`Con fotos reales (>=1 slide con imagen): ${real.length}`);
    console.log(`SIN fotos (0 slides con imagen) - candidatos "fantasma": ${ghosts.length}`);
    console.log(`Errores al leer presentación (link roto/sin permiso): ${errors.length}`);

    console.log(`\n--- Candidatos "fantasma" (presentación sin ninguna foto) ---`);
    for (const g of ghosts) {
        console.log(`${g.nombre} | id=${g.id} | slides=${g.totalSlides} | fotoPerfil=${g.hasFoto} | historiaClinica=${g.hasHistoria}`);
    }

    if (errors.length) {
        console.log(`\n--- Errores (link roto / sin permiso) ---`);
        for (const e of errors) {
            console.log(`${e.nombre} | id=${e.id} | ${e.error}`);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
