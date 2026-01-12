import { AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Failure {
    id: string
    user: string
    status: string
    date: string
}

export default function RecentFailures({ data }: { data: Failure[] }) {
    const { t, language } = useTranslation()

    const localeMap = {
        ar: ar,
        en: enUS,
        bn: bn
    }

    const currentLocale = localeMap[language as keyof typeof localeMap] || ar

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-bold text-gray-800">{t.admin.dashboard.recent.failuresTitle}</h3>
            </div>

            <div className="space-y-4">
                {data.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">{t.admin.dashboard.recent.noFailures}</p>
                ) : (
                    data.map((fail) => (
                        <div key={fail.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                            <div>
                                <p className="text-sm font-bold text-gray-800">{fail.user}</p>
                                <p className="text-xs text-red-600 font-mono mt-1">{t.admin.dashboard.recent.op}: #{fail.id.slice(-4)}</p>
                            </div>
                            <div className="text-left">
                                <span className="inline-block px-2 py-1 bg-red-200 text-red-800 text-xs rounded-full mb-1">
                                    {t.admin.dashboard.recent.failed}
                                </span>
                                <p className="text-xs text-gray-500">
                                    {format(new Date(fail.date), 'HH:mm dd/MM', { locale: currentLocale })}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
