'use client';

import { useEffect, useState, useCallback } from 'react';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications(userId: string | null) {
    const [permission, setPermission] = useState<PushPermission>('default');
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [loading, setLoading] = useState(false);

    // Check current state on mount
    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setPermission('unsupported');
            return;
        }
        setPermission(Notification.permission as PushPermission);

        // Check if already subscribed
        navigator.serviceWorker.ready.then((reg) => {
            reg.pushManager.getSubscription().then((sub) => {
                setSubscription(sub);
            });
        });
    }, []);

    // Register service worker once
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }, []);

    const subscribe = useCallback(async () => {
        if (!userId || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
        setLoading(true);
        try {
            const perm = await Notification.requestPermission();
            setPermission(perm as PushPermission);
            if (perm !== 'granted') return;

            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as any,
            });
            setSubscription(sub);

            // Save to backend
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, subscription: sub.toJSON() }),
            });
        } catch (err) {
            console.error('Push subscribe error:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    const unsubscribe = useCallback(async () => {
        if (!subscription) return;
        setLoading(true);
        try {
            const endpoint = subscription.endpoint;
            await subscription.unsubscribe();
            setSubscription(null);
            setPermission('default');
            await fetch('/api/push/subscribe', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint }),
            });
        } catch (err) {
            console.error('Push unsubscribe error:', err);
        } finally {
            setLoading(false);
        }
    }, [subscription]);

    return { permission, subscription, loading, subscribe, unsubscribe };
}

// Helper: convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
