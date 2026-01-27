'use client'

import { ACTIVITY_STATUS, type ActivityStatusType } from '@/lib/activity-status'
import { useTranslation } from '@/hooks/useTranslation'

interface ActivityStatusBadgeProps {
    status: ActivityStatusType
    showDays?: boolean
    size?: 'sm' | 'md' | 'lg'
}

export function ActivityStatusBadge({ 
    status, 
    showDays = false,
    size = 'md' 
}: ActivityStatusBadgeProps) {
    const { locale } = useTranslation()
    const config = ACTIVITY_STATUS[status]
    
    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm'
    }
    
    const dotSizeClasses = {
        sm: 'w-1 h-1',
        md: 'w-1.5 h-1.5',
        lg: 'w-2 h-2'
    }
    
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses[size]} ${config.bgClass} ${config.textClass}`}>
            <span className={`${dotSizeClasses[size]} rounded-full ${config.dotClass}`} />
            {config.label[locale as 'ar' | 'en'] || config.label.en}
            {showDays && (
                <span className="opacity-70">({config.days})</span>
            )}
        </span>
    )
}

interface ActivityStatusDotProps {
    status: ActivityStatusType
    size?: 'sm' | 'md' | 'lg'
    pulse?: boolean
}

export function ActivityStatusDot({ 
    status, 
    size = 'md',
    pulse = false 
}: ActivityStatusDotProps) {
    const config = ACTIVITY_STATUS[status]
    
    const sizeClasses = {
        sm: 'w-2 h-2',
        md: 'w-3 h-3',
        lg: 'w-4 h-4'
    }
    
    return (
        <span className={`relative inline-flex ${sizeClasses[size]}`}>
            {pulse && status === 'active' && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dotClass} opacity-75`} />
            )}
            <span className={`relative inline-flex rounded-full ${sizeClasses[size]} ${config.dotClass}`} />
        </span>
    )
}

export default ActivityStatusBadge
