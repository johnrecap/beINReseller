'use client'

import { useState, useEffect } from 'react'
import { Server, Wifi, WifiOff, Clock, CheckCircle, XCircle, Activity, RefreshCw } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface WorkerStatus {
    session?: {
        status?: string
        ageMinutes?: number
    }
    queue?: {
        pending?: number
        processing?: number
    }
    today?: {
        completed?: number
        failed?: number
        successRate?: number
    }
    redis?: string
}

export default function WorkerStatusCard() {
    const { t } = useTranslation()
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
        } catch {
            setError('ERROR')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, 30000)
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
                    <span>{t.admin.dashboard.workerStatus?.error ?? 'Error loading worker status'}</span>
                </div>
            </div>
        )
    }

    // Safe data extraction with defaults
    const sessionStatus = status.session?.status ?? 'UNKNOWN'
    const sessionAge = status.session?.ageMinutes ?? 0
    const queuePending = status.queue?.pending ?? 0
    const queueProcessing = status.queue?.processing ?? 0
    const todayCompleted = status.today?.completed ?? 0
    const todaySuccessRate = status.today?.successRate ?? 0
    const redisStatus = status.redis ?? 'UNKNOWN'

    const isConnected = sessionStatus === 'CONNECTED'

    // Helper to get status label
    const getStatusLabel = (s: string): string => {
        if (!s) return 'Unknown'
        const key = s.toLowerCase() as keyof typeof t.admin.dashboard.workerStatus
        const translations = t.admin?.dashboard?.workerStatus
        if (translations && typeof translations === 'object' && key in translations) {
            return (translations as Record<string, string>)[key] ?? s
        }
        return s
    }

    const sessionStatusLabel = getStatusLabel(sessionStatus)
    const redisStatusLabel = getStatusLabel(redisStatus)

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-gray-600" />
                    <h3 className="font-bold text-gray-800">{t.admin.dashboard.workerStatus?.title ?? 'Worker Status'}</h3>
                </div>
                <button
                    onClick={fetchStatus}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                    title={t.admin.dashboard.workerStatus?.refresh ?? 'Refresh'}
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
                        {sessionStatusLabel}
                    </div>
                    <p className="text-xs text-gray-500">{t.admin.dashboard.workerStatus?.session ?? 'Session'}</p>
                    {isConnected && (
                        <p className="text-xs text-gray-400 mt-1">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {sessionAge} {t.admin.dashboard.workerStatus?.minutes ?? 'min'}
                        </p>
                    )}
                </div>

                {/* Queue */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-800">{queuePending}</p>
                    <p className="text-xs text-gray-500">{t.admin.dashboard.workerStatus?.pending ?? 'Pending'}</p>
                    {queueProcessing > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                            <Activity className="w-3 h-3 inline mr-1 animate-pulse" />
                            {queueProcessing} {t.admin.dashboard.workerStatus?.processing ?? 'processing'}
                        </p>
                    )}
                </div>

                {/* Today's Success */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{todayCompleted}</p>
                    <p className="text-xs text-gray-500">{t.admin.dashboard.workerStatus?.todayCompleted ?? 'Completed Today'}</p>
                </div>

                {/* Success Rate */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className={`text-2xl font-bold ${todaySuccessRate >= 80 ? 'text-green-600' :
                        todaySuccessRate >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                        {todaySuccessRate}%
                    </p>
                    <p className="text-xs text-gray-500">{t.admin.dashboard.workerStatus?.successRate ?? 'Success Rate'}</p>
                </div>
            </div>

            {/* Redis Status */}
            <div className="px-4 pb-4">
                <div className={`flex items-center gap-2 text-xs ${redisStatus === 'CONNECTED' ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {redisStatus === 'CONNECTED' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    Redis: {redisStatusLabel}
                </div>
            </div>
        </div>
    )
}
