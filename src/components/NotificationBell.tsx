'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCheck, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { usePanelRequest } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { withRequestDeadline } from '@/lib/request-deadline'
import { toast } from 'sonner'
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

export default function NotificationBell() {
    const { t, locale } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const { load, loading, error, cancel } = usePanelRequest()
    const [busy, setBusy] = useState(false)
    const busyRef = useRef(false)
    const bellRef = useRef<HTMLButtonElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const getDateLocale = () => {
        switch (locale) {
            case 'ar': return ar
            case 'bn': return bn
            default: return enUS
        }
    }

    const fetchNotifications = useCallback(async () => {
        if (busyRef.current) return
        await load<{ notifications: Notification[]; unreadCount: number }>('/api/notifications?limit=10', data => {
            setNotifications(data.notifications)
            setUnreadCount(data.unreadCount)
        })
    }, [load])

    useEffect(() => {
        void fetchNotifications()
        const interval = setInterval(fetchNotifications, 30000)
        return () => { clearInterval(interval); cancel() }
    }, [fetchNotifications, cancel])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const markRead = async (notificationId?: string): Promise<boolean> => {
        if (busyRef.current) return false
        busyRef.current = true
        setBusy(true)
        cancel()
        try {
            await withRequestDeadline(async signal => {
                const response = await fetch('/api/notifications', {
                    method: 'PUT', signal, headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(notificationId ? { notificationId } : { markAll: true }),
                })
                if (!response.ok) throw new Error('NOTIFICATION_UPDATE_FAILED')
            }, 15_000)
            setNotifications(prev => prev.map(n => !notificationId || n.id === notificationId ? { ...n, read: true } : n))
            setUnreadCount(prev => notificationId ? Math.max(0, prev - 1) : 0)
            return true
        } catch {
            toast.error(t.common.error)
            return false
        } finally {
            busyRef.current = false
            setBusy(false)
            void fetchNotifications()
        }
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-5 h-5 text-green-500" />
            case 'error':
                return <AlertCircle className="w-5 h-5 text-red-500" />
            case 'warning':
                return <AlertTriangle className="w-5 h-5 text-amber-500" />
            default:
                return <Info className="w-5 h-5 text-blue-500" />
        }
    }

    return (
        <div className="relative" ref={dropdownRef} onKeyDown={event => { if (event.key === 'Escape') { setIsOpen(false); bellRef.current?.focus() } }}>
            {/* Bell Button */}
            <button
                ref={bellRef}
                aria-expanded={isOpen}
                aria-controls="panel-notifications"
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                aria-label={t.notifications?.title || 'Notifications'}
            >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div id="panel-notifications" className="absolute end-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-50" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary">
                        <h3 className="font-bold text-foreground">{t.notifications?.title || 'Notifications'}</h3>
                        {unreadCount > 0 && (
                            <button
                                disabled={busy}
                                onClick={() => markRead()}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                                <CheckCheck className="w-4 h-4" />
                                {t.notifications?.markAllRead || 'Mark all as read'}
                            </button>
                        )}
                    </div>

                    {error !== null && <PanelLoadError status={error} retry={fetchNotifications} />}
                    {error !== null && notifications.length > 0 && <p className="px-4 text-xs">{t.panelUi.staleData}</p>}
                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {loading && notifications.length === 0 ? <p role="status" className="p-4">{t.common.loading}</p> : error !== null && notifications.length === 0 ? null : notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <Bell className="w-12 h-12 mx-auto mb-2 opacity-30" />
                                <p>{t.notifications?.noNotifications || 'No notifications'}</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <button
                                    type="button" disabled={busy}
                                    key={notification.id}
                                    className={cn(
                                        'w-full text-start flex gap-3 p-4 border-b border-border hover:bg-secondary transition-colors cursor-pointer',
                                        !notification.read && 'bg-blue-500/10'
                                    )}
                                    onClick={async () => {
                                        if (!notification.read && !await markRead(notification.id)) return
                                        if (notification.link) {
                                            window.location.href = notification.link
                                        }
                                    }}
                                >
                                    <div className="flex-shrink-0 mt-0.5">
                                        {getIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn(
                                            'text-sm',
                                            notification.read ? 'text-muted-foreground' : 'text-foreground font-medium'
                                        )}>
                                            {notification.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            {formatDistanceToNow(new Date(notification.createdAt), {
                                                addSuffix: true,
                                                locale: getDateLocale(),
                                            })}
                                        </p>
                                    </div>
                                    {!notification.read && (
                                        <div className="flex-shrink-0">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                        </div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div className="p-3 border-t border-border bg-secondary text-center">
                            <a
                                href="/dashboard/notifications"
                                className="text-sm text-blue-600 hover:text-blue-800"
                            >
                                {t.notifications?.viewAll || 'View all notifications'}
                            </a>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
