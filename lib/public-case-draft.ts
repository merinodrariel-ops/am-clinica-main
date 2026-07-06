export interface PublicCasePhotoInput {
    id: string;
    name: string;
    description: string;
}

export interface PublicCaseDraftInput {
    patientName: string;
    title: string;
    caseDescription: string;
    photos: PublicCasePhotoInput[];
}

export interface PublicCasePhotoDraft {
    order: number;
    driveFileId: string;
    fileName: string;
    caption: string;
    alt: string;
    cloudinaryPendingPath: string;
    driveDownloadPath: string;
}

export interface PublicCaseDraft {
    slug: string;
    title: string;
    patientName: string;
    caseDescription: string;
    photoCount: number;
    photos: PublicCasePhotoDraft[];
    caseTsSnippet: string;
}

const SPANISH_NUMBER_WORDS: Record<string, number> = {
    uno: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
};

export function slugifyCaseTitle(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 90) || 'caso-clinico';
}

export function splitLongPhotoDescription(text: string, photoCount: number): string[] {
    const descriptions = Array.from({ length: photoCount }, () => '');
    const matches = [...text.matchAll(/\b(?:la\s+)?foto\s+(?:n(?:ro|º|\.)?\s*)?(\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\b/gi)];

    if (matches.length === 0) {
        return descriptions;
    }

    for (let i = 0; i < matches.length; i += 1) {
        const current = matches[i];
        const rawIndex = current[1].toLowerCase();
        const parsedIndex = /^\d+$/.test(rawIndex)
            ? Number(rawIndex)
            : SPANISH_NUMBER_WORDS[rawIndex];
        if (!parsedIndex || parsedIndex < 1 || parsedIndex > photoCount) continue;

        const start = current.index ?? 0;
        const end = matches[i + 1]?.index ?? text.length;
        const chunk = text.slice(start, end).trim();
        descriptions[parsedIndex - 1] = chunk.replace(/\s+/g, ' ');
    }

    return descriptions;
}

function stripExtension(name: string): string {
    return name.replace(/\.[a-z0-9]{2,5}$/i, '');
}

function sanitizeCloudinarySegment(value: string): string {
    return slugifyCaseTitle(stripExtension(value)).slice(0, 80) || 'foto';
}

function escapeForTs(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

export function buildPublicCaseDraft(input: PublicCaseDraftInput): PublicCaseDraft {
    const title = input.title.trim() || `Caso clínico - ${input.patientName}`;
    const slug = slugifyCaseTitle(title);
    const patientName = input.patientName.trim();
    const caseDescription = input.caseDescription.trim();

    const photos = input.photos.map((photo, index): PublicCasePhotoDraft => {
        const caption = photo.description.trim() || stripExtension(photo.name);
        const publicId = `${String(index + 1).padStart(2, '0')}-${sanitizeCloudinarySegment(caption || photo.name)}`;

        return {
            order: index + 1,
            driveFileId: photo.id,
            fileName: photo.name,
            caption,
            alt: `${caption} - caso clínico AM Estética Dental`,
            cloudinaryPendingPath: `casos/${slug}/${publicId}`,
            driveDownloadPath: `/api/drive/file/${photo.id}`,
        };
    });

    const photoSnippet = photos.map(photo => `            {
                src: "https://res.cloudinary.com/drctvgyqd/image/upload/q_auto,f_auto/${photo.cloudinaryPendingPath}",
                alt: "${escapeForTs(photo.alt)}",
                caption: "${escapeForTs(photo.caption)}",
            }`).join(',\n');

    const caseTsSnippet = `{
        slug: "${slug}",
        titulo: "${escapeForTs(title)}",
        subtitulo: "${escapeForTs(caseDescription.split('\n')[0] || title)}",
        descripcion: "${escapeForTs(caseDescription || title)}",
        categorias: ["Diseño de sonrisa"],
        duracion: "A definir",
        tecnica: "A definir",
        fotoPortada: {
            src: "https://res.cloudinary.com/drctvgyqd/image/upload/q_auto,f_auto/${photos[0]?.cloudinaryPendingPath || `casos/${slug}/01-portada`}",
            alt: "${escapeForTs(photos[0]?.alt || title)}",
        },
        fotos: [
${photoSnippet}
        ],
        copy: \`${escapeForTs(caseDescription || title)}\`,
        publicado: true,
    }`;

    return {
        slug,
        title,
        patientName,
        caseDescription,
        photoCount: photos.length,
        photos,
        caseTsSnippet,
    };
}
