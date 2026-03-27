'use client';

import { useRef } from 'react';
import { X } from 'lucide-react';
import { useModalKeyboard } from '@/hooks/useModalKeyboard';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title?: string;
    children: React.ReactNode;
    /** Extra classes for the inner panel (e.g. max-w-2xl) */
    className?: string;
    /** Whether to show the default X button in the header */
    showCloseButton?: boolean;
}

/**
 * Universal modal wrapper.
 * - Escape → onClose
 * - Enter (outside textarea/select/button) → onConfirm (if provided)
 * - Click outside → onClose
 * - Traps focus inside the panel
 */
export default function Modal({
    isOpen,
    onClose,
    onConfirm,
    title,
    children,
    className = 'max-w-lg',
    showCloseButton = true,
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);

    useModalKeyboard(isOpen, onClose, onConfirm);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full ${className} max-h-[90vh] overflow-y-auto outline-none animate-in fade-in zoom-in duration-200`}
            >
                {title && (
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}
