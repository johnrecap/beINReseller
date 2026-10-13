import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireRoleAPIWithMobile } from '@/lib/auth-utils'

export async function GET(request: NextRequest) {
    const auth = await requireRoleAPIWithMobile(request, 'ADMIN')
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    try {
        const query = new URL(request.url).searchParams
        const releaseId = query.get('releaseId')
        if (releaseId) {
            // GET is strictly read-only. Maintenance resumes incomplete requests.
            const release = await prisma.cardAdministrativeRelease.findUnique({ where: { id: releaseId },
                select: { id: true, state: true, lastError: true, completedAt: true,
                    operations: { orderBy: { id: 'asc' }, select: { id: true } } } })
            return NextResponse.json(release ? { id: release.id, state: release.state, lastError: release.lastError,
                completedAt: release.completedAt, operationIds: release.operations.map(operation => operation.id) }
                : { error: 'CARD_RELEASE_NOT_FOUND' }, { status: release ? 200 : 404 })
        }
        return NextResponse.json({ error: 'CARD_RELEASE_NOT_FOUND' }, { status: 404 })
    } catch {
        return NextResponse.json({ error: 'CARD_RELEASE_READ_FAILED' }, { status: 500 })
    }
}
