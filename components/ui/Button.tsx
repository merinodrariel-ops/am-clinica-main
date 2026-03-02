
import * as React from "react"
import { cn } from "@/lib/utils"

const buttonVariants = {
    default: "bg-gradient-to-r from-emerald-500 to-teal-400 text-white hover:opacity-90 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all",
    destructive: "bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30 transition-all",
    outline: "border border-white/10 bg-transparent hover:bg-white/5 text-slate-200 transition-all",
    secondary: "bg-navy-800 text-slate-200 hover:bg-navy-700 border border-white/5 transition-all",
    ghost: "hover:bg-white/5 text-slate-200 transition-all hover:text-white",
    link: "text-teal-400 underline-offset-4 hover:underline",
}

const buttonSizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
}

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: keyof typeof buttonVariants
    size?: keyof typeof buttonSizes
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        return (
            <button
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    buttonVariants[variant],
                    buttonSizes[size],
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
