'use client'

import { Check, X } from 'lucide-react'


interface PasswordStrengthMeterProps {
    password: string
    minimumLength?: number
    labels?: {
        minimum: string
        uppercase: string
        lowercase: string
        number: string
    }
}

export default function PasswordStrengthMeter({
    password,
    minimumLength = 8,
    labels,
}: PasswordStrengthMeterProps) {
    const requirements = [
        {
            label: labels?.minimum || `At least ${minimumLength} characters`,
            valid: password.length >= minimumLength,
        },
        { label: labels?.uppercase || 'Contains uppercase letter', valid: /[A-Z]/.test(password) },
        { label: labels?.lowercase || 'Contains lowercase letter', valid: /[a-z]/.test(password) },
        { label: labels?.number || 'Contains number', valid: /[0-9]/.test(password) },
    ]

    const validCount = requirements.filter(r => r.valid).length
    const strength = (validCount / 4) * 100

    const getStrengthColor = () => {
        if (strength <= 33) return 'bg-[#ED1C24]' // Red
        if (strength <= 66) return 'bg-[#F59E0B]' // Amber
        return 'bg-[#00A651]' // Green
    }

    return (
        <div className="space-y-3 mt-2">
            {/* Strength Bar */}
            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    className={`h-full transition-all duration-300 ${getStrengthColor()}`}
                    style={{ width: `${Math.max(strength, 5)}%` }}
                />
            </div>

            {/* Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {requirements.map((req, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                        {req.valid ? (
                            <Check className="w-3.5 h-3.5 text-[#00A651]" />
                        ) : (
                            <X className="w-3.5 h-3.5 text-gray-400" />
                        )}
                        <span className={req.valid ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500'}>
                            {req.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
