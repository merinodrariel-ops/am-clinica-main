export const DEFAULT_AI_MODELS = {
    implicitHours: 'gemini-3.5-flash-lite',
    contractAssistant: 'gemini-3.5-flash',
    scheduleImport: 'gemini-2.5-flash',
    predictivePulse: 'gemini-2.5-flash',
    smileAlignment: 'gemini-2.5-flash',
    smileImage: 'gemini-2.5-flash-image',
    smileVideo: 'veo-3.1-lite-generate-preview',
    clinicalCaseWriter: 'claude-haiku-4-5',
    adminAssistant: 'claude-haiku-4-5',
} as const;

export type AiModelWorkload = keyof typeof DEFAULT_AI_MODELS;

const MODEL_ENV_VARS: Record<AiModelWorkload, string> = {
    implicitHours: 'AI_MODEL_IMPLICIT_HOURS',
    contractAssistant: 'AI_MODEL_CONTRACT_ASSISTANT',
    scheduleImport: 'AI_MODEL_SCHEDULE_IMPORT',
    predictivePulse: 'AI_MODEL_PREDICTIVE_PULSE',
    smileAlignment: 'AI_MODEL_SMILE_ALIGNMENT',
    smileImage: 'AI_MODEL_SMILE_IMAGE',
    smileVideo: 'AI_MODEL_SMILE_VIDEO',
    clinicalCaseWriter: 'AI_MODEL_CLINICAL_CASE_WRITER',
    adminAssistant: 'AI_MODEL_ADMIN_ASSISTANT',
};

export function getAiModel(
    workload: AiModelWorkload,
    env: Readonly<Record<string, string | undefined>> = process.env,
): string {
    const configured = env[MODEL_ENV_VARS[workload]]?.trim();
    return configured || DEFAULT_AI_MODELS[workload];
}
