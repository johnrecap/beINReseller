/**
 * Store Shipping Regions
 * GET /api/store/shipping
 * 
 * Returns shipping regions with costs.
 * Public endpoint - no authentication required.
 * 
 * Query params:
 * - country: SA or EG (required)
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const country = searchParams.get('country')
        
        // Build where clause
        const where: Record<string, unknown> = {
            isActive: true,
        }
        
        if (country) {
            where.country = country
        }
        
        const regions = await prisma.shippingRegion.findMany({
            where,
            orderBy: [
                { country: 'asc' },
                { city: 'asc' },
            ],
            select: {
                id: true,
                country: true,
                countryName: true,
                countryNameAr: true,
                city: true,
                cityAr: true,
                shippingCostSAR: true,
                shippingCostEGP: true,
                estimatedDays: true,
            }
        })
        
        // Transform to include appropriate price based on country
        const result = regions.map(region => ({
            id: region.id,
            country: region.country,
            countryName: region.countryName,
            countryNameAr: region.countryNameAr,
            city: region.city,
            cityAr: region.cityAr,
            shippingCost: region.country === 'EG' ? region.shippingCostEGP : region.shippingCostSAR,
            currency: region.country === 'EG' ? 'EGP' : 'SAR',
            estimatedDays: region.estimatedDays,
        }))
        
        // Group by country
        const grouped = {
            SA: result.filter(r => r.country === 'SA'),
            EG: result.filter(r => r.country === 'EG'),
        }
        
        return successResponse({ 
            regions: country ? result : grouped,
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}

/**
 * POST /api/store/shipping/calculate
 * Calculate shipping cost for a specific city
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { country, city } = body
        
        if (!country || !city) {
            return errorResponse('Country and city are required', 400, 'MISSING_PARAMS')
        }
        
        const region = await prisma.shippingRegion.findFirst({
            where: {
                country,
                city,
                isActive: true,
            }
        })
        
        if (!region) {
            // Try to find "Other" city as fallback
            const fallback = await prisma.shippingRegion.findFirst({
                where: {
                    country,
                    city: { contains: 'Other' },
                    isActive: true,
                }
            })
            
            if (!fallback) {
                return errorResponse('Shipping region not available', 404, 'REGION_NOT_FOUND')
            }
            
            return successResponse({
                shippingCost: country === 'EG' ? fallback.shippingCostEGP : fallback.shippingCostSAR,
                currency: country === 'EG' ? 'EGP' : 'SAR',
                estimatedDays: fallback.estimatedDays,
                isFallback: true,
            })
        }
        
        return successResponse({
            shippingCost: country === 'EG' ? region.shippingCostEGP : region.shippingCostSAR,
            currency: country === 'EG' ? 'EGP' : 'SAR',
            estimatedDays: region.estimatedDays,
            isFallback: false,
        })
        
    } catch (error) {
        return handleApiError(error)
    }
}
