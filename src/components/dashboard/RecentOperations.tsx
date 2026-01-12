'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { ar } from 'date-fns/locale'

interface Operation {
    id: string
    type: string
    cardNumber: string
    amount: number
    status: string
    responseMessage: string | null
    createdAt: string
}

const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    PROCESSING: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700'
}

const statusLabels: Record<string, string> = {
    PENDING: 'قيد الانتظار',
    PROCESSING: 'جاري التنفيذ',
    COMPLETED: 'مكتمل',
    FAILED: 'فشل'
}

const typeLabels: Record<string, string> = {
    RENEW: 'تجديد',
    CHECK: 'استعلام',
    SIGNAL_REFRESH: 'تنشيط إشارة'
}

export default function RecentOperations() {
    const [operations, setOperations] = useState<Operation[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchOperations = async () => {
            try {
                const res = await fetch('/api/user/recent-operations')
                const data = await res.json()
                setOperations(data.operations || [])
            } catch (error) {
                console.error('Failed to fetch operations:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchOperations()
        const interval = setInterval(fetchOperations, 10000)
        return () => clearInterval(interval)
    }, [])

    if (loading) {
        return (
            <Card className="bg-white border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg text-gray-800">آخر العمليات</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                                </div>
                                <div className="h-6 bg-gray-200 rounded w-16"></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="bg-white border-0 shadow-lg">
            <CardHeader>
                <CardTitle className="text-lg text-gray-800">آخر العمليات</CardTitle>
            </CardHeader>
            <CardContent>
                {operations.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <p>لا توجد عمليات بعد</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {operations.map((op) => (
                            <div key={op.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${op.type === 'RENEW' ? 'bg-purple-100' :
                                        op.type === 'CHECK' ? 'bg-emerald-100' : 'bg-amber-100'
                                    }`}>
                                    <span className="text-lg">
                                        {op.type === 'RENEW' ? '⚡' : op.type === 'CHECK' ? '🔍' : '📡'}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-800">
                                        {typeLabels[op.type] || op.type}
                                    </p>
                                    <p className="text-sm text-gray-400 truncate">
                                        {op.cardNumber} • {formatDistanceToNow(new Date(op.createdAt), { addSuffix: true, locale: ar })}
                                    </p>
                                </div>
                                <Badge className={`${statusColors[op.status]} border-0`}>
                                    {statusLabels[op.status] || op.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
