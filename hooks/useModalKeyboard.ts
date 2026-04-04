import { useEffect } from 'react';

interface UseModalKeyboardOptions {
    enabled?: boolean;
    disabled?: boolean;
    shouldHandleEnter?: (event: KeyboardEvent) => boolean;
}

export function shouldSubmitOnEnter(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>) {
    if (event.key !== 'Enter') return false;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;

    const target = event.target as HTMLElement | null;
    if (!target) return true;

    const tag = target.tagName.toLowerCase();
    if (tag === 'textarea') return false;

    const input = target as HTMLInputElement;
    if (input.type === 'button' || input.type === 'submit') return false;

    return true;
}

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
    options: UseModalKeyboardOptions = {},
) {
    useEffect(() => {
        if (!isOpen || options.enabled === false) return;

        const handler = (e: KeyboardEvent) => {
            if (options.disabled) return;

            // Global Escape to close
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }

            // Enter handling
            if (e.key === 'Enter' && onConfirm) {
                // EXPLICIT CMD+ENTER or CTRL+ENTER: Always submit if possible
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    onConfirm();
                    return;
                }

                // Regular Enter: only if allowed by shouldSubmitOnEnter logic
                const shouldHandle = options.shouldHandleEnter ?? shouldSubmitOnEnter;
                if (shouldHandle(e)) {
                    e.preventDefault();
                    onConfirm();
                }
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose, onConfirm, options]);
}
