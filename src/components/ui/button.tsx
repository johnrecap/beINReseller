'use client'

/**
 * Enhanced Button with animations and ripple effect
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { forwardRef, useState, MouseEvent } from 'react'
import { motion } from 'framer-motion'

export interface ButtonProps {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gradient' | 'glow'
  size?: 'sm' | 'md' | 'lg'
  ripple?: boolean
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  children?: React.ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, loading, disabled, variant = 'primary', size = 'md', ripple = true, onClick, type = 'button', ...props }, ref) => {
    const [rippleEffect, setRippleEffect] = useState<{ x: number; y: number } | null>(null)

    const baseStyles = 'relative inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden'

    const variants = {
      primary: 'bg-primary text-primary-foreground hover:opacity-90 focus:ring-primary shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-secondary',
      danger: 'bg-destructive text-white hover:opacity-90 focus:ring-destructive shadow-lg shadow-destructive/25',
      ghost: 'text-foreground hover:bg-muted focus:ring-muted',
      gradient: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700 focus:ring-purple-500 shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30',
      glow: 'bg-primary text-primary-foreground focus:ring-primary shadow-lg shadow-primary/40 hover:shadow-xl hover:shadow-primary/50 animate-pulse-glow',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-5 py-2.5',
      lg: 'px-7 py-3.5 text-lg',
    }

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (ripple && !disabled && !loading) {
        const rect = e.currentTarget.getBoundingClientRect()
        setRippleEffect({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
        setTimeout(() => setRippleEffect(null), 600)
      }
      onClick?.(e)
    }

    return (
      <motion.button
        ref={ref}
        type={type}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        onClick={handleClick}
        whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
        whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
        transition={{ duration: 0.2 }}
        {...props}
      >
        {/* Ripple Effect */}
        {rippleEffect && (
          <motion.span
            className="absolute rounded-full bg-white/30 pointer-events-none"
            initial={{ width: 0, height: 0, opacity: 1 }}
            animate={{ width: 300, height: 300, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              left: rippleEffect.x - 150,
              top: rippleEffect.y - 150,
            }}
          />
        )}

        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
