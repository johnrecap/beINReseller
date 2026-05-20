import type { OperationStatus } from '@prisma/client'
import type { CancellationSafetyDecision } from './operation-safety'
import {
    decideOperationCancellationSafety,
    isTerminalOperationStatus as isTerminalStatus,
} from './operation-safety'

export type CancellationDecision = CancellationSafetyDecision

export function decideCancellationSafety(status: OperationStatus): CancellationDecision {
    return decideOperationCancellationSafety({ operationStatus: status })
}

export function isTerminalOperationStatus(status: OperationStatus | null | undefined): boolean {
    return isTerminalStatus(status)
}
