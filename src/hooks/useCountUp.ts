'use client'

import { useState, useEffect, useRef } from 'react'

interface UseCountUpOptions {
    duration?: number
    decimals?: number
    easing?: 'linear' | 'easeOut' | 'easeInOut'
}

/**
 * useCountUp - Animates a number from 0 (or previous value) to target value
 * 
 * @param end - Target number to count up to
 * @param options - Animation options (duration, decimals, easing)
 * @returns Current animated value as string (formatted with decimals)
 * 
 * @example
 * const animatedBalance = useCountUp(1234.56, { duration: 1000, decimals: 2 })
 * // Returns "1234.56" after animation completes
 */
export function useCountUp(
    end: number,
    options: UseCountUpOptions = {}
): string {
    const { duration = 1000, decimals = 0, easing = 'easeOut' } = options
    
    const [count, setCount] = useState(0)
    const previousEndRef = useRef(0)
    const frameRef = useRef<number | null>(null)
    
    useEffect(() => {
        // Skip animation if end hasn't changed significantly
        if (Math.abs(end - previousEndRef.current) < 0.01) {
            return
        }
        
        const startValue = previousEndRef.current
        const startTime = performance.now()
        
        // Easing functions
        const easingFunctions = {
            linear: (t: number) => t,
            easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
            easeInOut: (t: number) => t < 0.5 
                ? 4 * t * t * t 
                : 1 - Math.pow(-2 * t + 2, 3) / 2
        }
        
        const ease = easingFunctions[easing]
        
        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const easedProgress = ease(progress)
            
            const currentValue = startValue + (end - startValue) * easedProgress
            setCount(currentValue)
            
            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate)
            } else {
                previousEndRef.current = end
            }
        }
        
        // Cancel any existing animation
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current)
        }
        
        frameRef.current = requestAnimationFrame(animate)
        
        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current)
            }
        }
    }, [end, duration, easing])
    
    // Format with specified decimals
    return count.toFixed(decimals)
}

/**
 * useCountUpNumber - Same as useCountUp but returns a number
 */
export function useCountUpNumber(
    end: number,
    options: UseCountUpOptions = {}
): number {
    const result = useCountUp(end, options)
    return parseFloat(result)
}

export default useCountUp
