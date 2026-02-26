import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    delay?: number;
}

export function GlassCard({ children, className = '', delay = 0 }: GlassCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.5, ease: 'easeOut' }}
            className={`
                relative overflow-hidden
                bg-white/10 dark:bg-slate-900/40 
                backdrop-blur-xl
                border border-white/20 dark:border-slate-800/50
                shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]
                rounded-3xl
                ${className}
            `}
        >
            {/* Subtle Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
            {children}
        </motion.div>
    );
}
