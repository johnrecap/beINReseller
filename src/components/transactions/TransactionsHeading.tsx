'use client'
import { Wallet } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

export default function TransactionsHeading() {
    const { t } = useTranslation()
    return <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-full bg-[#3B82F6] flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0"><Wallet className="w-6 h-6 text-white" /></div>
        <div><h1 className="text-2xl font-bold text-foreground">{t.transactions.title}</h1>
            <p className="text-muted-foreground text-sm font-medium">{t.panelUi.transactionsDescription}</p></div>
    </div>
}
