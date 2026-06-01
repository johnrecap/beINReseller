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

    // Fetch active banner
    useEffect(() => {
        const fetchBanner = async () => {
            try {
                const res = await fetch('/api/announcement/active')
                const data = await res.json()

                if (data.success && data.banner) {
                    setBanner(data.banner)
                }
            } catch {
            } finally {
                setIsLoading(false)
            }
        }

        fetchBanner()
    }, [])

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
                <AnnouncementBannerView banner={banner} />
            </motion.div>
        </AnimatePresence>
    )
}
