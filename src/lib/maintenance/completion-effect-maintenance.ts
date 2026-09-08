import prisma from '@/lib/prisma'
import { deliverCompletionEffects } from '../../../shared/operations/completion-effects'

export function repairCompletionEffects(options?: { limit?: number; now?: Date }) {
    return deliverCompletionEffects(prisma, options)
}
