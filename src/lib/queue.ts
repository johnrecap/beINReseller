import { Queue } from 'bullmq'

const getRedisUrl = () => {
    if (process.env.REDIS_URL) {
        return process.env.REDIS_URL
    }
    return 'redis://localhost:6379'
}

// ===== Reseller Operations Queue (Priority 1 - Higher) =====
export const operationsQueue = new Queue('operations', {
    connection: {
        url: getRedisUrl(),
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 1000,
    },
})

// ===== Customer Operations Queue (Priority 2 - Lower) =====
// For mobile app customers - isolated from reseller operations
export const customerOperationsQueue = new Queue('customer-operations', {
    connection: {
        url: getRedisUrl(),
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 3000,  // Slightly longer delay for customers
        },
        removeOnComplete: 100,
        removeOnFail: 1000,
    },
})

// ===== Reseller Job Function (Priority 1) =====
export async function addOperationJob(data: {
    operationId: string
    type: string
    cardNumber: string
    duration?: string
    promoCode?: string      // Promo code for discount (Wizard flow)
    userId?: string
    customerId?: string     // Store customer ID (for store app)
    amount?: number
}) {
    return operationsQueue.add('process-operation', data, {
        priority: 1,  // Higher priority for resellers
    })
}

// ===== Customer Job Function (Priority 2) =====
export async function addCustomerOperationJob(data: {
    operationId: string
    type: string
    cardNumber?: string     // Optional for CONFIRM_PURCHASE
    duration?: string
    customerId: string      // Required for customers
    amount?: number
}) {
    return customerOperationsQueue.add('process-customer-operation', data, {
        priority: 2,  // Lower priority for customers
    })
}

export default operationsQueue

