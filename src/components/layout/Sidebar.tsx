'use client'

import { useEffect, useState } from 'react'
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
    Trash2,
    Megaphone,
    Activity,
    AlertTriangle,
    ShieldCheck,
    DollarSign,
    WalletCards,
    Gift,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import { Button } from '@/components/ui/button'
import { canAccessSubscription } from '@/lib/permissions'
import BrandLogo from '@/components/brand/BrandLogo'

interface SidebarProps {
    isOpen: boolean
    onClose: () => void
}

type SidebarLink = {
    href: string
    label: string
    icon: typeof Home
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname()
    const { data: session, status } = useSession()
    const { t, dir } = useTranslation()
    const userRole = session?.user?.role
    const isAdmin = userRole === 'ADMIN'
    const isManager = userRole === 'MANAGER'
    const isAgent = userRole === 'AGENT'
    const creditAgentAdminNavigationReady = true
    const creditRewardsNavigationReady = true
    const adminCreditRequestsReady = true

    // Sidebar visibility settings
    const [sidebarSettings, setSidebarSettings] = useState<Record<string, boolean>>({
        sidebar_show_login_failures: true,
        sidebar_show_low_balance: true,
    })

    useEffect(() => {
        if (isAdmin) {
            fetch('/api/admin/sidebar-settings')
                .then(res => res.json())
                .then(data => setSidebarSettings(data))
                .catch(() => { /* keep defaults */ })
        }
    }, [isAdmin])

    // Permission-based visibility
    const canRenew = canAccessSubscription(userRole)
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
        ...(creditRewardsNavigationReady ? [{ href: '/dashboard/rewards', label: 'Rewards', icon: Gift }] : []),
        { href: '/dashboard/profile', label: t.sidebar.profile, icon: User },
    ]

    // Combined reseller links
    const resellerLinks = [...baseLinks, ...renewalLinks, ...commonLinks]

    const managerLinks = [
        { href: '/dashboard/manager', label: t.sidebar.managerPanel, icon: BarChart3 },
        { href: '/dashboard/manager/users', label: t.sidebar.manageUsers, icon: Users },
        { href: '/dashboard/manager/deleted-users', label: t.sidebar.deletedAccounts, icon: Trash2 },
    ]

    const agentLinks = isAgent ? [
        { href: '/dashboard/agent', label: 'Agent Dashboard', icon: BarChart3 },
    ] : []

    const adminCreditAgentLinks = isAdmin ? [
        ...(adminCreditRequestsReady ? [{ href: '/dashboard/admin/credit-requests', label: 'Credit Requests', icon: ShieldCheck }] : []),
        ...(creditAgentAdminNavigationReady ? [
            { href: '/dashboard/admin/agents', label: 'Agents', icon: Users },
            { href: '/dashboard/admin/points', label: 'Points Settings', icon: DollarSign },
        ] : []),
        ...(creditRewardsNavigationReady ? [
            { href: '/dashboard/admin/rewards', label: 'Rewards', icon: WalletCards },
        ] : []),
    ] : []

    const adminLinks = [
        { href: '/dashboard/admin', label: t.sidebar.mainMenu, icon: Home },
        { href: '/dashboard/admin/users', label: t.sidebar.users, icon: Users },
        ...adminCreditAgentLinks,
        { href: '/dashboard/admin/users/activity', label: t.sidebar.activityMonitoring || 'Activity Monitoring', icon: Activity },
        { href: '/dashboard/admin/deleted-users', label: t.sidebar.deletedAccounts, icon: Trash2 },
        { href: '/dashboard/admin/bein-accounts', label: t.sidebar.beinAccounts, icon: Users },
        ...(sidebarSettings.sidebar_show_login_failures ? [{ href: '/dashboard/admin/bein-accounts/login-failures', label: 'Account Login Monitor', icon: AlertTriangle }] : []),
        ...(sidebarSettings.sidebar_show_low_balance ? [{ href: '/dashboard/admin/bein-accounts/low-balance', label: 'Balance Alert Monitor', icon: DollarSign }] : []),
        { href: '/dashboard/admin/proxies', label: t.sidebar.proxyManagement, icon: Globe },
        { href: '/dashboard/admin/analytics', label: t.sidebar.analytics, icon: BarChart3 },
        { href: '/dashboard/admin/financial-review', label: 'مراجعة العمليات', icon: ShieldCheck },
        { href: '/dashboard/admin/reports/integrity', label: t.sidebar.integrityReports || 'Integrity Reports', icon: AlertTriangle },
        { href: '/dashboard/admin/reports/bein-spend', label: t.sidebar.beinSpendReport || 'beIN Spend Report', icon: WalletCards },
        { href: '/dashboard/admin/bein-config', label: t.sidebar.beinConfig, icon: Bot },
        { href: '/dashboard/admin/settings', label: t.sidebar.settings, icon: Settings },
        { href: '/dashboard/admin/settings/announcements', label: t.sidebar.announcements || 'Announcements', icon: Megaphone },
        { href: '/dashboard/admin/logs', label: t.sidebar.logs, icon: FileText },
    ]


    const handleLogout = async () => {
        await signOut({ callbackUrl: '/login' })
    }

    const activeBorderClass = dir === 'rtl' ? 'border-l-2' : 'border-r-2'
    const activeOffsetClass = dir === 'rtl' ? '-translate-x-1' : 'translate-x-1'
    const renderNavLink = (link: SidebarLink, exact = false) => {
        const Icon = link.icon
        const isActive = exact ? pathname === link.href : pathname === link.href || pathname.startsWith(link.href + '/')

        return (
            <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={cn(
                    "group flex items-center gap-4 px-6 py-3 transition-all duration-200 active:scale-95",
                    "text-[#c0caae] hover:bg-white/5 hover:text-[#9ffb06]",
                    isActive && [
                        activeOffsetClass,
                        "bg-[#571bc1]/30 text-[#d0bcff]",
                        activeBorderClass,
                        "border-[#9ffb06]",
                    ]
                )}
            >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="stitch-label truncate">{link.label}</span>
            </Link>
        )
    }

    const renderSection = (title: string, links: SidebarLink[], exact = false) => (
        <div>
            <h4 className="mb-2 px-6 stitch-label text-[#c0caae]/70">
                {title}
            </h4>
            <div className="flex flex-col">
                {links.map((link) => renderNavLink(link, exact))}
            </div>
        </div>
    )

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
                    "stitch-sidebar fixed top-0 bottom-0 z-[var(--z-modal)] w-[var(--sidebar-width)] transition-transform duration-300 ease-in-out border-r",
                    dir === 'rtl' ? "right-0 border-l border-r-0" : "left-0",
                    isOpen ? "translate-x-0" : (dir === 'rtl' ? "translate-x-full" : "-translate-x-full"),
                    "lg:translate-x-0"
                    )}
                    dir={dir}
                >
                    <div className="flex h-full flex-col animate-pulse">
                        {/* Header */}
                        <div className="flex h-24 items-center px-6 border-b border-sidebar-border">
                            <BrandLogo className="h-16 w-full" compact />
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
                    "stitch-sidebar fixed top-0 bottom-0 z-[var(--z-modal)] w-[var(--sidebar-width)] transition-transform duration-300 ease-in-out border-r",
                    dir === 'rtl' ? "right-0 border-l border-r-0" : "left-0",
                    isOpen ? "translate-x-0" : (dir === 'rtl' ? "translate-x-full" : "-translate-x-full"),
                    "lg:translate-x-0"
                )}
                dir={dir}
            >
                <div className="flex h-full flex-col">
                    {/* Header */}
                    <div className="border-b border-white/5 px-6 py-8">
                        <div className="mb-3 flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-[#9ffb06] shadow-[0_0_10px_#9ffb06]" />
                            <span className="stitch-label text-[#c0caae]">System Status Indicator</span>
                            <div className={cn("lg:hidden", dir === 'rtl' ? "mr-auto" : "ml-auto")}>
                                <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-[#c0caae] hover:text-[#9ffb06]">
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                        <BrandLogo className="h-24 w-full rounded-2xl" compact />
                        <p className="mt-1 text-sm text-[#c0caae]">
                            {session?.user?.role?.toLowerCase() || 'user'} active
                        </p>
                    </div>

                    {/* Navigation */}
                    <div className="flex-1 overflow-y-auto py-6 space-y-6 scrollbar-thin scrollbar-thumb-[#35343b] scrollbar-track-transparent">

                        {/* Reseller Menu */}
                        {renderSection(t.sidebar.mainMenu, resellerLinks, true)}


                        {/* Manager Menu */}
                        {isManager && (
                            renderSection(t.sidebar.managerPanel, managerLinks)
                        )}

                        {/* Agent Menu: planned routes stay hidden until server guards and pages exist. */}
                        {agentLinks.length > 0 && (
                            renderSection('Agent Panel', agentLinks)
                        )}

                        {/* Admin Menu */}
                        {isAdmin && (
                            renderSection(t.sidebar.admin, adminLinks)
                        )}

                    </div>

                    {/* Footer / User Profile */}
                    <div className="border-t border-white/5 bg-[#1b1b22]/40 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#2a2930] text-[#9ffb06]">
                                <User className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-white">{session?.user?.username}</span>
                                <span className="text-xs capitalize text-[#c0caae]">
                                    {session?.user?.role?.toLowerCase() || 'User'}
                                </span>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full justify-start gap-2 rounded border-white/10 bg-transparent text-[#c0caae] hover:bg-white/5 hover:text-[#9ffb06]"
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
