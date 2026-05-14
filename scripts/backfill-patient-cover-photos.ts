import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { extractFolderIdFromUrl, listFolderFiles } from '../lib/google-drive';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

type Patient = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    foto_perfil_url: string | null;
    link_historia_clinica: string | null;
};

type DriveItem = {
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
};

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const patientFilter = process.argv.find(arg => arg.startsWith('--patient='))?.split('=')[1]?.trim();
const maxArg = Number(process.argv.find(arg => arg.startsWith('--max='))?.split('=')[1] || '100');
const max = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : 100;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, serviceKey);

function patientName(patient: Patient) {
    return `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*/, '').trim() || patient.id_paciente;
}

function isImage(item: DriveItem) {
    return item.mimeType.startsWith('image/');
}

function scoreImageName(name: string) {
    const normalized = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    let score = 0;
    if (/(rostro|frente|facial|face|retrato|portrait)/.test(normalized)) score += 100;
    if (/(smile design|diseno|diseño|resultado|comparativa|natural|after|before)/.test(normalized)) score -= 90;
    if (/(perfil|lateral|intra|oclusal|mordida|rx|radiografia|scan|escaneo|video)/.test(normalized)) score -= 50;
    if (/\.(jpg|jpeg|png|webp)$/i.test(name)) score += 5;
    return score;
}

function pickCoverImage(files: DriveItem[]) {
    return files
        .filter(isImage)
        .map((file, index) => ({ file, index, score: scoreImageName(file.name) }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.index - b.index;
        })[0]?.file || null;
}

async function findPhotoFolder(motherFolderId: string) {
    const root = await listFolderFiles(motherFolderId);
    if (root.error) throw new Error(root.error);

    const folders = (root.files || []).filter(item => item.mimeType === 'application/vnd.google-apps.folder');
    return folders.find(folder => /foto|video|photo|imagen/i.test(folder.name))
        || folders.find(folder => /\[foto/i.test(folder.name))
        || null;
}

async function main() {
    let query = supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, foto_perfil_url, link_historia_clinica')
        .eq('is_deleted', false)
        .is('foto_perfil_url', null)
        .not('link_historia_clinica', 'is', null)
        .limit(max);

    if (patientFilter) {
        const term = `%${patientFilter}%`;
        const filters = [`nombre.ilike.${term}`, `apellido.ilike.${term}`];
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(patientFilter)) {
            filters.push(`id_paciente.eq.${patientFilter}`);
        }
        query = query.or(filters.join(','));
    }

    const { data: patients, error } = await query;
    if (error) throw new Error(error.message);

    let found = 0;
    let updated = 0;
    let skipped = 0;

    for (const patient of (patients || []) as Patient[]) {
        const folderId = extractFolderIdFromUrl(patient.link_historia_clinica);
        if (!folderId) {
            skipped++;
            console.log(`SKIP sin carpeta valida: ${patientName(patient)}`);
            continue;
        }

        try {
            const photoFolder = await findPhotoFolder(folderId);
            if (!photoFolder) {
                skipped++;
                console.log(`SKIP sin carpeta FOTO: ${patientName(patient)}`);
                continue;
            }

            const photoFiles = await listFolderFiles(photoFolder.id);
            if (photoFiles.error) throw new Error(photoFiles.error);
            const cover = pickCoverImage((photoFiles.files || []) as DriveItem[]);
            if (!cover) {
                skipped++;
                console.log(`SKIP sin imagenes: ${patientName(patient)} (${photoFolder.name})`);
                continue;
            }

            found++;
            console.log(`${execute ? 'UPDATE' : 'DRY'} ${patientName(patient)} -> ${cover.name} (${cover.id})`);

            if (execute) {
                const { error: updateError } = await supabase
                    .from('pacientes')
                    .update({ foto_perfil_url: cover.id })
                    .eq('id_paciente', patient.id_paciente);
                if (updateError) throw new Error(updateError.message);
                updated++;
            }
        } catch (err) {
            skipped++;
            console.log(`ERROR ${patientName(patient)}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(JSON.stringify({ execute, checked: patients?.length || 0, found, updated, skipped }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
