export const POINTS_SETTINGS_COPY = {
    programEnabled:
        'When disabled, no spend-based operation points are awarded.',
    managerOwnedUserToggle:
        'Controls whether users under managers receive their own user points in addition to manager points.',
    normalUserRate:
        'Applies to agent-owned users and direct admin-owned users.',
    managerOwnedUserRate:
        'Used only for users under managers when manager-owned user points are enabled.',
    agentRate:
        'Agents can also use per-agent overrides below.',
    managerRate:
        'Managers can also use per-manager overrides below.',
} as const
