/**
 * Store Pricing Utilities
 * 
 * Handles markup calculations for store subscriptions.
 * beIN prices are fetched dynamically and marked up for customers.
 */

import prisma from '@/lib/prisma'

/**
 * Get the current markup percentage from settings
 * @returns Markup percentage (e.g., 20 for 20%)
 */
export async function getMarkupPercentage(): Promise<number> {
    const setting = await prisma.storeSetting.findUnique({
        where: { key: 'store_markup_percentage' }
    })
    
    return setting ? parseFloat(setting.value) : 20 // Default 20%
}

/**
 * Calculate customer price with markup
 * @param beinPrice Original price from beIN
 * @param markupPercent Markup percentage (e.g., 20 for 20%)
 * @returns Final price for customer
 */
export function calculateCustomerPrice(beinPrice: number, markupPercent: number): number {
    const markup = beinPrice * (markupPercent / 100)
    return Math.ceil(beinPrice + markup) // Round up to nearest whole number
}

/**
 * Apply markup to a list of packages from beIN
 * @param packages Packages from beIN
 * @param markupPercent Markup percentage
 * @returns Packages with customer prices
 */
export function applyMarkupToPackages(
    packages: Array<{ index: number; name: string; price: number; checkboxSelector?: string }>,
    markupPercent: number
): Array<{ 
    index: number
    name: string
    beinPrice: number
    customerPrice: number
    markupPercent: number
    checkboxSelector?: string 
}> {
    return packages.map(pkg => ({
        index: pkg.index,
        name: pkg.name,
        beinPrice: pkg.price,
        customerPrice: calculateCustomerPrice(pkg.price, markupPercent),
        markupPercent,
        checkboxSelector: pkg.checkboxSelector,
    }))
}

/**
 * Get Stripe instance
 * Uses settings from database
 */
export async function getStripeSecretKey(): Promise<string | null> {
    const setting = await prisma.storeSetting.findUnique({
        where: { key: 'stripe_secret_key' }
    })
    
    return setting?.value || null
}

/**
 * Currency configuration for Stripe
 */
export const CURRENCY_CONFIG = {
    SA: {
        code: 'SAR',
        stripeCode: 'sar',
        symbol: 'SAR',
        name: 'Saudi Riyal',
        // Stripe uses smallest unit - SAR uses halalas (1 SAR = 100 halalas)
        multiplier: 100,
    },
    EG: {
        code: 'EGP',
        stripeCode: 'egp',
        symbol: 'EGP',
        name: 'Egyptian Pound',
        // Stripe uses smallest unit - EGP uses piasters (1 EGP = 100 piasters)
        multiplier: 100,
    }
} as const

/**
 * Convert amount to Stripe format (smallest unit)
 * @param amount Amount in main currency unit
 * @param country Country code (SA or EG)
 * @returns Amount in smallest unit for Stripe
 */
export function toStripeAmount(amount: number, country: 'SA' | 'EG'): number {
    const config = CURRENCY_CONFIG[country]
    return Math.round(amount * config.multiplier)
}

/**
 * Convert Stripe amount back to main currency unit
 * @param stripeAmount Amount in smallest unit from Stripe
 * @param country Country code (SA or EG)
 * @returns Amount in main currency unit
 */
export function fromStripeAmount(stripeAmount: number, country: 'SA' | 'EG'): number {
    const config = CURRENCY_CONFIG[country]
    return stripeAmount / config.multiplier
}
