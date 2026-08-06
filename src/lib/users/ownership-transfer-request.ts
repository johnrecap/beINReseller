export type OwnershipTransferTargetType = 'ADMIN' | 'MANAGER' | 'AGENT'

export type OwnershipTransferRequest = {
    userId: string
    targetOwnerType: OwnershipTransferTargetType
    targetOwnerId: string
    expectedOwnershipToken: string
    reason: string
    sourceGroup?: string
    whatsappGroupUrl?: string
}

type BuildOwnershipTransferRequestInput = OwnershipTransferRequest & {
    sourceGroup: string
    whatsappGroupUrl: string
    sourceGroupTouched: boolean
    whatsappGroupUrlTouched: boolean
}

export function buildOwnershipTransferRequest(
    input: BuildOwnershipTransferRequestInput
): OwnershipTransferRequest {
    const request: OwnershipTransferRequest = {
        userId: input.userId,
        targetOwnerType: input.targetOwnerType,
        targetOwnerId: input.targetOwnerId,
        expectedOwnershipToken: input.expectedOwnershipToken,
        reason: input.reason,
    }

    if (input.targetOwnerType === 'AGENT') {
        if (input.sourceGroupTouched) request.sourceGroup = input.sourceGroup
        if (input.whatsappGroupUrlTouched) request.whatsappGroupUrl = input.whatsappGroupUrl
    }

    return request
}
