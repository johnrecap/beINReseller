'use client'

import { useState, useEffect } from 'react'
import { Server, Wifi, WifiOff, Clock, CheckCircle, XCircle, Activity, RefreshCw } from 'lucide-react'

interface WorkerStatus {
    session: {
        status: string
        ageMinutes: number
    }
    queue: {
        pending: number
        processing: number
    }
    today: {
        completed: number
        failed: number
        successRate: number
    }
    redis: string
}

export default function WorkerStatusCard() {
    const [status, setStatus] = useState<WorkerStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/admin/worker-status')
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            setStatus(data)
            setError(null)
        } catch (e) {
            setError('فشل الاتصال بالخادم')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, 30000) // Refresh every 30s
        return () => clearInterval(interval)
    }, [])

    if (loading) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-20 bg-gray-100 rounded"></div>
            </div>
        )
    }

    if (error || !status) {
        return (
            <div className="bg-red-50 rounded-xl p-6 border border-red-100">
                <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="w-5 h-5" />
                    <span>{error || 'خطأ غير معروف'}</span>
                </div>
            </div>
        )
    }

    const isConnected = status.session.status === 'متصل'

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-gray-600" />
                    <h3 className="font-bold text-gray-800">حالة الـ Worker</h3>
                </div>
                <button
                    onClick={fetchStatus}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    title="تحديث"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Session Status */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium mb-2 ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        {status.session.status}
                    </div>
                    <p className="text-xs text-gray-500">الجلسة</p>
                    {isConnected && (
                        <p className="text-xs text-gray-400 mt-1">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {status.session.ageMinutes} دقيقة
                        </p>
                    )}
                </div>

                {/* Queue */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-800">{status.queue.pending}</p>
                    <p className="text-xs text-gray-500">في الانتظار</p>
                    {status.queue.processing > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                            <Activity className="w-3 h-3 inline mr-1 animate-pulse" />
                            {status.queue.processing} قيد التنفيذ
                        </p>
                    )}
                </div>

                {/* Today's Success */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{status.today.completed}</p>
                    <p className="text-xs text-gray-500">مكتملة اليوم</p>
                </div>

                {/* Success Rate */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className={`text-2xl font-bold ${status.today.successRate >= 80 ? 'text-green-600' :
                            status.today.successRate >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                        {status.today.successRate}%
                    </p>
                    <p className="text-xs text-gray-500">نسبة النجاح</p>
                </div>
            </div>

            {/* Redis Status */}
            <div className="px-4 pb-4">
                <div className={`flex items-center gap-2 text-xs ${status.redis === 'متصل' ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {status.redis === 'متصل' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    Redis: {status.redis}
                </div>
            </div>
        </div>
    )
}
