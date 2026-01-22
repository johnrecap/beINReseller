'use client'

import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface PageContainerProps {
    children: ReactNode
    title?: string
    description?: string
    className?: string
    /**
     * Optional action element to be displayed on top right
     */
    action?: ReactNode
}

export default function PageContainer({
    children,
    title,
    description,
    className,
    action
}: PageContainerProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn(
                "w-full max-w-[var(--content-max-width)] mx-auto",
                "px-[var(--page-padding-mobile)] lg:px-[var(--page-padding)]",
                "pb-8",
                className
            )}
        >
            {(title || description || action) && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pt-4">
                    <div>
                        {title && (
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-[var(--color-primary-green)] to-[var(--color-primary-green-light)] bg-clip-text text-transparent">
                                {title}
                            </h1>
                        )}
                        {description && (
                            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                {description}
                            </p>
                        )}
                    </div>

                    {action && (
                        <div className="flex-shrink-0">
                            {action}
                        </div>
                    )}
                </div>
            )}

            {children}
        </motion.div>
    )
}
