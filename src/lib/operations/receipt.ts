import type { Prisma } from '@prisma/client'

type ReceiptProof = {
    proofKind: string
    invoiceNo: string
    cardNumberSnapshot: string
    reportItemType: string | null
    reportPackageName: string | null
    promoCodeSnapshot: string | null
    providerAmount: Prisma.Decimal | null
    currency: string | null
    contractStartDate: string | null
    contractExpiryDate: string | null
    reportDate: Date | null
    reportObservedAt: Date | null
    customerChargedAmount: Prisma.Decimal | null
}

export function projectRenewalReceipt(input: {
    id: string
    status: string
    fulfillmentAuthority: string | null
    fulfillmentProof: ReceiptProof | null
}) {
    const proof = input.fulfillmentProof
    if (input.status !== 'COMPLETED' || input.fulfillmentAuthority !== 'AUTOMATED_REPORT' ||
        proof?.proofKind !== 'SOLD_REPORT_SAME_DAY' || !proof.reportDate || !proof.reportObservedAt ||
        !proof.providerAmount || !proof.customerChargedAmount) return null
    return {
        operationId: input.id,
        beinInvoiceNo: proof.invoiceNo,
        cardNumber: proof.cardNumberSnapshot,
        itemType: proof.reportItemType,
        packageName: proof.reportPackageName,
        promoCode: proof.promoCodeSnapshot,
        providerAmount: proof.providerAmount.toFixed(2),
        currency: proof.currency,
        contractStartDate: proof.contractStartDate,
        contractExpiryDate: proof.contractExpiryDate,
        reportDate: proof.reportDate.toISOString().slice(0, 10),
        verifiedAt: proof.reportObservedAt.toISOString(),
        customerChargedAmount: proof.customerChargedAmount.toFixed(2),
    }
}
