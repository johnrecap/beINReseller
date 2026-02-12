/**
 * Store Subscription Packages
 * GET /api/store/subscriptions
 * 
 * Returns all active subscription packages.
 * Public endpoint - no authentication required.
 * 
 * Query params:
 * - country: SA or EG - For price selection
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, handleApiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const country = searchParams.get('country') || 'SA'
        
        const packages = await prisma.subscriptionPackage.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                name: true,
                nameAr: true,
                description: true,
                descriptionAr: true,
                duration: true,
                priceSAR: true,
                priceEGP: true,
                features: true,
                featuresAr: true,
                isPopular: true,
            }
        })
        
        // Transform to include appropriate price based on country
        const result = packages.map(pkg => ({
            id: pkg.id,
            name: pkg.name,
            nameAr: pkg.nameAr,
            description: pkg.description,
            descriptionAr: pkg.descriptionAr,
            duration: pkg.duration,
            durationLabel: getDurationLabel(pkg.duration, country === 'SA' ? 'ar' : 'en'),
            price: country === 'EG' ? pkg.priceEGP : pkg.priceSAR,
            currency: country === 'EG' ? 'EGP' : 'SAR',
            features: country === 'EG' ? pkg.features : pkg.featuresAr,
            isPopular: pkg.isPopular,
        }))
        
        return successResponse({ packages: result })
        
    } catch (error) {
        return handleApiError(error)
    }
}

function getDurationLabel(months: number, lang: string): string {
    if (lang === 'ar') {
        if (months === 1) return '1 Month'
        if (months === 3) return '3 Months'
        if (months === 6) return '6 Months'
        if (months === 12) return '1 Year'
        return `${months} Months`
    }
    
    if (months === 1) return '1 Month'
    if (months === 12) return '1 Year'
    return `${months} Months`
}
