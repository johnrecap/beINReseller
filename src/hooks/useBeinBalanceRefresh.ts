'use client'

import { usePanelCommandOwner } from '@/components/providers/PanelCommandProvider'
import { useOwnedPanelCommand } from './usePanelRequest'

export function useBeinBalanceRefresh() {
    const owner = usePanelCommandOwner()
    const { receipts } = useOwnedPanelCommand()
    return {
        receipts: receipts.filter(receipt => receipt.action === 'bein.balance.refresh'),
        observation: (accountId: string) => owner?.balance.get('current')?.observation(accountId),
        start: async (accountId: string, label: string) => {
            const tracker = owner?.balance.get('current')
            if (!owner || !tracker) throw new Error('COMMAND_STORAGE_UNAVAILABLE')
            const attempt = crypto.randomUUID()
            owner.labels.set(attempt, label)
            try { await tracker.start(accountId, attempt) }
            catch (error) {
                if (!owner.runner.state.snapshot().some(receipt => receipt.attempt === attempt)) owner.labels.delete(attempt)
                throw error
            }
        },
    }
}
