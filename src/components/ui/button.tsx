'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { forwardRef, MouseEvent } from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, loading, disabled, variant = 'primary', size = 'md', ...props }, ref) => {

    const baseStyles = 'relative inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]'

    const variants = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm border border-transparent',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent',
      danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm border border-transparent',
      outline: 'bg-background text-foreground border border-input hover:bg-accent hover:text-accent-foreground',
      ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm h-8',
      md: 'px-4 py-2 text-sm h-10',
      lg: 'px-6 py-3 text-base h-12',
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {!loading && children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
