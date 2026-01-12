'use client'

import { useSession } from 'next-auth/react'
import { Wallet } from 'lucide-react'
import { MobileMenuButton } from './Sidebar'
import NotificationBell from '@/components/NotificationBell'

interface HeaderProps {
    title: string
    onMenuClick: () => void
}

export default function Header({ title, onMenuClick }: HeaderProps) {
    const { data: session } = useSession()

    return (
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
            {/* Right Side - Menu + Title */}
            <div className="flex items-center gap-3">
                <MobileMenuButton onClick={onMenuClick} />
                <h1 className="text-lg lg:text-xl font-bold text-gray-800">{title}</h1>
            </div>

            {/* Left Side */}
            <div className="flex items-center gap-2 lg:gap-4">
                {/* Notifications */}
                <NotificationBell />

                {/* Balance */}
                <div className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl">
                    <Wallet className="w-4 lg:w-5 h-4 lg:h-5 text-purple-600" />
                    <div className="text-right">
                        <p className="text-[10px] lg:text-xs text-purple-600">رصيدي</p>
                        <p className="font-bold text-sm lg:text-base text-purple-700">
                            {session?.user?.balance?.toFixed(2) || '0.00'} <span className="hidden sm:inline">ريال</span>
                        </p>
                    </div>
                </div>
            </div>
        </header>
    )
}

