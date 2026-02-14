import { AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Failure {
    id: string
    user: string
    status: string
    error?: string | null
    cardNumber?: string | null
    type?: string
    date: string
}

export default function RecentFailures({ data = [] }: { data?: Failure[] }) {
    const { t, language } = useTranslation()

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }

    const currentLocale = localeMap[language as keyof typeof localeMap] || ar

    // Safe data array
    const safeData = data ?? []

    return (
        <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-bold text-foreground">{t.admin.dashboard.recent.failuresTitle}</h3>
            </div>

            <div className="space-y-4">
                {safeData.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">{t.admin.dashboard.recent.noFailures}</p>
                ) : (
                    safeData.map((fail) => (
                        <div key={fail.id} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-foreground">{fail.user}</p>
                                    <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-1">
                                        {t.admin.dashboard.recent.op}: #{fail.id.slice(-4)}
                                        {fail.cardNumber && <span className="ml-2 text-muted-foreground">({fail.cardNumber})</span>}
                                    </p>
                                </div>
                                <div className="text-left">
                                    <span className="inline-block px-2 py-1 bg-red-200 dark:bg-red-900/40 text-red-800 dark:text-red-400 text-xs rounded-full mb-1">
                                        {t.admin.dashboard.recent.failed}
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                        {format(new Date(fail.date), 'HH:mm dd/MM', { locale: currentLocale })}
                                    </p>
                                </div>
                            </div>
                            {fail.error && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-2 bg-red-100 dark:bg-red-900/30 px-2 py-1.5 rounded border border-red-200 dark:border-red-800/50 line-clamp-2">
                                    ⚠️ {fail.error}
                                </p>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
