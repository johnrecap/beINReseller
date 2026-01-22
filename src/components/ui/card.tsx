'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'glass' | 'flat'
  hover?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'primary', hover = false, ...props }, ref) => {

    const variants = {
      primary: 'bg-[var(--color-bg-card)] border border-[var(--color-border-default)] shadow-[var(--shadow-card)]',
      glass: 'bg-[var(--color-bg-card)]/50 border border-white/5 shadow-sm', // No backdrop-blur per rules
      flat: 'bg-[var(--color-bg-elevated)] border-0 shadow-none'
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--radius-lg)] text-[var(--color-text-primary)]",
          variants[variant],
          hover && "transition-transform duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]",
          className
        )}
        {...props}
      />
    )
  }
)
Card.displayName = "Card"

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-[var(--space-6)]", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-[var(--font-size-2xl)] font-bold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-[var(--font-size-sm)] text-[var(--color-text-secondary)]", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-[var(--space-6)] pt-0", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-[var(--space-6)] pt-0", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
