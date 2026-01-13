'use client'

import * as React from "react"
import { motion } from 'framer-motion'
import { cn } from "@/lib/utils"

interface CardProps {
  className?: string
  children?: React.ReactNode
  hover?: boolean
  glow?: boolean
  glass?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, glow = false, glass = false, children, ...props }, ref) => {
    const baseStyles = cn(
      "flex flex-col gap-6 rounded-xl border py-6 transition-all duration-300",
      glass
        ? "glass"
        : "bg-card text-card-foreground shadow-sm",
      hover && "card-hover cursor-pointer",
      glow && "hover:shadow-lg hover:shadow-primary/20 dark:hover:shadow-primary/30",
      className
    )

    if (hover) {
      return (
        <motion.div
          ref={ref}
          data-slot="card"
          className={baseStyles}
          whileHover={{ y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      )
    }

    return (
      <div
        ref={ref}
        data-slot="card"
        className={baseStyles}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = "Card"

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

// Animated stat card for dashboards
interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: { value: number; positive: boolean }
  color?: 'purple' | 'blue' | 'green' | 'amber' | 'red'
  delay?: number
}

function StatCard({ title, value, icon, trend, color = 'purple', delay = 0 }: StatCardProps) {
  const colorClasses = {
    purple: 'from-purple-500 to-purple-600 shadow-purple-500/30',
    blue: 'from-blue-500 to-blue-600 shadow-blue-500/30',
    green: 'from-emerald-500 to-emerald-600 shadow-emerald-500/30',
    amber: 'from-amber-500 to-amber-600 shadow-amber-500/30',
    red: 'from-red-500 to-red-600 shadow-red-500/30',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="bg-card rounded-2xl p-6 shadow-lg border border-border hover:shadow-xl transition-shadow"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm mb-1">{title}</p>
          <motion.p
            className="text-2xl font-bold text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: delay + 0.2 }}
          >
            {value}
          </motion.p>
          {trend && (
            <p className={cn(
              "text-xs mt-1 font-medium",
              trend.positive ? "text-emerald-500" : "text-red-500"
            )}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white shadow-lg",
          colorClasses[color]
        )}>
          {icon}
        </div>
      </div>
    </motion.div>
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  StatCard,
}
