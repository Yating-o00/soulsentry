import * as React from "react"
import { cn } from "@/lib/utils"

const Kbd = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-600 opacity-100",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Kbd.displayName = "Kbd"

export { Kbd }