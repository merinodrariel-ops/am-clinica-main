/**
 * Aunque Next permite configurar server actions de hasta 20 MB, Vercel corta el
 * request antes de ejecutar la action cuando el payload total supera 4.5 MB.
 * Una foto intraoral con el fondo removido suele quedar en ese falso margen y la
 * UI parecía no hacer nada porque el backend de la aplicación nunca era invocado.
 *
 * Acá calculamos cuánto hay que reducir para entrar en el límite, preservando
 * transparencia (PNG/WebP soportan alpha; JPEG no).
 */
// Dejamos margen para el envelope multipart/FormData además de los bytes del archivo.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** ¿El formato preserva canal alpha? */
export function supportsAlpha(mime: string): boolean {
    return mime === 'image/png' || mime === 'image/webp';
}

/**
 * Factor de escala (0 < f <= 1) para acercar `bytes` a `maxBytes`.
 * El peso de un bitmap crece ~con el área, así que escalamos por sqrt del ratio,
 * con un 10% extra de margen porque la compresión no es exactamente lineal.
 */
export function computeScaleForLimit(bytes: number, maxBytes: number = MAX_UPLOAD_BYTES): number {
    if (!Number.isFinite(bytes) || bytes <= 0) return 1;
    if (bytes <= maxBytes) return 1;
    const scale = Math.sqrt(maxBytes / bytes) * 0.9;
    return Math.max(0.1, Math.min(1, scale));
}

/**
 * Formato de reintento cuando un export no entra en el límite.
 * PNG con alpha → WebP (mantiene transparencia y pesa mucho menos).
 * Sin alpha → JPEG.
 */
export function pickFallbackMime(currentMime: string, hasAlpha: boolean): string {
    if (hasAlpha) return 'image/webp';
    return currentMime === 'image/jpeg' ? 'image/jpeg' : 'image/jpeg';
}

export function isOverLimit(bytes: number, maxBytes: number = MAX_UPLOAD_BYTES): boolean {
    return bytes > maxBytes;
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
}
