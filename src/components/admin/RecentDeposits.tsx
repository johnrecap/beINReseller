import { Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'

interface Deposit {
    id: string
    user: string
    amount: number
    date: string
}

export default function RecentDeposits({ data }: { data: Deposit[] }) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-bold text-gray-800">آخر عمليات الشحن</h3>
            </div>

            <div className="space-y-4">
                {data.length === 0 ? (
                    <p className="text-center text-gray-400 py-4">لا توجد عمليات شحن مؤخراً</p>
                ) : (
                    data.map((deposit) => (
                        <div key={deposit.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                            <div>
                                <p className="text-sm font-bold text-gray-800">{deposit.user}</p>
                                <p className="text-xs text-green-700 font-bold mt-1 dir-ltr text-right">+{deposit.amount} ريال</p>
                            </div>
                            <div className="text-left">
                                <p className="text-xs text-gray-500">
                                    {format(new Date(deposit.date), 'HH:mm dd/MM', { locale: ar })}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
