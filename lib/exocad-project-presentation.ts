import type { DriveFile } from '@/app/actions/patient-files-drive';

export interface ExocadProjectPresentation {
    project: DriveFile;
    displayName: string;
    htmlPreview?: DriveFile;
    imagePreview?: DriveFile;
}

const PROJECT_EXTENSIONS = ['.project', '.projects', '.dentalproject'];
const HTML_EXTENSIONS = ['.html', '.htm'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const GENERIC_TOKENS = new Set(['exocad', 'project', 'projects', 'dentalproject', 'html', 'preview', 'image', 'img']);

function extensionMatches(name: string, extensions: string[]): boolean {
    const lower = name.toLowerCase();
    return extensions.some(extension => lower.endsWith(extension));
}

function directoryOf(file: DriveFile): string {
    const path = file.relativePath || file.name;
    const separator = path.lastIndexOf('/');
    return separator >= 0 ? path.slice(0, separator).toLowerCase() : '';
}

function tokensOf(file: DriveFile): Set<string> {
    const basename = file.name.replace(/\.[^.]+$/, '').toLowerCase();
    return new Set(
        basename
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .split(/[^a-z0-9]+/)
            .filter(token => token.length >= 3 && !GENERIC_TOKENS.has(token))
    );
}

function scorePreview(project: DriveFile, candidate: DriveFile): number {
    let score = 0;
    const projectDirectory = directoryOf(project);
    const candidateDirectory = directoryOf(candidate);

    if (projectDirectory && candidateDirectory === projectDirectory) score += 10;
    if (projectDirectory && candidateDirectory.startsWith(`${projectDirectory}/`)) score += 6;

    const projectTokens = tokensOf(project);
    for (const token of tokensOf(candidate)) {
        if (projectTokens.has(token)) score += 4;
    }

    const projectTime = new Date(project.modifiedTime || project.createdTime).getTime();
    const candidateTime = new Date(candidate.modifiedTime || candidate.createdTime).getTime();
    const dayDifference = Math.abs(candidateTime - projectTime) / 86_400_000;
    if (dayDifference <= 1) score += 3;
    else if (dayDifference <= 7) score += 1;

    return score;
}

function bestPreview(project: DriveFile, candidates: DriveFile[], allowSingleFallback = false): DriveFile | undefined {
    const ranked = candidates
        .map(candidate => ({ candidate, score: scorePreview(project, candidate) }))
        .sort((a, b) => b.score - a.score || new Date(b.candidate.modifiedTime || b.candidate.createdTime).getTime() - new Date(a.candidate.modifiedTime || a.candidate.createdTime).getTime());
    const strongMatch = ranked.find(match => match.score >= 4)?.candidate;
    if (strongMatch) return strongMatch;
    return allowSingleFallback && candidates.length === 1 ? candidates[0] : undefined;
}

export function buildExocadProjectPresentations(files: DriveFile[]): ExocadProjectPresentation[] {
    const projects = files.filter(file => extensionMatches(file.name, PROJECT_EXTENSIONS));
    const htmlFiles = files.filter(file => extensionMatches(file.name, HTML_EXTENSIONS) || file.mimeType === 'text/html');
    const imageFiles = files.filter(file => file.mimeType.startsWith('image/') || extensionMatches(file.name, IMAGE_EXTENSIONS));

    return projects
        .map(project => ({
            project,
            displayName: project.appProperties?.amClinicExocadDisplayName?.trim() || project.name,
            htmlPreview: bestPreview(project, htmlFiles, projects.length === 1),
            imagePreview: bestPreview(project, imageFiles),
        }))
        .sort((a, b) => new Date(b.project.modifiedTime || b.project.createdTime).getTime() - new Date(a.project.modifiedTime || a.project.createdTime).getTime());
}
