import { useEffect } from 'react';

/**
 * Adds Enter → confirm and Escape → close keyboard shortcuts to a modal.
 * @param isOpen   Whether the modal is currently open.
 * @param onConfirm  Called when Enter is pressed (omit if the modal uses a <form onSubmit>).
 * @param onClose  Called when Escape is pressed.
 */
export function useModalKeyboard(
    isOpen: boolean,
    onClose: () => void,
    onConfirm?: () => void,
) {
    useEffect(() => {
        if (!isOpen) return;

        const handler = (e: KeyboardEvent) => {
            // Don't intercept inside textareas (multi-line input — Enter should add newline)
            if (e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'Enter' && onConfirm) {
                // Don't fire if a button/select is focused (let the browser handle it)
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'A') return;
                e.preventDefault();
                onConfirm();
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose, onConfirm]);
}
