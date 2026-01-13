'use client'

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { motion } from 'framer-motion'

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-all duration-200 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-sm shadow-primary/25 [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white shadow-sm shadow-destructive/25 [a&]:hover:bg-destructive/90",
        outline:
          "text-foreground border-border [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success:
          "border-transparent bg-emerald-500 text-white shadow-sm shadow-emerald-500/25 [a&]:hover:bg-emerald-600",
        warning:
          "border-transparent bg-amber-500 text-white shadow-sm shadow-amber-500/25 [a&]:hover:bg-amber-600",
        info:
          "border-transparent bg-blue-500 text-white shadow-sm shadow-blue-500/25 [a&]:hover:bg-blue-600",
        glow:
          "border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/40 animate-pulse-glow",
        gradient:
          "border-transparent bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-sm shadow-purple-500/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface BadgeProps extends React.ComponentProps<"span">,
  VariantProps<typeof badgeVariants> {
  asChild?: boolean
  pulse?: boolean
  dot?: boolean
  dotColor?: string
}

function Badge({
  className,
  variant,
  asChild = false,
  pulse = false,
  dot = false,
  dotColor = 'bg-current',
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : "span"

  const badge = (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot && (
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          dotColor,
          pulse && "animate-pulse"
        )} />
      )}
      {props.children}
    </Comp>
  )

  if (pulse) {
    return (
      <span className="relative inline-flex">
        {badge}
        <motion.span
          className={cn(
            "absolute inset-0 rounded-full",
            variant === 'destructive' ? 'bg-destructive' :
              variant === 'success' ? 'bg-emerald-500' :
                variant === 'warning' ? 'bg-amber-500' :
                  'bg-primary'
          )}
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </span>
    )
  }

  return badge
}

export { Badge, badgeVariants }
