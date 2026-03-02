
import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    "flex min-h-[80px] w-full rounded-md border border-white/10 bg-navy-900/50 px-3 py-2 text-sm text-slate-200 ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500 focus-visible:border-teal-500/50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors backdrop-blur-sm",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = "Textarea"

export { Textarea }
