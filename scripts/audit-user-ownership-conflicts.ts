import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { parseUserOwnershipConflictAuditArgs } from '../shared/db/user-ownership-conflict-audit'

type CountRow = { count: number }
type ManagerConflictRow = { userId: string; managerLinkCount: number }
type AgentConflictRow = { userId: string; activeAgentAssignmentCount: number }
type CrossOwnerConflictRow = {
    userId: string
    managerLinkCount: number
    activeAgentAssignmentCount: number
}
type OwnershipCoverageRow = {
    legacyAdminFallbackCount: number
    legacyAdminFallbackSamples: Array<{ userId: string }>
    unownedCount: number
    unownedSamples: Array<{ userId: string }>
    noClearOwnerCount: number
    noClearOwnerSamples: Array<{ userId: string }>
}

async function main() {
    const parsed = parseUserOwnershipConflictAuditArgs(process.argv.slice(2))
    if (!parsed.ok) throw new Error(parsed.code)
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED')

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

    try {
        const [
            duplicateManagerCount,
            duplicateManagerSamples,
            duplicateActiveAgentCount,
            duplicateActiveAgentSamples,
            crossOwnerCount,
            crossOwnerSamples,
            ownershipCoverage,
        ] = await Promise.all([
            prisma.$queryRaw<CountRow[]>`
                SELECT COUNT(*)::int AS count
                FROM (
                    SELECT user_id
                    FROM manager_users
                    GROUP BY user_id
                    HAVING COUNT(*) > 1
                ) conflicts
            `,
            prisma.$queryRaw<ManagerConflictRow[]>`
                SELECT user_id AS "userId", COUNT(*)::int AS "managerLinkCount"
                FROM manager_users
                GROUP BY user_id
                HAVING COUNT(*) > 1
                ORDER BY user_id
                LIMIT ${parsed.limit}
            `,
            prisma.$queryRaw<CountRow[]>`
                SELECT COUNT(*)::int AS count
                FROM (
                    SELECT user_id
                    FROM agent_assignments
                    WHERE is_active = TRUE
                    GROUP BY user_id
                    HAVING COUNT(*) > 1
                ) conflicts
            `,
            prisma.$queryRaw<AgentConflictRow[]>`
                SELECT user_id AS "userId", COUNT(*)::int AS "activeAgentAssignmentCount"
                FROM agent_assignments
                WHERE is_active = TRUE
                GROUP BY user_id
                HAVING COUNT(*) > 1
                ORDER BY user_id
                LIMIT ${parsed.limit}
            `,
            prisma.$queryRaw<CountRow[]>`
                SELECT COUNT(*)::int AS count
                FROM (
                    SELECT mu.user_id
                    FROM manager_users mu
                    INNER JOIN agent_assignments aa
                        ON aa.user_id = mu.user_id
                        AND aa.is_active = TRUE
                    GROUP BY mu.user_id
                ) conflicts
            `,
            prisma.$queryRaw<CrossOwnerConflictRow[]>`
                SELECT
                    mu.user_id AS "userId",
                    COUNT(DISTINCT mu.id)::int AS "managerLinkCount",
                    COUNT(DISTINCT aa.id)::int AS "activeAgentAssignmentCount"
                FROM manager_users mu
                INNER JOIN agent_assignments aa
                    ON aa.user_id = mu.user_id
                    AND aa.is_active = TRUE
                GROUP BY mu.user_id
                ORDER BY mu.user_id
                LIMIT ${parsed.limit}
            `,
            prisma.$queryRaw<OwnershipCoverageRow[]>`
                WITH ownership_evidence AS (
                    SELECT
                        u.id,
                        COUNT(DISTINCT mu.id)::int AS manager_link_count,
                        COUNT(DISTINCT aa.id)::int AS active_agent_assignment_count,
                        COUNT(DISTINCT mu.id) FILTER (
                            WHERE manager_owner.role IN ('ADMIN', 'MANAGER')
                                AND manager_owner.is_active = TRUE
                                AND manager_owner.deleted_at IS NULL
                        )::int AS valid_manager_link_count,
                        COUNT(DISTINCT aa.id) FILTER (
                            WHERE agent_owner.role = 'AGENT'
                                AND agent_owner.is_active = TRUE
                                AND agent_owner.deleted_at IS NULL
                        )::int AS valid_agent_assignment_count,
                        COALESCE(
                            creator.role = 'ADMIN'
                                AND creator.is_active = TRUE
                                AND creator.deleted_at IS NULL,
                            FALSE
                        ) AS valid_legacy_admin_creator
                    FROM users u
                    LEFT JOIN users creator ON creator.id = u.created_by_id
                    LEFT JOIN manager_users mu ON mu.user_id = u.id
                    LEFT JOIN users manager_owner ON manager_owner.id = mu.manager_id
                    LEFT JOIN agent_assignments aa
                        ON aa.user_id = u.id
                        AND aa.is_active = TRUE
                    LEFT JOIN users agent_owner ON agent_owner.id = aa.agent_id
                    WHERE u.role = 'USER' AND u.deleted_at IS NULL
                    GROUP BY
                        u.id,
                        creator.role,
                        creator.is_active,
                        creator.deleted_at
                ), classified AS (
                    SELECT
                        id,
                        manager_link_count = 0
                            AND active_agent_assignment_count = 0
                            AND valid_legacy_admin_creator AS is_legacy_admin_fallback,
                        manager_link_count = 0
                            AND active_agent_assignment_count = 0
                            AND NOT valid_legacy_admin_creator AS is_unowned,
                        NOT (
                            manager_link_count + active_agent_assignment_count = 1
                            AND valid_manager_link_count + valid_agent_assignment_count = 1
                        ) AND NOT (
                            manager_link_count = 0
                            AND active_agent_assignment_count = 0
                            AND valid_legacy_admin_creator
                        ) AS has_no_clear_owner
                    FROM ownership_evidence
                )
                SELECT
                    (SELECT COUNT(*)::int FROM classified
                        WHERE is_legacy_admin_fallback) AS "legacyAdminFallbackCount",
                    COALESCE((
                        SELECT JSONB_AGG(JSONB_BUILD_OBJECT('userId', samples.id) ORDER BY samples.id)
                        FROM (
                            SELECT id FROM classified
                            WHERE is_legacy_admin_fallback
                            ORDER BY id
                            LIMIT ${parsed.limit}
                        ) samples
                    ), '[]'::jsonb) AS "legacyAdminFallbackSamples",
                    (SELECT COUNT(*)::int FROM classified
                        WHERE is_unowned) AS "unownedCount",
                    COALESCE((
                        SELECT JSONB_AGG(JSONB_BUILD_OBJECT('userId', samples.id) ORDER BY samples.id)
                        FROM (
                            SELECT id FROM classified
                            WHERE is_unowned
                            ORDER BY id
                            LIMIT ${parsed.limit}
                        ) samples
                    ), '[]'::jsonb) AS "unownedSamples",
                    (SELECT COUNT(*)::int FROM classified
                        WHERE has_no_clear_owner) AS "noClearOwnerCount",
                    COALESCE((
                        SELECT JSONB_AGG(JSONB_BUILD_OBJECT('userId', samples.id) ORDER BY samples.id)
                        FROM (
                            SELECT id FROM classified
                            WHERE has_no_clear_owner
                            ORDER BY id
                            LIMIT ${parsed.limit}
                        ) samples
                    ), '[]'::jsonb) AS "noClearOwnerSamples"
            `,
        ])
        const coverage = ownershipCoverage[0]

        console.log(JSON.stringify({
            readOnly: true,
            duplicateManagerLinks: {
                count: duplicateManagerCount[0]?.count ?? 0,
                samples: duplicateManagerSamples,
            },
            duplicateActiveAgentAssignments: {
                count: duplicateActiveAgentCount[0]?.count ?? 0,
                samples: duplicateActiveAgentSamples,
            },
            simultaneousManagerAndAgentOwnership: {
                count: crossOwnerCount[0]?.count ?? 0,
                samples: crossOwnerSamples,
            },
            legacyAdminFallbackUsers: {
                count: coverage?.legacyAdminFallbackCount ?? 0,
                samples: coverage?.legacyAdminFallbackSamples ?? [],
            },
            unownedUsers: {
                count: coverage?.unownedCount ?? 0,
                samples: coverage?.unownedSamples ?? [],
            },
            usersWithoutClearOwner: {
                count: coverage?.noClearOwnerCount ?? 0,
                samples: coverage?.noClearOwnerSamples ?? [],
            },
            sampleLimit: parsed.limit,
        }))
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
