'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
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

interface SidebarProps {
    isOpen: boolean
    onClose: () => void
}

const linkVariants = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    hover: { x: 4, transition: { duration: 0.2 } }
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname()
    const { data: session } = useSession()
    const { t, dir } = useTranslation()
    const isAdmin = session?.user?.role === 'ADMIN'

    const resellerLinks = [
        { href: '/dashboard', label: t.sidebar.home, icon: Home },
        { href: '/dashboard/operations', label: t.sidebar.operations, icon: Zap },
        { href: '/dashboard/history', label: t.sidebar.history, icon: History },
        { href: '/dashboard/transactions', label: t.sidebar.transactions, icon: CreditCard },
        { href: '/dashboard/profile', label: t.sidebar.profile, icon: User },
    ]

    const adminLinks = [
        { href: '/dashboard/admin', label: t.sidebar.mainMenu, icon: Home },
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
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed top-0 h-screen w-72 z-50 transition-transform duration-300",
                    "bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 dark:from-gray-950 dark:via-gray-900 dark:to-black",
                    "text-white flex flex-col",
                    dir === 'rtl' ? "right-0 border-l border-white/10" : "left-0 border-r border-white/10",
                    isOpen ? "translate-x-0" : (dir === 'rtl' ? "translate-x-full" : "-translate-x-full"),
                    "lg:translate-x-0"
                )}
                dir={dir}
            >
                {/* Glow overlay */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-20 -right-20 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl" />
                    <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl" />
                </div>

                {/* Close button for mobile */}
                <motion.button
                    onClick={onClose}
                    className={cn(
                        "absolute top-4 p-2 rounded-lg hover:bg-white/10 lg:hidden transition-colors",
                        dir === 'rtl' ? "left-4" : "right-4"
                    )}
                    aria-label="Close Menu"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                >
                    <X className="w-5 h-5" />
                </motion.button>

                {/* Logo */}
                <div className="relative p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <motion.div
                            className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30"
                            whileHover={{ scale: 1.05, rotate: 5 }}
                            transition={{ type: "spring", stiffness: 400 }}
                        >
                            <span className="text-2xl">📺</span>
                        </motion.div>
                        <div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">beIN Panel</h1>
                            <p className="text-xs text-gray-400">{t.sidebar.resellerPanel}</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="relative flex-1 p-4 space-y-1 overflow-y-auto">
                    <div className="mb-6">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-3">{t.sidebar.mainMenu}</p>
                        {resellerLinks.map((link, index) => {
                            const Icon = link.icon
                            const isActive = pathname === link.href
                            return (
                                <motion.div
                                    key={link.href}
                                    initial="initial"
                                    animate="animate"
                                    variants={linkVariants}
                                    transition={{ delay: index * 0.05 }}
                                    whileHover="hover"
                                >
                                    <Link
                                        href={link.href}
                                        onClick={onClose}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative",
                                            isActive
                                                ? "bg-white/10 text-white font-medium"
                                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        {/* Active indicator glow */}
                                        {isActive && (
                                            <motion.div
                                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20"
                                                layoutId="activeLink"
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            />
                                        )}
                                        <Icon className={cn("w-5 h-5 relative z-10", isActive && "text-purple-300")} />
                                        <span className="relative z-10">{link.label}</span>
                                        {isActive && (
                                            <ChevronLeft className={cn(
                                                "w-4 h-4 relative z-10",
                                                dir === 'rtl' ? 'mr-auto' : 'ml-auto'
                                            )} />
                                        )}
                                    </Link>
                                </motion.div>
                            )
                        })}
                    </div>

                    {isAdmin && (
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-3">{t.sidebar.admin}</p>
                            {adminLinks.map((link, index) => {
                                const Icon = link.icon
                                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                                return (
                                    <motion.div
                                        key={link.href}
                                        initial="initial"
                                        animate="animate"
                                        variants={linkVariants}
                                        transition={{ delay: (index + resellerLinks.length) * 0.05 }}
                                        whileHover="hover"
                                    >
                                        <Link
                                            href={link.href}
                                            onClick={onClose}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative",
                                                isActive
                                                    ? "bg-purple-500/20 text-purple-300 font-medium"
                                                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                                            )}
                                        >
                                            {isActive && (
                                                <motion.div
                                                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20"
                                                    layoutId="adminActiveLink"
                                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                />
                                            )}
                                            <Icon className={cn("w-5 h-5 relative z-10", isActive && "text-purple-400")} />
                                            <span className="relative z-10">{link.label}</span>
                                        </Link>
                                    </motion.div>
                                )
                            })}
                        </div>
                    )}
                </nav>

                {/* User Info & Logout */}
                <div className="relative p-4 border-t border-white/10">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <motion.div
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30"
                            whileHover={{ scale: 1.1 }}
                        >
                            <User className="w-5 h-5" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{session?.user?.username}</p>
                            <p className="text-xs text-gray-400">
                                {session?.user?.role === 'ADMIN' ? 'مدير' : 'موزع'}
                            </p>
                        </div>
                    </div>
                    <motion.button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        <LogOut className="w-5 h-5" />
                        <span>تسجيل الخروج</span>
                    </motion.button>
                </div>
            </aside>
        </>
    )
}

// Menu button for mobile header
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <motion.button
            onClick={onClick}
            className="p-2 rounded-xl hover:bg-muted lg:hidden transition-colors"
            aria-label="فتح القائمة"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
        >
            <Menu className="w-6 h-6 text-foreground" />
        </motion.button>
    )
}
