'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border bg-card text-card-foreground shadow-sm",
          hover && "transition-shadow hover:shadow-md",
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
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6 pt-0", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-6 pt-0", className)}
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
