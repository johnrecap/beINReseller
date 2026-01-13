/**
 * Enhanced Skeleton Loaders with shimmer effect
 */

'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface SkeletonProps {
    className?: string
    shimmer?: boolean
}

export function Skeleton({ className, shimmer = true }: SkeletonProps) {
    return (
        <div
            className={cn(
                'rounded-lg bg-muted relative overflow-hidden',
                className
            )}
        >
            {shimmer && (
                <motion.div
                    className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent"
                    animate={{ translateX: ['-100%', '100%'] }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                />
            )}
        </div>
    )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            {/* Header */}
            <div className="bg-muted/50 p-4 border-b border-border">
                <div className="flex gap-4">
                    {Array.from({ length: cols }).map((_, i) => (
                        <Skeleton key={i} className="h-4 flex-1" />
                    ))}
                </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <motion.div
                        key={rowIndex}
                        className="p-4 flex gap-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: rowIndex * 0.1 }}
                    >
                        {Array.from({ length: cols }).map((_, colIndex) => (
                            <Skeleton key={colIndex} className="h-4 flex-1" />
                        ))}
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

export function CardSkeleton() {
    return (
        <motion.div
            className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-16" />
                </div>
            </div>
        </motion.div>
    )
}

export function StatsSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                >
                    <CardSkeleton />
                </motion.div>
            ))}
        </div>
    )
}

export function FormSkeleton() {
    return (
        <motion.div
            className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            {Array.from({ length: 4 }).map((_, i) => (
                <motion.div
                    key={i}
                    className="space-y-2"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                >
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                </motion.div>
            ))}
            <Skeleton className="h-10 w-32" />
        </motion.div>
    )
}

export function PageHeaderSkeleton() {
    return (
        <div className="flex items-center gap-3 mb-8">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
            </div>
        </div>
    )
}
