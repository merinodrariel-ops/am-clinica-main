'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';

interface PatientSectionProps {
    id: string;
    title: string;
    icon: LucideIcon;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

export default function PatientSection({ id, title, icon: Icon, defaultOpen = false, children }: PatientSectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [mounted, setMounted] = useState(defaultOpen);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Lazy-mount: render children only when section enters viewport for the first time.
    // Sections with defaultOpen=true skip this and mount immediately.
    useEffect(() => {
        if (defaultOpen) return; // already mounted
        const el = wrapperRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setMounted(true);
                    obs.disconnect();
                }
            },
            { rootMargin: '200px' } // start loading slightly before visible
        );
        obs.observe(el);
        return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div ref={wrapperRef} id={id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    <Icon size={18} className="text-gray-400 dark:text-white/40 shrink-0" />
                    <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
                </div>
                <motion.div
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown size={16} className="text-gray-400 dark:text-white/30" />
                </motion.div>
            </button>

            {/* Body */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="px-6 pb-6 pt-1">
                            {mounted ? children : (
                                <div className="h-32 flex items-center justify-center text-gray-300 dark:text-white/20 text-sm">
                                    Cargando...
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
