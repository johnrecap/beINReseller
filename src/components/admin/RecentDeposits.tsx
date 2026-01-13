import { Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Deposit {
    id: string
    user: string
    amount: number
    date: string
}

export default function RecentDeposits({ data = [] }: { data?: Deposit[] }) {
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-bold text-gray-800">{t.admin.dashboard.recent.depositsTitle}</h3>
            </div>

            <div className="space-y-4">
                {safeData.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">{t.admin.dashboard.recent.noDeposits}</p>
                ) : (
                    safeData.map((deposit) => (
                        <div key={deposit.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                            <div>
                                <p className="text-sm font-bold text-gray-800">{deposit.user}</p>
                                <p className="text-xs text-green-700 font-bold mt-1 dir-ltr text-right">+{deposit.amount} {t.header.currency}</p>
                            </div>
                            <div className="text-left">
                                <p className="text-xs text-gray-500">
                                    {format(new Date(deposit.date), 'HH:mm dd/MM', { locale: currentLocale })}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
