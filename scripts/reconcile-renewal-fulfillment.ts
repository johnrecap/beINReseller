import { Prisma } from '@prisma/client'
import prisma from '../src/lib/prisma'
import {
    findDuplicateRenewalBursts,
    parseRenewalFulfillmentReconciliationArgs,
} from '../src/lib/renewal-fulfillment/reconciliation'

type JsonRecord = Record<string, unknown>

const RECONCILIATION_PAGE_SIZE = 500

type ScannedOperation = {
    id: string
    userId: string
    beinAccountId: string | null
    cardNumber: string
    amount: number
    status: string
    createdAt: Date
    selectedPackage: Prisma.JsonValue | null
    responseData: Prisma.JsonValue | null
    fulfillmentAuthority: string | null
    manualFulfillmentEvidence: { id: string } | null
    chargedBeinSpendLedger: {
        id: string
        chargedAt: Date
        spendAmount: number
        cardNumberSnapshot: string
        selectedPackageName: string | null
    }
}

type ProofRecord = {
    id: string
    operationId: string
    beinAccountId: string
    invoiceNo: string
    proofKind: string
}

function record(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : null
}

function packageName(value: unknown): string | null {
    const selected = record(value)
    return typeof selected?.name === 'string' && selected.name.trim()
        ? selected.name.trim()
        : null
}

function verifiedInvoice(value: unknown): string | null {
    const data = record(value)
    const contractVerification = record(data?.contractVerification)
    const contract = record(contractVerification?.matchedContract)
    const invoice = contract?.invoiceNo
    return typeof invoice === 'string' && invoice.trim() ? invoice.trim() : null
}

async function scanChargedRenewalOperations(options: {
    from: Date
    to: Date
    cardNumber?: string
}): Promise<ScannedOperation[]> {
    const operations: ScannedOperation[] = []
    let cursorId: string | undefined

    do {
        const page = await prisma.beinAccountSpendLedger.findMany({
            where: {
                operationType: 'RENEW',
                chargedAt: { gte: options.from, lte: options.to },
                ...(options.cardNumber ? { cardNumberSnapshot: options.cardNumber } : {}),
            },
            select: {
                id: true,
                chargedAt: true,
                spendAmount: true,
                cardNumberSnapshot: true,
                selectedPackageName: true,
                operation: {
                    select: {
                        id: true,
                        userId: true,
                        beinAccountId: true,
                        cardNumber: true,
                        amount: true,
                        status: true,
                        createdAt: true,
                        selectedPackage: true,
                        responseData: true,
                        fulfillmentAuthority: true,
                        manualFulfillmentEvidence: { select: { id: true } },
                    },
                },
            },
            orderBy: { id: 'asc' },
            take: RECONCILIATION_PAGE_SIZE,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        })

        operations.push(...page.map((ledger) => ({
            ...ledger.operation,
            chargedBeinSpendLedger: {
                id: ledger.id,
                chargedAt: ledger.chargedAt,
                spendAmount: ledger.spendAmount,
                cardNumberSnapshot: ledger.cardNumberSnapshot,
                selectedPackageName: ledger.selectedPackageName,
            },
        })))
        cursorId = page.at(-1)?.id
        if (page.length < RECONCILIATION_PAGE_SIZE) break
    } while (cursorId)

    return operations
}

async function scanProofsForAccounts(beinAccountIds: string[]): Promise<ProofRecord[]> {
    if (beinAccountIds.length === 0) return []
    const proofs: ProofRecord[] = []
    let cursorId: string | undefined

    try {
        do {
            const page = await prisma.operationFulfillmentProof.findMany({
                where: { beinAccountId: { in: beinAccountIds } },
                select: {
                    id: true,
                    operationId: true,
                    beinAccountId: true,
                    invoiceNo: true,
                    proofKind: true,
                },
                orderBy: { id: 'asc' },
                take: RECONCILIATION_PAGE_SIZE,
                ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            })
            proofs.push(...page)
            cursorId = page.at(-1)?.id
            if (page.length < RECONCILIATION_PAGE_SIZE) break
        } while (cursorId)
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021')) {
            throw error
        }
        console.warn('Fulfillment proof table is not deployed yet; treating all scanned operations as having no durable proof.')
    }

    return proofs
}

async function scanLegacyInvoiceCandidates(beinAccountIds: string[]): Promise<Array<{
    id: string
    beinAccountId: string | null
    responseData: Prisma.JsonValue | null
}>> {
    if (beinAccountIds.length === 0) return []
    const operations: Array<{
        id: string
        beinAccountId: string | null
        responseData: Prisma.JsonValue | null
    }> = []
    let cursorId: string | undefined

    do {
        const page = await prisma.operation.findMany({
            where: {
                type: 'RENEW',
                beinAccountId: { in: beinAccountIds },
                responseData: { not: Prisma.DbNull },
            },
            select: { id: true, beinAccountId: true, responseData: true },
            orderBy: { id: 'asc' },
            take: RECONCILIATION_PAGE_SIZE,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        })
        operations.push(...page)
        cursorId = page.at(-1)?.id
        if (page.length < RECONCILIATION_PAGE_SIZE) break
    } while (cursorId)

    return operations
}

async function main() {
    const options = parseRenewalFulfillmentReconciliationArgs(process.argv.slice(2))
    const operations = await scanChargedRenewalOperations(options)

    const operationIds = operations.map((operation) => operation.id)
    const scopedOperationIds = new Set(operationIds)
    const operationById = new Map(operations.map((operation) => [operation.id, operation]))
    const accountIds = [...new Set(operations.flatMap((operation) => operation.beinAccountId ? [operation.beinAccountId] : []))]
    const allAccountProofs = await scanProofsForAccounts(accountIds)
    const proofByOperationId = new Map<string, ProofRecord>()
    for (const proof of allAccountProofs) {
        if (scopedOperationIds.has(proof.operationId)) proofByOperationId.set(proof.operationId, proof)
    }

    const missingProof = operations.filter((operation) =>
        operation.status === 'COMPLETED' &&
        Boolean(operation.chargedBeinSpendLedger) &&
        proofByOperationId.get(operation.id)?.proofKind !== 'SOLD_REPORT_CONTRACT_CORRELATION' &&
        !(
            operation.fulfillmentAuthority === 'MANUAL_PROVIDER_CONFIRMATION' &&
            operation.manualFulfillmentEvidence
        )
    )
    const bursts = findDuplicateRenewalBursts(
        operations
            .flatMap((operation) => {
                const selectedPackageName = operation.chargedBeinSpendLedger.selectedPackageName || packageName(operation.selectedPackage)
                if (!selectedPackageName) return []
                return [{
                    operationId: operation.id,
                    cardNumber: operation.chargedBeinSpendLedger.cardNumberSnapshot,
                    packageName: selectedPackageName,
                    amount: operation.chargedBeinSpendLedger.spendAmount,
                    chargedAt: operation.chargedBeinSpendLedger.chargedAt,
                }]
            }),
        options.duplicateWindowMinutes
    )

    const targetProofKeys = new Set<string>()
    for (const operation of operations) {
        const invoiceNo = proofByOperationId.get(operation.id)?.invoiceNo || verifiedInvoice(operation.responseData)
        if (!invoiceNo || !operation.beinAccountId) continue
        targetProofKeys.add(`${operation.beinAccountId}|${invoiceNo}`)
    }

    const invoiceOperations = new Map<string, Set<string>>()
    const addInvoiceOperation = (key: string, operationId: string) => {
        if (!targetProofKeys.has(key)) return
        const operationIdsForInvoice = invoiceOperations.get(key) || new Set<string>()
        operationIdsForInvoice.add(operationId)
        invoiceOperations.set(key, operationIdsForInvoice)
    }
    for (const proof of allAccountProofs) {
        addInvoiceOperation(`${proof.beinAccountId}|${proof.invoiceNo}`, proof.operationId)
    }
    for (const operation of await scanLegacyInvoiceCandidates(accountIds)) {
        const invoiceNo = verifiedInvoice(operation.responseData)
        if (!invoiceNo || !operation.beinAccountId) continue
        addInvoiceOperation(`${operation.beinAccountId}|${invoiceNo}`, operation.id)
    }
    const invoiceConflicts = [...invoiceOperations.entries()]
        .filter(([, conflictingOperationIds]) => conflictingOperationIds.size > 1)
        .map(([proofKey, conflictingOperationIds]) => ({ proofKey, operationIds: [...conflictingOperationIds] }))

    const issueWrites: Array<{
        operationId: string
        issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED' | 'DUPLICATE_RENEWAL_CHARGE_BURST' | 'FULFILLMENT_PROOF_CONFLICT'
        details: Prisma.InputJsonValue
    }> = []
    for (const operation of missingProof) {
        issueWrites.push({
            operationId: operation.id,
            issueType: 'PROVIDER_CHARGED_FULFILLMENT_UNVERIFIED',
            details: { source: 'renewal_fulfillment_reconciliation', chargedLedgerId: operation.chargedBeinSpendLedger?.id },
        })
    }
    for (const burst of bursts) {
        for (const operationId of burst.operationIds) {
            issueWrites.push({
                operationId,
                issueType: 'DUPLICATE_RENEWAL_CHARGE_BURST',
                details: {
                    source: 'renewal_fulfillment_reconciliation',
                    operationIds: burst.operationIds,
                    windowStart: burst.firstChargedAt.toISOString(),
                    windowEnd: burst.lastChargedAt.toISOString(),
                },
            })
        }
    }
    for (const conflict of invoiceConflicts) {
        for (const operationId of conflict.operationIds) {
            if (!scopedOperationIds.has(operationId)) continue
            issueWrites.push({
                operationId,
                issueType: 'FULFILLMENT_PROOF_CONFLICT',
                details: { source: 'renewal_fulfillment_reconciliation', proofKey: conflict.proofKey, operationIds: conflict.operationIds },
            })
        }
    }

    const uniqueWrites = [...new Map(
        issueWrites.map((issue) => [`${issue.operationId}|${issue.issueType}`, issue])
    ).values()]

    const summary = {
        mode: options.apply ? 'apply' : 'dry-run',
        mutated: false,
        range: {
            from: options.from.toISOString(),
            to: options.to.toISOString(),
            timezoneNote: 'Timestamps are parsed as explicit ISO instants; incident offsets use Africa/Cairo.',
        },
        cardNumber: options.cardNumber || null,
        duplicateWindowMinutes: options.duplicateWindowMinutes,
        scannedOperations: operations.length,
        candidateCounts: {
            missingProof: missingProof.length,
            duplicateBursts: bursts.length,
            invoiceConflicts: invoiceConflicts.length,
        },
        missingProofOperationIds: missingProof.map((operation) => operation.id),
        duplicateBursts: bursts.map((burst) => ({ ...burst, firstChargedAt: burst.firstChargedAt.toISOString(), lastChargedAt: burst.lastChargedAt.toISOString() })),
        invoiceConflicts,
        issueCount: uniqueWrites.length,
    }

    if (!options.apply) {
        console.log(JSON.stringify(summary, null, 2))
        return
    }

    for (const issue of uniqueWrites) {
        const operation = operationById.get(issue.operationId)!
        await prisma.operationIntegrityIssue.upsert({
            where: {
                operationId_issueType: {
                    operationId: issue.operationId,
                    issueType: issue.issueType,
                },
            },
            create: {
                operationId: issue.operationId,
                userId: operation.userId,
                beinAccountId: operation.beinAccountId,
                issueType: issue.issueType,
                severity: 'HIGH',
                status: 'OPEN',
                operationAmount: operation.amount,
                details: issue.details,
            },
            update: {
                lastSeenAt: new Date(),
                details: issue.details,
            },
        })
    }

    console.log(JSON.stringify({
        ...summary,
        mutated: uniqueWrites.length > 0,
        appliedIssueCount: uniqueWrites.length,
    }, null, 2))
}

main()
    .catch((error) => {
        const code = error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : null
        console.error(JSON.stringify({
            code,
            message: code
                ? 'Database reconciliation failed; inspect authorized server logs.'
                : error instanceof Error ? error.message : String(error),
        }))
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
