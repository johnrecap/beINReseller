export const DEFAULT_MAINTENANCE_MESSAGE = 'System under maintenance, please try again later'

export interface RawMaintenanceSettings {
    maintenanceMode?: unknown
    maintenanceMessage?: unknown
    maintenancePauseUntil?: unknown
}

export interface EffectiveMaintenanceStatus {
    maintenanceMode: boolean
    blocksUsers: boolean
    message: string
    pauseUntil: string | null
    expiredTimedMaintenance: boolean
    manualMaintenance: boolean
}

function isTrueValue(value: unknown): boolean {
    return value === true || value === 'true'
}

function normalizeMessage(value: unknown): string {
    return typeof value === 'string' && value.trim().length > 0
        ? value
        : DEFAULT_MAINTENANCE_MESSAGE
}

function parsePauseUntil(value: unknown): { iso: string; time: number } | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null
    }

    const time = new Date(value).getTime()
    if (!Number.isFinite(time)) {
        return null
    }

    return { iso: value, time }
}

export function computeEffectiveMaintenanceStatus(
    settings: RawMaintenanceSettings,
    now: Date = new Date()
): EffectiveMaintenanceStatus {
    const savedMode = isTrueValue(settings.maintenanceMode)
    const message = normalizeMessage(settings.maintenanceMessage)
    const parsedPause = parsePauseUntil(settings.maintenancePauseUntil)

    if (!savedMode) {
        return {
            maintenanceMode: false,
            blocksUsers: false,
            message,
            pauseUntil: parsedPause?.iso ?? null,
            expiredTimedMaintenance: false,
            manualMaintenance: false,
        }
    }

    if (!parsedPause) {
        return {
            maintenanceMode: true,
            blocksUsers: true,
            message,
            pauseUntil: null,
            expiredTimedMaintenance: false,
            manualMaintenance: true,
        }
    }

    if (parsedPause.time <= now.getTime()) {
        return {
            maintenanceMode: false,
            blocksUsers: false,
            message,
            pauseUntil: parsedPause.iso,
            expiredTimedMaintenance: true,
            manualMaintenance: false,
        }
    }

    return {
        maintenanceMode: true,
        blocksUsers: true,
        message,
        pauseUntil: parsedPause.iso,
        expiredTimedMaintenance: false,
        manualMaintenance: false,
    }
}

export function normalizeMaintenanceSettingsForAdmin(
    settings: Record<string, string>,
    now: Date = new Date()
): Record<string, string> {
    const effective = computeEffectiveMaintenanceStatus({
        maintenanceMode: settings.maintenance_mode,
        maintenanceMessage: settings.maintenance_message,
        maintenancePauseUntil: settings.maintenance_pause_until,
    }, now)

    if (!effective.expiredTimedMaintenance) {
        return settings
    }

    return {
        ...settings,
        maintenance_mode: 'false',
        maintenance_pause_until: '',
    }
}

function normalizeDurationUnit(value: unknown): 'hours' | 'days' {
    return value === 'days' ? 'days' : 'hours'
}

function durationToMs(value: unknown, unit: unknown): number | null {
    const duration = Number(value)
    if (!Number.isFinite(duration) || duration <= 0) {
        return null
    }

    const multiplier = normalizeDurationUnit(unit) === 'days'
        ? 24 * 60 * 60 * 1000
        : 60 * 60 * 1000

    return duration * multiplier
}

export function normalizeMaintenanceSettingsUpdate(
    body: Record<string, unknown>,
    now: Date = new Date()
): Record<string, unknown> {
    const normalizedBody = { ...body }

    if (!('maintenance_mode' in normalizedBody)) {
        return normalizedBody
    }

    if (!isTrueValue(normalizedBody.maintenance_mode)) {
        normalizedBody.maintenance_mode = 'false'
        normalizedBody.maintenance_pause_until = ''
        return normalizedBody
    }

    normalizedBody.maintenance_mode = 'true'
    const durationMs = durationToMs(
        normalizedBody.maintenance_pause_duration_value,
        normalizedBody.maintenance_pause_duration_unit
    )

    normalizedBody.maintenance_pause_until = durationMs
        ? new Date(now.getTime() + durationMs).toISOString()
        : ''

    return normalizedBody
}
