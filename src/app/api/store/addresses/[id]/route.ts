/**
 * Store Customer Address Detail
 * GET /api/store/addresses/[id] - Get address
 * PUT /api/store/addresses/[id] - Update address
 * DELETE /api/store/addresses/[id] - Delete address
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { successResponse, errorResponse, handleApiError, validationErrorResponse } from '@/lib/api-response'
import { getStoreCustomerFromRequest } from '@/lib/store-auth'

interface RouteParams {
    params: Promise<{ id: string }>
}

// Validation schema for update
const updateAddressSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    phone: z.string().min(9, 'Invalid phone number').optional(),
    country: z.enum(['SA', 'EG']).optional(),
    city: z.string().min(2, 'City is required').optional(),
    district: z.string().optional().nullable(),
    street: z.string().min(2, 'Street is required').optional(),
    building: z.string().optional().nullable(),
    floor: z.string().optional().nullable(),
    apartment: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    isDefault: z.boolean().optional(),
})

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        
        const address = await prisma.customerAddress.findFirst({
            where: { 
                id,
                customerId: customer.id,
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
        
        if (!address) {
            return errorResponse('Address not found', 404, 'NOT_FOUND')
        }
        
        return successResponse({ address })
        
    } catch (error) {
        return handleApiError(error)
    }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        const body = await request.json()
        
        // Validate input
        const result = updateAddressSchema.safeParse(body)
        if (!result.success) {
            return validationErrorResponse(result.error)
        }
        
        // Check address exists and belongs to customer
        const existingAddress = await prisma.customerAddress.findFirst({
            where: { 
                id,
                customerId: customer.id,
            }
        })
        
        if (!existingAddress) {
            return errorResponse('Address not found', 404, 'NOT_FOUND')
        }
        
        const data = result.data
        
        // If setting as default, unset other defaults
        if (data.isDefault === true) {
            await prisma.customerAddress.updateMany({
                where: { 
                    customerId: customer.id,
                    id: { not: id }
                },
                data: { isDefault: false }
            })
        }
        
        // Update address
        const address = await prisma.customerAddress.update({
            where: { id },
            data,
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
        
        return successResponse({ address }, 'Address updated successfully')
        
    } catch (error) {
        return handleApiError(error)
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const customer = getStoreCustomerFromRequest(request)
        
        if (!customer) {
            return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
        }
        
        const { id } = await params
        
        // Check address exists and belongs to customer
        const existingAddress = await prisma.customerAddress.findFirst({
            where: { 
                id,
                customerId: customer.id,
            }
        })
        
        if (!existingAddress) {
            return errorResponse('Address not found', 404, 'NOT_FOUND')
        }
        
        // Delete address
        await prisma.customerAddress.delete({
            where: { id }
        })
        
        // If deleted address was default, make the most recent one default
        if (existingAddress.isDefault) {
            const nextAddress = await prisma.customerAddress.findFirst({
                where: { customerId: customer.id },
                orderBy: { createdAt: 'desc' }
            })
            
            if (nextAddress) {
                await prisma.customerAddress.update({
                    where: { id: nextAddress.id },
                    data: { isDefault: true }
                })
            }
        }
        
        return successResponse(null, 'Address deleted successfully')
        
    } catch (error) {
        return handleApiError(error)
    }
}
