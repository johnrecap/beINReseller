/**
 * Store Customer Addresses
 * GET /api/store/addresses - List customer addresses
 * POST /api/store/addresses - Create new address
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'

// Validation schema
const addressSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().min(9, 'Invalid phone number'),
    country: z.enum(['SA', 'EG']),
    city: z.string().min(2, 'City is required'),
    district: z.string().optional(),
    street: z.string().min(2, 'Street is required'),
    building: z.string().optional(),
    floor: z.string().optional(),
    apartment: z.string().optional(),
    postalCode: z.string().optional(),
    isDefault: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
    try {
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const addresses = await prisma.customerAddress.findMany({
            where: { customerId: customer.id },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' },
            ],
            select: {
                id: true,
                name: true,
                phone: true,
                country: true,
                city: true,
                district: true,
                street: true,
                building: true,
                floor: true,
                apartment: true,
                postalCode: true,
                isDefault: true,
            }
        })
        
        return successResponse({ addresses })
        
    } catch (error) {
        return handleApiError(error)
    }
}

export async function POST(request: NextRequest) {
    try {
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const body = await request.json()
        
        // Validate input
        const result = addressSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        const data = result.data
        
        // If this is the first address or marked as default, make it default
        const addressCount = await prisma.customerAddress.count({
            where: { customerId: customer.id }
        })
        
        const isDefault = addressCount === 0 || data.isDefault === true
        
        // If setting as default, unset other defaults
        if (isDefault) {
            await prisma.customerAddress.updateMany({
                where: { customerId: customer.id },
                data: { isDefault: false }
            })
        }
        
        // Create address
        const address = await prisma.customerAddress.create({
            data: {
                customerId: customer.id,
                name: data.name,
                phone: data.phone,
                country: data.country,
                city: data.city,
                district: data.district || null,
                street: data.street,
                building: data.building || null,
                floor: data.floor || null,
                apartment: data.apartment || null,
                postalCode: data.postalCode || null,
                isDefault,
            },
            select: {
                id: true,
                name: true,
                phone: true,
                country: true,
                city: true,
                district: true,
                street: true,
                building: true,
                floor: true,
                apartment: true,
                postalCode: true,
                isDefault: true,
            }
        })
        
        return successResponse({ address }, 'Address added successfully', 201)
        
    } catch (error) {
        return handleApiError(error)
    }
}
