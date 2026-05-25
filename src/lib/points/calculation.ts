export type PointProgramSettingsInput = {
    pointsEnabled: boolean
    pointsStartAt: Date | null
    cashConversionPoints: number
    cashConversionAmountUsd: number
}

export type PointProgramSettingsValidation =
    | { ok: true }
    | { ok: false; reason: 'DISABLED' | 'MISSING_START_DATE' | 'INVALID_CONVERSION_RATIO' }

export type SpendPointCalculationInput = {
    amountUsd: number
    pointsPerThousand: number
}

export type SpendPointCalculation = {
    points: number
    amountUsdSnapshot: number
    ratePerThousandSnapshot: number
}

export type CashConversionInput = {
    pointsToConvert: number
    conversionPoints: number
    conversionAmountUsd: number
    availablePoints: number
}

export type CashConversionResult =
    | {
        ok: true
        pointsConverted: number
        balanceAmountUsd: number
    }
    | {
        ok: false
        reason: 'INVALID_POINTS' | 'INVALID_CONVERSION_RATIO' | 'INSUFFICIENT_POINTS' | 'ZERO_BALANCE_CREDIT'
    }

const POINT_DECIMAL_PLACES = 4
const MONEY_DECIMAL_PLACES = 2

function roundTo(value: number, decimalPlaces: number): number {
    if (!Number.isFinite(value)) return 0
    const scale = 10 ** decimalPlaces
    return Math.round(value * scale) / scale
}

export function roundPoints(value: number): number {
    return roundTo(value, POINT_DECIMAL_PLACES)
}

export function roundMoney(value: number): number {
    return roundTo(value, MONEY_DECIMAL_PLACES)
}

export function calculateSpendPoints(input: SpendPointCalculationInput): SpendPointCalculation {
    const amountUsd = Math.max(0, input.amountUsd)
    const pointsPerThousand = Math.max(0, input.pointsPerThousand)

    return {
        points: roundPoints((amountUsd / 1000) * pointsPerThousand),
        amountUsdSnapshot: amountUsd,
        ratePerThousandSnapshot: pointsPerThousand,
    }
}

export function resolveOwnerRate(input: {
    defaultRate: number
    overrideRate: number | null | undefined
}): number {
    if (input.overrideRate !== null && input.overrideRate !== undefined) {
        return Math.max(0, input.overrideRate)
    }

    return Math.max(0, input.defaultRate)
}

export function validatePointProgramSettings(
    input: PointProgramSettingsInput
): PointProgramSettingsValidation {
    if (!input.pointsEnabled) return { ok: false, reason: 'DISABLED' }
    if (!input.pointsStartAt) return { ok: false, reason: 'MISSING_START_DATE' }
    if (
        !Number.isFinite(input.cashConversionPoints)
        || input.cashConversionPoints <= 0
        || !Number.isFinite(input.cashConversionAmountUsd)
        || input.cashConversionAmountUsd <= 0
    ) {
        return { ok: false, reason: 'INVALID_CONVERSION_RATIO' }
    }

    return { ok: true }
}

export function calculateCashConversion(input: CashConversionInput): CashConversionResult {
    if (!Number.isFinite(input.pointsToConvert) || input.pointsToConvert <= 0) {
        return { ok: false, reason: 'INVALID_POINTS' }
    }

    if (
        !Number.isFinite(input.conversionPoints)
        || input.conversionPoints <= 0
        || !Number.isFinite(input.conversionAmountUsd)
        || input.conversionAmountUsd <= 0
    ) {
        return { ok: false, reason: 'INVALID_CONVERSION_RATIO' }
    }

    if (input.pointsToConvert > input.availablePoints) {
        return { ok: false, reason: 'INSUFFICIENT_POINTS' }
    }

    const balanceAmountUsd = roundMoney(
        (input.pointsToConvert / input.conversionPoints) * input.conversionAmountUsd
    )

    if (balanceAmountUsd <= 0) {
        return { ok: false, reason: 'ZERO_BALANCE_CREDIT' }
    }

    return {
        ok: true,
        pointsConverted: input.pointsToConvert,
        balanceAmountUsd,
    }
}
