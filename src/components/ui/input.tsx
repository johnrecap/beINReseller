'use client'

import * as React from "react"
import { motion } from 'framer-motion'
import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean
  glow?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, glow = true, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)

    return (
      <div className="relative">
        {/* Glow effect on focus */}
        {glow && (
          <motion.div
            className="absolute inset-0 rounded-xl bg-primary/20 blur-lg -z-10"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: isFocused ? 1 : 0,
              scale: isFocused ? 1 : 0.95
            }}
            transition={{ duration: 0.2 }}
          />
        )}

        <input
          type={type}
          className={cn(
            "flex h-11 w-full rounded-xl border bg-background px-4 py-2 text-base",
            "transition-all duration-200",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-destructive focus:ring-destructive"
              : "border-input hover:border-primary/50",
            isFocused && "border-primary",
            className
          )}
          ref={ref}
          onFocus={(e) => {
            setIsFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            props.onBlur?.(e)
          }}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = "Input"

// Animated input with floating label
interface FloatingInputProps extends InputProps {
  label: string
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ className, label, error, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasValue, setHasValue] = React.useState(false)

    return (
      <div className="relative">
        {/* Glow effect */}
        <motion.div
          className="absolute inset-0 rounded-xl bg-primary/20 blur-lg -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: isFocused ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        />

        <input
          className={cn(
            "peer flex h-14 w-full rounded-xl border bg-background px-4 pt-5 pb-2 text-base",
            "transition-all duration-200",
            "placeholder:text-transparent",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-destructive focus:ring-destructive"
              : "border-input hover:border-primary/50",
            className
          )}
          ref={ref}
          placeholder={label}
          onFocus={(e) => {
            setIsFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            setHasValue(!!e.target.value)
            props.onBlur?.(e)
          }}
          onChange={(e) => {
            setHasValue(!!e.target.value)
            props.onChange?.(e)
          }}
          {...props}
        />

        {/* Floating Label */}
        <motion.label
          className={cn(
            "absolute pointer-events-none text-muted-foreground transition-all duration-200",
            "peer-focus:text-primary",
            error && "text-destructive peer-focus:text-destructive"
          )}
          initial={false}
          animate={{
            top: isFocused || hasValue ? 8 : 16,
            fontSize: isFocused || hasValue ? '12px' : '16px',
            left: 16,
          }}
          transition={{ duration: 0.2 }}
        >
          {label}
        </motion.label>
      </div>
    )
  }
)
FloatingInput.displayName = "FloatingInput"

export { Input, FloatingInput }
