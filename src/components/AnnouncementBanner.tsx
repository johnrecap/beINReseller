'use client'

/**
 * AnnouncementBanner — Live Dashboard Wrapper
 * =============================================
 * Fetches the active banner from the API and renders it
 * using the shared AnnouncementBannerView renderer.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnnouncementBannerView from '@/components/announcements/AnnouncementBannerView'
import type { BannerViewData } from '@/components/announcements/AnnouncementBannerView'

export default function AnnouncementBanner() {
    const [banner, setBanner] = useState<BannerViewData | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const getDismissalKey = (bannerData: BannerViewData) => {
        if (!bannerData.id) {
            return null
        }

        return `announcement-dismissed:${bannerData.id}:${bannerData.dismissalVersion || 1}`
    }

    // Fetch active banner
    useEffect(() => {
        const fetchBanner = async () => {
            try {
                const res = await fetch('/api/announcement/active')
                const data = await res.json()

                if (data.success && data.banner) {
                    const dismissalKey = getDismissalKey(data.banner)
                    if (
                        data.banner.isDismissable
                        && dismissalKey
                        && typeof window !== 'undefined'
                        && window.localStorage.getItem(dismissalKey) === '1'
                    ) {
                        setBanner(null)
                        return
                    }

                    setBanner(data.banner)
                }
            } catch (error) {
                console.error('Failed to fetch banner:', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchBanner()
    }, [])

    const handleDismiss = () => {
        if (!banner) {
            return
        }

        const dismissalKey = getDismissalKey(banner)
        if (dismissalKey && typeof window !== 'undefined') {
            window.localStorage.setItem(dismissalKey, '1')
        }

        setBanner(null)
    }

    // Don't render if loading or no banner
    if (isLoading || !banner) {
        return null
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
            >
                <AnnouncementBannerView banner={banner} onDismiss={handleDismiss} />
            </motion.div>
        </AnimatePresence>
    )
}
