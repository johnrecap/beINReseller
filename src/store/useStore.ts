import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
    id: string
    username: string
    email: string
    role: 'ADMIN' | 'RESELLER'
    balance: number
    lowBalanceAlert: number
}

interface Settings {
    maintenanceMode: boolean
    maintenanceMessage: string
    notificationMessage: string
    prices: {
        renew1Month: number
        renew3Months: number
        renew6Months: number
        renew12Months: number
        checkBalance: number
        signalRefresh: number
    }
}

interface AppStore {
    // User state
    user: User | null
    setUser: (user: User | null) => void
    updateBalance: (balance: number) => void

    // Settings state
    settings: Settings | null
    setSettings: (settings: Settings) => void

    // UI state
    sidebarOpen: boolean
    setSidebarOpen: (open: boolean) => void

    // Loading states
    isLoading: boolean
    setIsLoading: (loading: boolean) => void
}

export const useStore = create<AppStore>()(
    persist(
        (set) => ({
            // User state
            user: null,
            setUser: (user) => set({ user }),
            updateBalance: (balance) =>
                set((state) => ({
                    user: state.user ? { ...state.user, balance } : null,
                })),

            // Settings state
            settings: null,
            setSettings: (settings) => set({ settings }),

            // UI state
            sidebarOpen: true,
            setSidebarOpen: (open) => set({ sidebarOpen: open }),

            // Loading states
            isLoading: false,
            setIsLoading: (loading) => set({ isLoading: loading }),
        }),
        {
            name: 'bein-store',
            partialize: (state) => ({
                sidebarOpen: state.sidebarOpen,
            }),
        }
    )
)

export default useStore
