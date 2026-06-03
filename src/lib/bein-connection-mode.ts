export const BEIN_CONNECTION_MODE_ASSIGNED_PROXY = 'assigned_proxy'
export const BEIN_CONNECTION_MODE_SERVER_IP = 'server_ip'

export const BEIN_CONNECTION_MODE_SETTING_KEY = 'bein_connection_mode'
export const DEFAULT_BEIN_CONNECTION_MODE = BEIN_CONNECTION_MODE_ASSIGNED_PROXY

export type BeinConnectionMode =
    | typeof BEIN_CONNECTION_MODE_ASSIGNED_PROXY
    | typeof BEIN_CONNECTION_MODE_SERVER_IP

export function normalizeBeinConnectionMode(value: unknown): BeinConnectionMode {
    return value === BEIN_CONNECTION_MODE_SERVER_IP || value === BEIN_CONNECTION_MODE_ASSIGNED_PROXY
        ? value
        : DEFAULT_BEIN_CONNECTION_MODE
}

export function validateBeinConnectionMode(value: unknown): { value: BeinConnectionMode } | { error: string } {
    if (value === BEIN_CONNECTION_MODE_ASSIGNED_PROXY || value === BEIN_CONNECTION_MODE_SERVER_IP) {
        return { value }
    }

    return {
        error: 'beIN connection mode must be assigned_proxy or server_ip',
    }
}

export function normalizeBeinConnectionSettingsForAdmin(
    settings: Record<string, string>
): Record<string, string> {
    return {
        ...settings,
        [BEIN_CONNECTION_MODE_SETTING_KEY]: normalizeBeinConnectionMode(
            settings[BEIN_CONNECTION_MODE_SETTING_KEY]
        ),
    }
}
