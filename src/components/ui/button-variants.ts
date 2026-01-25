import { cn } from "@/lib/utils"

export interface ButtonVariantsProps {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
    size?: 'sm' | 'md' | 'lg'
}

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

export function buttonVariants({ variant = 'primary', size = 'md' }: ButtonVariantsProps = {}) {
    return cn(baseStyles, variants[variant], sizes[size])
}
