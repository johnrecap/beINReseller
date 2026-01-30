import { Queue } from 'bullmq'

const getRedisUrl = () => {
    if (process.env.REDIS_URL) {
        return process.env.REDIS_URL
    }
    return 'redis://localhost:6379'
}

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
        priority: 1,
    })
}

export default operationsQueue
