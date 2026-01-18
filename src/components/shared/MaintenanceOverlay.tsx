'use client'

import { AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface MaintenanceOverlayProps {
    message?: string
}

/**
 * Non-dismissable overlay that blocks interaction when maintenance mode is enabled
 * Used specifically on the renewal page
 */
export default function MaintenanceOverlay({ message }: MaintenanceOverlayProps) {
    const { t } = useTranslation()

    const defaultMessage = (t.maintenance as { message?: string })?.message || 'النظام تحت الصيانة يرجى المحاولة لاحقاً'

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            // Prevent any interaction with content behind
            onClick={(e) => e.stopPropagation()}
        >
            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">
                        {(t.maintenance as { title?: string })?.title || 'النظام تحت الصيانة'}
                    </h2>
                </div>

                {/* Content */}
                <div className="p-6 text-center">
                    <p className="text-muted-foreground text-lg leading-relaxed">
                        {message || defaultMessage}
                    </p>

                    {/* Info box */}
                    <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                            {(t.maintenance as { hint?: string })?.hint || 'يمكنك تصفح باقي الصفحات من القائمة الجانبية'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
