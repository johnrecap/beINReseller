'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
    Home,
    Zap,
    History,
    CreditCard,
    User,
    Settings,
    Users,
    FileText,
    LogOut,
    ChevronLeft,
    Menu,
    X,
    Bot,
    BarChart3
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'

const resellerLinks = [
    { href: '/dashboard', label: 'الرئيسية', icon: Home },
    { href: '/dashboard/operations', label: 'العمليات', icon: Zap },
    { href: '/dashboard/history', label: 'السجل', icon: History },
    { href: '/dashboard/transactions', label: 'المعاملات', icon: CreditCard },
    { href: '/dashboard/profile', label: 'ملفي', icon: User },
]

const adminLinks = [
    { href: '/dashboard/admin', label: 'لوحة الإدارة', icon: Home },
    { href: '/dashboard/admin/users', label: 'المستخدمين', icon: Users },
    { href: '/dashboard/admin/analytics', label: 'التحليلات', icon: BarChart3 },
    { href: '/dashboard/admin/bein-config', label: 'إعدادات beIN', icon: Bot },
    { href: '/dashboard/admin/settings', label: 'الإعدادات', icon: Settings },
    { href: '/dashboard/admin/logs', label: 'السجلات', icon: FileText },
]

interface SidebarProps {
    isOpen: boolean
    onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const { t, dir } = useTranslation() // Hook usage
    const isAdmin = session?.user?.role === 'ADMIN'

    // Moved inside to access 't'
    const resellerLinks = [
        { href: '/dashboard', label: t.sidebar.home, icon: Home },
        { href: '/dashboard/operations', label: t.sidebar.operations, icon: Zap },
        { href: '/dashboard/history', label: t.sidebar.history, icon: History },
        { href: '/dashboard/transactions', label: t.sidebar.transactions, icon: CreditCard },
        { href: '/dashboard/profile', label: t.sidebar.profile, icon: User },
    ]

    const adminLinks = [
        { href: '/dashboard/admin', label: t.sidebar.mainMenu, icon: Home }, // Using mainMenu as 'Admin Panel' key equivalent or fallback
        { href: '/dashboard/admin/users', label: t.sidebar.users, icon: Users },
        { href: '/dashboard/admin/analytics', label: t.sidebar.analytics, icon: BarChart3 },
        { href: '/dashboard/admin/bein-config', label: t.sidebar.beinConfig, icon: Bot },
        { href: '/dashboard/admin/settings', label: t.sidebar.settings, icon: Settings },
        { href: '/dashboard/admin/logs', label: t.sidebar.logs, icon: FileText },
    ]

    const handleLogout = async () => {
        await signOut({ callbackUrl: '/login' })
    }

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar - Fixed on LEFT or RIGHT based on dir */}
            <aside
                className={cn(
                    "fixed top-0 h-screen w-72 bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col z-50 transition-transform duration-300",
                    dir === 'rtl' ? "right-0 border-l border-white/10" : "left-0 border-r border-white/10",
                    // Mobile: hidden logic
                    isOpen ? "translate-x-0" : (dir === 'rtl' ? "translate-x-full" : "-translate-x-full"),
                    // Desktop: always visible
                    "lg:translate-x-0"
                )}
                dir={dir}
            >
                {/* Close button for mobile */}
                <button
                    onClick={onClose}
                    className={cn(
                        "absolute top-4 p-2 rounded-lg hover:bg-white/10 lg:hidden",
                        dir === 'rtl' ? "left-4" : "right-4"
                    )}
                    aria-label="Close Menu"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Logo */}
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-lg">
                            <span className="text-2xl">📺</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">beIN Panel</h1>
                            <p className="text-xs text-gray-400">{t.sidebar.resellerPanel}</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    <div className="mb-6">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-3">{t.sidebar.mainMenu}</p>
                        {resellerLinks.map((link) => {
                            const Icon = link.icon
                            const isActive = pathname === link.href
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    onClick={onClose}
                                    className={cn(
                                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                                        isActive
                                            ? "bg-white/10 text-white font-medium shadow-lg"
                                            : "text-gray-400 hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    <Icon className="w-5 h-5" />
                                    <span>{link.label}</span>
                                    {isActive && <ChevronLeft className={cn("w-4 h-4", dir === 'rtl' ? 'mr-auto' : 'ml-auto')} />}
                                </Link>
                            )
                        })}
                    </div>

                    {isAdmin && (
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-3">{t.sidebar.admin}</p>
                            {adminLinks.map((link) => {
                                const Icon = link.icon
                                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        onClick={onClose}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                                            isActive
                                                ? "bg-purple-500/20 text-purple-300 font-medium"
                                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span>{link.label}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </nav>

                {/* User Info & Logout */}
                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{session?.user?.username}</p>
                            <p className="text-xs text-gray-400">
                                {session?.user?.role === 'ADMIN' ? 'مدير' : 'موزع'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>تسجيل الخروج</span>
                    </button>
                </div>
            </aside>
        </>
    )
}

// Menu button for mobile header
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="p-2 rounded-xl hover:bg-gray-100 lg:hidden"
            aria-label="فتح القائمة"
        >
            <Menu className="w-6 h-6 text-gray-700" />
        </button>
    )
}
