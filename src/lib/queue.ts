import { Queue } from 'bullmq'
import { actionRevision } from '../../shared/operations/package-quote'

const getRedisUrl = () => {
    if (process.env.REDIS_URL) {
        return process.env.REDIS_URL
    }
    return 'redis://localhost:6379'
}

function buildOperationJobId(data: { operationId: string; type: string; actionRevision?: number }) {
    const revision = actionRevision(data.type, data.actionRevision)
    return `${data.type}--${data.operationId}${revision > 0 ? `--${revision}` : ''}`
}

export interface OperationJobData {
    operationId: string
    type: string
    cardNumber: string
    duration?: string
    promoCode?: string
    promoAction?: 'APPLY' | 'REMOVE'
    actionRevision?: number
    userId?: string
    customerId?: string
    amount?: number
    smartcardType?: string
    verificationAttempt?: number
    queueTarget?: 'RESELLER' | 'CUSTOMER'
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
export async function addOperationJob(data: OperationJobData) {
    return operationsQueue.add('process-operation', data, {
        priority: 1,  // Higher priority for resellers
        jobId: buildOperationJobId(data), // Idempotency: prevent duplicate jobs for same operation+type
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
        jobId: `customer--${buildOperationJobId(data)}`,
    })
}

export default operationsQueue

