import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
    id: string
    username: string
    email: string
    role: 'ADMIN' | 'MANAGER' | 'USER'
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

    // Language state
    language: string
    setLanguage: (language: string) => void

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

            // Language state - English as default
            language: 'en',
            setLanguage: (language) => set({ language }),

            // Loading states
            isLoading: false,
            setIsLoading: (loading) => set({ isLoading: loading }),
        }),
        {
            name: 'bein-store',
            version: 1, // Increment to trigger migration for existing users
            partialize: (state) => ({
                sidebarOpen: state.sidebarOpen,
                language: state.language,
            }),
            migrate: (persistedState: unknown, version: number) => {
                const state = persistedState as { sidebarOpen?: boolean; language?: string }
                if (version === 0) {
                    // Migration: Reset language to English for existing users
                    return { ...state, language: 'en' }
                }
                return state
            },
        }
    )
)

export default useStore
