'use client'

import { useState, useEffect } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'
import { Bell, CheckCheck, AlertCircle, CheckCircle, Info, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS, bn } from 'date-fns/locale'
import { useTranslation } from '@/hooks/useTranslation'

interface Notification {
    id: string
    title: string
    message: string
    type: string
    read: boolean
    link?: string
    createdAt: string
}

export default function NotificationsPage() {
    const { t, language } = useTranslation()
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const getDateLocale = () => {
        switch (language) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    useEffect(() => {
        fetchNotifications()
    }, [page])

    const fetchNotifications = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/notifications?limit=20&page=${page}`)
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications)
                setTotalPages(data.totalPages || 1)
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error)
        } finally {
            setLoading(false)
        }
    }

    const markAsRead = async (notificationId: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId }),
            })
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
            )
        } catch (error) {
            console.error('Failed to mark as read:', error)
        }
    }

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAll: true }),
            })
            setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        } catch (error) {
            console.error('Failed to mark all as read:', error)
        }
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-6 h-6 text-green-500" />
            case 'error':
                return <AlertCircle className="w-6 h-6 text-red-500" />
            case 'warning':
                return <AlertTriangle className="w-6 h-6 text-amber-500" />
            default:
                return <Info className="w-6 h-6 text-blue-500" />
        }
    }

    const unreadCount = notifications.filter(n => !n.read).length

    return (
        <DashboardShell title={t.notifications?.title || 'الإشعارات'}>
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                                <Bell className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-800">
                                    {t.notifications?.title || 'الإشعارات'}
                                </h1>
                                <p className="text-sm text-gray-500">
                                    {unreadCount > 0
                                        ? `${unreadCount} ${t.notifications?.unread || 'غير مقروءة'}`
                                        : t.notifications?.allRead || 'كل الإشعارات مقروءة'}
                                </p>
                            </div>
                        </div>

                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-colors"
                            >
                                <CheckCheck className="w-4 h-4" />
                                {t.notifications?.markAllRead || 'تحديد الكل كمقروء'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Notifications List */}
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-500" />
                            <p className="mt-2 text-gray-500">{t.common?.loading || 'جاري التحميل...'}</p>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <Bell className="w-16 h-16 mx-auto mb-4 opacity-30" />
                            <p className="text-lg">{t.notifications?.empty || 'لا توجد إشعارات'}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={cn(
                                        'flex gap-4 p-5 hover:bg-gray-50 transition-colors cursor-pointer',
                                        !notification.read && 'bg-blue-50/50'
                                    )}
                                    onClick={() => {
                                        if (!notification.read) markAsRead(notification.id)
                                        if (notification.link) {
                                            window.location.href = notification.link
                                        }
                                    }}
                                >
                                    <div className="flex-shrink-0 mt-1">
                                        {getIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            'text-base',
                                            notification.read ? 'text-gray-600' : 'text-gray-900 font-semibold'
                                        )}>
                                            {notification.title}
                                        </p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-2">
                                            {formatDistanceToNow(new Date(notification.createdAt), {
                                                addSuffix: true,
                                                locale: getDateLocale(),
                                            })}
                                        </p>
                                    </div>
                                    {!notification.read && (
                                        <div className="flex-shrink-0">
                                            <div className="w-3 h-3 bg-blue-500 rounded-full" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 p-4 border-t border-gray-100">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-4 py-2 text-sm bg-gray-100 rounded-lg disabled:opacity-50 hover:bg-gray-200 transition-colors"
                            >
                                {t.common?.previous || 'السابق'}
                            </button>
                            <span className="text-sm text-gray-600">
                                {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-4 py-2 text-sm bg-gray-100 rounded-lg disabled:opacity-50 hover:bg-gray-200 transition-colors"
                            >
                                {t.common?.next || 'التالي'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </DashboardShell>
    )
}
