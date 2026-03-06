
import * as React from "react"
import { cn } from "@/lib/utils"

const premiumButtonVariants = {
    default: "group bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-500 hover:to-emerald-500 shadow-xl shadow-teal-500/20 active:scale-[0.98] transition-all duration-500",
    destructive: "group bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 active:scale-[0.98] transition-all duration-500",
    outline: "group border border-white/5 bg-transparent hover:bg-white/5 text-slate-300 hover:text-white active:scale-[0.98] transition-all duration-500",
    secondary: "group bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/10 active:scale-[0.98] transition-all duration-500",
    ghost: "group hover:bg-white/5 text-slate-400 hover:text-white active:scale-[0.98] transition-all duration-500",
    link: "text-teal-400 underline-offset-4 hover:underline transition-all duration-500",
    premium: "group bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-xl shadow-violet-500/25 active:scale-[0.98] transition-all duration-500",
    success: "group bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 active:scale-[0.98] transition-all duration-500",
}

const premiumButtonSizes = {
    default: "h-12 px-6 py-2 rounded-[1.25rem] font-bold text-xs uppercase tracking-widest",
    sm: "h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-wider",
    lg: "h-14 px-8 rounded-[1.5rem] font-black text-xs uppercase tracking-widest",
    icon: "h-12 w-12 rounded-[1.25rem]",
}

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: keyof typeof premiumButtonVariants
    size?: keyof typeof premiumButtonSizes
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        return (
            <button
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed",
                    premiumButtonVariants[variant],
                    premiumButtonSizes[size],
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
