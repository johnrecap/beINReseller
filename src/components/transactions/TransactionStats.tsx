'use client'

import { ArrowUpRight, ArrowDownLeft, Wallet } from 'lucide-react'

interface TransactionStatsProps {
    stats: {
        totalDeposits: number
        totalWithdrawals: number
        currentBalance: number
    }
}

export default function TransactionStats({ stats }: TransactionStatsProps) {

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Total Deposits */}
            <div className="bg-[#1a1d26] p-6 rounded-2xl border border-border/50 shadow-lg relative overflow-hidden group hover:border-[#00A651]/50 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ArrowUpRight className="w-16 h-16 text-[#00A651]" />
                </div>
                <div className="relative z-10">
                    <p className="text-sm font-medium text-muted-foreground mb-2">إجمالي الإيداعات</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-[#00A651]">{stats.totalDeposits.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">USD</span>
                    </div>
                </div>
            </div>

            {/* Total Expenses */}
            <div className="bg-[#1a1d26] p-6 rounded-2xl border border-border/50 shadow-lg relative overflow-hidden group hover:border-[#ED1C24]/50 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ArrowDownLeft className="w-16 h-16 text-[#ED1C24]" />
                </div>
                <div className="relative z-10">
                    <p className="text-sm font-medium text-muted-foreground mb-2">إجمالي المصروفات</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-[#ED1C24]">{stats.totalWithdrawals.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">USD</span>
                    </div>
                </div>
            </div>

            {/* Current Balance */}
            <div className="bg-gradient-to-br from-[#3B82F6] to-[#2563EB] p-6 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20">
                    <Wallet className="w-16 h-16 text-white" />
                </div>
                <div className="relative z-10">
                    <p className="text-sm font-medium text-white/80 mb-2">الرصيد الحالي</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">{stats.currentBalance.toLocaleString()}</span>
                        <span className="text-xs text-white/70">USD</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
