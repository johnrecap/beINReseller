type BeinDealerBalanceAccount = {
    dealerBalance?: number | null
}

export function sumBeinDealerBalances(accounts: BeinDealerBalanceAccount[]) {
    return accounts.reduce((totalBalance, account) => {
        if (typeof account.dealerBalance !== 'number' || !Number.isFinite(account.dealerBalance)) {
            return totalBalance
        }

        return totalBalance + account.dealerBalance
    }, 0)
}

export function formatBeinDealerBalanceUsd(balance: number) {
    const finiteBalance = Number.isFinite(balance) ? balance : 0
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(finiteBalance)} USD`
}
