import prisma from '@/lib/prisma'
import { OPERATION_PRICES, OPERATION_TYPES } from '@/lib/constants'

/**
 * Get operation price from database settings
 * Falls back to constants if not found
 */
export async function getOperationPriceFromDB(type: string, duration?: string): Promise<number> {
    try {
        // Construct the setting key
        let settingKey = ''

        if (type === OPERATION_TYPES.RENEW && duration) {
            // Map duration values to setting keys
            // 1_month -> RENEW_1_MONTH
            const durationSuffix = duration.toUpperCase()
            settingKey = `RENEW_${durationSuffix}`
        } else {
            settingKey = type
        }

        // Try to find in DB
        const setting = await prisma.setting.findUnique({
            where: { key: settingKey }
        })

        if (setting?.value) {
            const price = parseFloat(setting.value)
            if (!isNaN(price)) {
                return price
            }
        }

        // Fallback to constants
        if (type === OPERATION_TYPES.RENEW && duration) {
            const key = `RENEW_${duration.toUpperCase()}` as keyof typeof OPERATION_PRICES
            return OPERATION_PRICES[key] ?? 0
        }

        const key = type as keyof typeof OPERATION_PRICES
        return OPERATION_PRICES[key] ?? 0

    } catch (error) {
        console.error(`Error fetching price for ${type}:`, error)
        // Fallback on error
        if (type === OPERATION_TYPES.RENEW && duration) {
            const key = `RENEW_${duration.toUpperCase()}` as keyof typeof OPERATION_PRICES
            return OPERATION_PRICES[key] ?? 0
        }
        const key = type as keyof typeof OPERATION_PRICES
        return OPERATION_PRICES[key] ?? 0
    }
}

/**
 * Get all operation prices
 */
export async function getAllOperationPrices() {
    try {
        const settings = await prisma.setting.findMany({
            where: {
                key: {
                    in: Object.keys(OPERATION_PRICES)
                }
            }
        })

        const dbPrices = settings.reduce((acc, curr) => {
            acc[curr.key] = parseFloat(curr.value)
            return acc
        }, {} as Record<string, number>)

        return {
            ...OPERATION_PRICES,
            ...dbPrices
        }
    } catch (error) {
        console.error('Error fetching all prices:', error)
        return OPERATION_PRICES
    }
}
