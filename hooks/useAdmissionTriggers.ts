'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdmissionSubmission } from '@/lib/admission-schema';
import type { AdmissionTriggerMap } from '@/app/actions/admission';

type AdmissionSubmitResponse = {
    success: boolean;
    patientId?: string;
    error?: string;
    triggers?: AdmissionTriggerMap;
    links?: {
        drive: string | null;
        slides: string | null;
    };
};

type QueueItem = {
    id: string;
    createdAt: number;
    payload: AdmissionSubmission;
};

type SubmitOptions = {
    submitAction: (payload: AdmissionSubmission) => Promise<AdmissionSubmitResponse>;
};

const STORAGE_KEY = 'am_admission_offline_queue';

const readQueue = (): QueueItem[] => {
    if (typeof window === 'undefined') return [];

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as QueueItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const saveQueue = (queue: QueueItem[]) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
};

const newQueueItem = (payload: AdmissionSubmission): QueueItem => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
    payload,
});

export function useAdmissionTriggers() {
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        return window.navigator.onLine;
    });
    const [queue, setQueue] = useState<QueueItem[]>(() => readQueue());
    const [submitting, setSubmitting] = useState(false);
    const [lastResult, setLastResult] = useState<AdmissionSubmitResponse | null>(null);
    const flushLockRef = useRef(false);

    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    const enqueue = useCallback((payload: AdmissionSubmission) => {
        const item = newQueueItem(payload);
        const next = [...readQueue(), item];
        saveQueue(next);
        setQueue(next);
        return item;
    }, []);

    const flushQueue = useCallback(async ({ submitAction }: SubmitOptions) => {
        if (flushLockRef.current || !window.navigator.onLine) return;
        const pending = readQueue();
        if (pending.length === 0) return;

        flushLockRef.current = true;

        try {
            let cursor = [...pending];
            while (cursor.length > 0) {
                const item = cursor[0];
                const result = await submitAction(item.payload);

                if (!result.success) {
                    setLastResult(result);
                    break;
                }

                cursor = cursor.slice(1);
                saveQueue(cursor);
                setQueue(cursor);
                setLastResult(result);
            }
        } finally {
            flushLockRef.current = false;
        }
    }, []);

    const submitWithTriggers = useCallback(
        async (payload: AdmissionSubmission, options: SubmitOptions) => {
            if (!window.navigator.onLine) {
                enqueue(payload);
                return {
                    queued: true,
                    result: null as AdmissionSubmitResponse | null,
                };
            }

            setSubmitting(true);
            try {
                const result = await options.submitAction(payload);
                setLastResult(result);

                if (!result.success && /network|fetch|conexión|timeout/i.test(result.error || '')) {
                    enqueue(payload);
                    return { queued: true, result };
                }

                return { queued: false, result };
            } catch {
                enqueue(payload);
                return { queued: true, result: null as AdmissionSubmitResponse | null };
            } finally {
                setSubmitting(false);
            }
        },
        [enqueue],
    );

    const queueCount = useMemo(() => queue.length, [queue.length]);

    return {
        isOnline,
        queueCount,
        queue,
        submitting,
        lastResult,
        enqueue,
        flushQueue,
        submitWithTriggers,
    };
}
