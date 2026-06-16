import type { Contract } from '../http/types';

export type ContractVerificationOutcome =
    | 'CONTRACT_VERIFIED_SUCCESS'
    | 'NO_MATCHING_CONTRACT'
    | 'CHECK_FAILED';

export const RENEWAL_CONTRACT_VERIFICATION_ATTEMPTS = 3;
export const RENEWAL_CONTRACT_VERIFICATION_DELAY_MS = 3000;

export interface ContractVerificationEvidence {
    outcome: ContractVerificationOutcome;
    checkedAt: string;
    referenceDate: string;
    selectedPackageName: string | null;
    contractCount: number;
    matchedContract: Contract | null;
    reason: string;
    error?: string;
    attempt?: number;
    maxAttempts?: number;
}

interface BuildContractVerificationInput {
    contracts: Contract[];
    selectedPackageName?: string | null;
    operationCreatedAt: Date;
    responseData?: unknown;
    checkedAt?: Date;
}

function parseRecord(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {};
        } catch {
            return {};
        }
    }
    return typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function getString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getRenewalContractReferenceDate(responseData: unknown, fallback: Date): Date {
    const data = parseRecord(responseData);
    const raw =
        getString(data.finalPayRequestStartedAt) ||
        getString(data.finalPaySubmittedAt) ||
        getString(data.providerEvidenceCapturedAt);
    if (!raw) return fallback;

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function cairoYmdNumber(date: Date): number {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    return year * 10000 + month * 100 + day;
}

function parseContractDateYmd(value: string): number | null {
    const trimmed = value.trim();
    const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const day = Number(slash[1]);
        const month = Number(slash[2]);
        const year = Number(slash[3]);
        return year * 10000 + month * 100 + day;
    }

    const dash = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dash) {
        const year = Number(dash[1]);
        const month = Number(dash[2]);
        const day = Number(dash[3]);
        return year * 10000 + month * 100 + day;
    }

    return null;
}

function normalizePackageText(value: string): string {
    return value
        .toLowerCase()
        .replace(/\bfull\s+payment\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function packageMatches(selectedPackageName: string | null | undefined, contractPackageName: string): boolean {
    if (!selectedPackageName) return false;

    const selected = normalizePackageText(selectedPackageName);
    const contract = normalizePackageText(contractPackageName);
    if (!selected || !contract) return false;
    if (selected.includes(contract) || contract.includes(selected)) return true;

    const selectedTokens = selected.split(' ').filter(Boolean);
    const contractTokens = new Set(contract.split(' ').filter(Boolean));
    const overlap = selectedTokens.filter((token) => contractTokens.has(token)).length;
    return overlap / Math.max(1, Math.min(selectedTokens.length, contractTokens.size)) >= 0.75;
}

function isActiveContractStatus(status: string): boolean {
    const normalized = status.toLowerCase();
    return normalized.includes('active') &&
        !normalized.includes('expired') &&
        !normalized.includes('cancel');
}

export function findMatchingRenewalContract(input: {
    contracts: Contract[];
    selectedPackageName?: string | null;
    referenceDate: Date;
}): Contract | null {
    const referenceYmd = cairoYmdNumber(input.referenceDate);

    return input.contracts.find((contract) => {
        const startYmd = parseContractDateYmd(contract.startDate || '');
        if (startYmd === null || startYmd < referenceYmd) return false;
        if (!isActiveContractStatus(contract.status || '')) return false;
        return packageMatches(input.selectedPackageName, contract.package || '');
    }) ?? null;
}

export function buildRenewalContractVerification(
    input: BuildContractVerificationInput
): ContractVerificationEvidence {
    const checkedAt = input.checkedAt ?? new Date();
    const referenceDate = getRenewalContractReferenceDate(input.responseData, input.operationCreatedAt);
    const matchedContract = findMatchingRenewalContract({
        contracts: input.contracts,
        selectedPackageName: input.selectedPackageName,
        referenceDate,
    });

    if (matchedContract) {
        return {
            outcome: 'CONTRACT_VERIFIED_SUCCESS',
            checkedAt: checkedAt.toISOString(),
            referenceDate: referenceDate.toISOString(),
            selectedPackageName: input.selectedPackageName || null,
            contractCount: input.contracts.length,
            matchedContract,
            reason: 'Matching active beIN contract found after final Pay.',
        };
    }

    return {
        outcome: 'NO_MATCHING_CONTRACT',
        checkedAt: checkedAt.toISOString(),
        referenceDate: referenceDate.toISOString(),
        selectedPackageName: input.selectedPackageName || null,
        contractCount: input.contracts.length,
        matchedContract: null,
        reason: 'No matching active beIN contract was found after final Pay.',
    };
}

export function buildFailedContractVerification(input: {
    selectedPackageName?: string | null;
    operationCreatedAt: Date;
    responseData?: unknown;
    error: string;
    checkedAt?: Date;
}): ContractVerificationEvidence {
    const checkedAt = input.checkedAt ?? new Date();
    const referenceDate = getRenewalContractReferenceDate(input.responseData, input.operationCreatedAt);

    return {
        outcome: 'CHECK_FAILED',
        checkedAt: checkedAt.toISOString(),
        referenceDate: referenceDate.toISOString(),
        selectedPackageName: input.selectedPackageName || null,
        contractCount: 0,
        matchedContract: null,
        reason: 'Live beIN contract check failed.',
        error: input.error,
    };
}
