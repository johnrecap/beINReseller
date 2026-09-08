export function panelListQuery<K extends string>(params: URLSearchParams, keys: readonly K[]) {
    const page = Number(params.get('page') ?? 1)
    const limit = Number(params.get('limit') ?? 10)
    const sortBy = params.get('sortBy') ?? 'createdAt'
    const sortOrder = params.get('sortOrder') ?? 'desc'
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
        || (page - 1) * limit > 2_147_483_647
        || !keys.includes(sortBy as K) || !['asc', 'desc'].includes(sortOrder)) return null
    return { page, limit, sortBy: sortBy as K, sortOrder: sortOrder as 'asc' | 'desc' }
}
