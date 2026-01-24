'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
    Home,
    History,
    CreditCard,
    User,
    Settings,
    Users,
    FileText,
    LogOut,
    Menu,
    X,
    Bot,
    BarChart3,
    Sparkles,
    Loader2,
    Globe,
    Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import { Button } from '@/components/ui/button'
import { canAccessSubscription, canAccessSignal } from '@/lib/permissions'

interface SidebarProps {
    isOpen: boolean
    onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname()
    const { data: session, status } = useSession()
    const { t, dir } = useTranslation()
    const userRole = session?.user?.role
    const isAdmin = userRole === 'ADMIN'
    const isManager = userRole === 'MANAGER'
    
    // Permission-based visibility
    const canRenew = canAccessSubscription(userRole)
    const canSignal = canAccessSignal(userRole)

    // Base links for all authenticated users
    const baseLinks = [
        { href: '/dashboard', label: t.sidebar.home, icon: Home },
    ]
    
    // Renewal/Operation links - only for users with permission (not MANAGER)
    const renewalLinks = canRenew ? [
        { href: '/dashboard/renew', label: t.bulk?.interactiveRenewal || 'Interactive Renewal', icon: Sparkles },
        { href: '/dashboard/operations/active', label: t.operations?.activeOperations || 'Active Operations', icon: Loader2 },
        { href: '/dashboard/history', label: t.sidebar.history, icon: History },
    ] : []
    
    // Common links for all users
    const commonLinks = [
        { href: '/dashboard/transactions', label: t.sidebar.transactions, icon: CreditCard },
        { href: '/dashboard/profile', label: t.sidebar.profile, icon: User },
    ]
    
    // Combined reseller links
    const resellerLinks = [...baseLinks, ...renewalLinks, ...commonLinks]

    const managerLinks = [
        { href: '/dashboard/manager', label: 'لوحة المدير', icon: BarChart3 },
        { href: '/dashboard/manager/deleted-users', label: 'الحسابات المحذوفة', icon: Trash2 },
    ]

    const adminLinks = [
        { href: '/dashboard/admin', label: t.sidebar.mainMenu, icon: Home },
        { href: '/dashboard/admin/users', label: t.sidebar.users, icon: Users },
        { href: '/dashboard/admin/deleted-users', label: 'الحسابات المحذوفة', icon: Trash2 },
        { href: '/dashboard/admin/bein-accounts', label: t.sidebar.beinAccounts || 'حسابات beIN', icon: Users },
        { href: '/dashboard/admin/proxies', label: 'إدارة البروكسي', icon: Globe },
        { href: '/dashboard/admin/analytics', label: t.sidebar.analytics, icon: BarChart3 },
        { href: '/dashboard/admin/bein-config', label: t.sidebar.beinConfig, icon: Bot },
        { href: '/dashboard/admin/settings', label: t.sidebar.settings, icon: Settings },
        { href: '/dashboard/admin/logs', label: t.sidebar.logs, icon: FileText },
    ]

    const handleLogout = async () => {
        await signOut({ callbackUrl: '/login' })
    }

    // Sidebar Skeleton
    if (status === 'loading') {
        return (
            <>
                {/* Overlay for mobile */}
                {isOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={onClose}
                    />
                )}

                <aside
                    className={cn(
                        "fixed top-0 bottom-0 z-[var(--z-modal)] w-[var(--sidebar-width)] transition-transform duration-300 ease-in-out bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-2xl lg:shadow-none",
                        dir === 'rtl' ? "right-0 border-l border-r-0" : "left-0",
                        isOpen ? "translate-x-0" : (dir === 'rtl' ? "translate-x-full" : "-translate-x-full"),
                        "lg:translate-x-0"
                    )}
                    dir={dir}
                >
                    <div className="flex h-full flex-col animate-pulse">
                        {/* Header */}
                        <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
                            <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                                📺 beIN Panel
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-10 bg-sidebar-accent/50 rounded-md w-full mb-2"></div>
                            ))}
                        </div>

                        <div className="border-t border-sidebar-border p-4 bg-sidebar-accent/30">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-9 w-9 rounded-full bg-sidebar-accent/50"></div>
                                <div className="flex flex-col gap-2 flex-1">
                                    <div className="h-3 bg-sidebar-accent/50 rounded w-2/3"></div>
                                    <div className="h-2 bg-sidebar-accent/50 rounded w-1/3"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>
            </>
        )
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

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed top-0 bottom-0 z-[var(--z-modal)] w-[var(--sidebar-width)] transition-transform duration-300 ease-in-out bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-2xl lg:shadow-none",
                    dir === 'rtl' ? "right-0 border-l border-r-0" : "left-0",
                    isOpen ? "translate-x-0" : (dir === 'rtl' ? "translate-x-full" : "-translate-x-full"),
                    "lg:translate-x-0"
                )}
                dir={dir}
            >
                <div className="flex h-full flex-col">
                    {/* Header */}
                    <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
                        <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                            📺 beIN Panel
                        </span>
                        <div className="ml-auto lg:hidden">
                            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-sidebar-foreground">
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6 scrollbar-thin scrollbar-thumb-sidebar-accent scrollbar-track-transparent">

                        {/* Reseller Menu */}
                        <div>
                            <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                                {t.sidebar.mainMenu}
                            </h4>
                            <div className="space-y-1">
                                {resellerLinks.map((link) => {
                                    const Icon = link.icon
                                    const isActive = pathname === link.href
                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            onClick={onClose}
                                            className={cn(
                                                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                                isActive
                                                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {link.label}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>


                        {/* Manager Menu */}
                        {isManager && (
                            <div>
                                <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                                    لوحة المدير
                                </h4>
                                <div className="space-y-1">
                                    {managerLinks.map((link) => {
                                        const Icon = link.icon
                                        const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                                        return (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                onClick={onClose}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                                    isActive
                                                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {link.label}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Admin Menu */}
                        {isAdmin && (
                            <div>
                                <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                                    {t.sidebar.admin}
                                </h4>
                                <div className="space-y-1">
                                    {adminLinks.map((link) => {
                                        const Icon = link.icon
                                        const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                                        return (
                                            <Link
                                                key={link.href}
                                                href={link.href}
                                                onClick={onClose}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                                    isActive
                                                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {link.label}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer / User Profile */}
                    <div className="border-t border-sidebar-border p-4 bg-sidebar-accent/30">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-white">
                                <User className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-white">{session?.user?.username}</span>
                                <span className="text-xs text-sidebar-foreground/60 capitalize">
                                    {session?.user?.role?.toLowerCase() || 'User'}
                                </span>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                            onClick={handleLogout}
                        >
                            <LogOut className="h-4 w-4" />
                            <span>{t.common.logout || "Logout"}</span>
                        </Button>
                    </div>
                </div>
            </aside>
        </>
    )
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
    return (
        <Button variant="ghost" size="sm" onClick={onClick} className="lg:hidden">
            <Menu className="h-5 w-5" />
        </Button>
    )
}
