export const AUTO_COMPLETE_SURVEY_GRACE_MINUTES = 30;
export const AUTO_COMPLETE_SURVEY_LOOKBACK_HOURS = 12;

const NON_COMPLETABLE_STATUSES = new Set(['cancelled', 'no_show', 'completed']);

export interface AutoCompleteSurveyCandidate {
    end_time: string;
    status: string | null;
    type: string | null;
    patient_id: string | null;
}

export function getAutoCompleteSurveyWindow(now: Date) {
    return {
        latestEndTime: new Date(now.getTime() - AUTO_COMPLETE_SURVEY_GRACE_MINUTES * 60_000).toISOString(),
        earliestEndTime: new Date(now.getTime() - AUTO_COMPLETE_SURVEY_LOOKBACK_HOURS * 60 * 60_000).toISOString(),
    };
}

export function shouldAutoCompleteForSurvey(
    appointment: AutoCompleteSurveyCandidate,
    now: Date = new Date(),
) {
    if (!appointment.patient_id) return false;
    if (!appointment.type || appointment.type === 'recordatorio_interno') return false;
    if (NON_COMPLETABLE_STATUSES.has(appointment.status ?? '')) return false;

    const endTime = new Date(appointment.end_time).getTime();
    if (!Number.isFinite(endTime)) return false;

    const earliestAllowed = now.getTime() - AUTO_COMPLETE_SURVEY_LOOKBACK_HOURS * 60 * 60_000;
    const latestAllowed = now.getTime() - AUTO_COMPLETE_SURVEY_GRACE_MINUTES * 60_000;

    return endTime >= earliestAllowed && endTime <= latestAllowed;
}
