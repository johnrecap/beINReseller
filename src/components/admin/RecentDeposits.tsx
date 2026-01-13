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
        <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-bold text-foreground">{t.admin.dashboard.recent.depositsTitle}</h3>
            </div>

            <div className="space-y-4">
                {safeData.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">{t.admin.dashboard.recent.noDeposits}</p>
                ) : (
                    safeData.map((deposit) => (
                        <div key={deposit.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <div>
                                <p className="text-sm font-bold text-foreground">{deposit.user}</p>
                                <p className="text-xs text-green-700 dark:text-green-400 font-bold mt-1 dir-ltr text-right">+{deposit.amount} {t.header.currency}</p>
                            </div>
                            <div className="text-left">
                                <p className="text-xs text-muted-foreground">
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
