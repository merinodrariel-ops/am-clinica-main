export const ASSISTANT_ALLOWED_CATEGORIES = ['owner', 'admin', 'developer'] as const;

const ASSISTANT_ALLOWED_SET = new Set<string>(ASSISTANT_ALLOWED_CATEGORIES);

export function canAccessInternalAssistant(categoria: string | null | undefined): boolean {
    return ASSISTANT_ALLOWED_SET.has(categoria ?? '');
}
