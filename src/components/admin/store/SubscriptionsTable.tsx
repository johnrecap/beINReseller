'use client'

/**
 * Subscriptions Table Component
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Search, CreditCard, Eye } from 'lucide-react'
import { format } from 'date-fns'

interface Subscription {
    id: string
    cardNumber: string
    status: string
    currency: string
    price: number
    packageName: string | null
    packagePrice: number | null
    markupPercent: number
    creditUsed: number
    resultMessage: string | null
    createdAt: Date
    completedAt: Date | null
    failedAt: Date | null
    customer: {
        id: string
        name: string
        email: string
        phone: string | null
    }
    operation: {
        id: string
        status: string
    } | null
    payment: {
        id: string
        status: string
        amount: number
    } | null
}

interface SubscriptionsTableProps {
    subscriptions: Subscription[]
}

const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    AWAITING_PACKAGE: 'bg-blue-100 text-blue-800',
    AWAITING_PAYMENT: 'bg-orange-100 text-orange-800',
    PAID: 'bg-indigo-100 text-indigo-800',
    PROCESSING: 'bg-purple-100 text-purple-800',
    AWAITING_CAPTCHA: 'bg-pink-100 text-pink-800',
    COMPLETING: 'bg-cyan-100 text-cyan-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    REFUNDED: 'bg-gray-100 text-gray-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
}

export function SubscriptionsTable({ subscriptions: initialSubscriptions }: SubscriptionsTableProps) {
    const [subscriptions] = useState(initialSubscriptions)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedSub, setSelectedSub] = useState<Subscription | null>(null)

    const filteredSubs = subscriptions.filter(sub => {
        const matchesSearch =
            sub.cardNumber.includes(search) ||
            sub.customer.name.toLowerCase().includes(search.toLowerCase()) ||
            sub.customer.email.toLowerCase().includes(search.toLowerCase())

        const matchesStatus = !statusFilter || sub.status === statusFilter

        return matchesSearch && matchesStatus
    })

    const statuses = [
        'PENDING', 'AWAITING_PACKAGE', 'AWAITING_PAYMENT', 'PAID',
        'PROCESSING', 'AWAITING_CAPTCHA', 'COMPLETING', 'COMPLETED',
        'FAILED', 'REFUNDED', 'CANCELLED'
    ]

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Subscriptions ({filteredSubs.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by card #, customer..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border rounded-md bg-background"
                        >
                            <option value="">All Statuses</option>
                            {statuses.map(status => (
                                <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Card Number</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Package</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSubs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            No subscriptions found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredSubs.map((sub) => (
                                        <TableRow key={sub.id}>
                                            <TableCell className="font-mono">
                                                {sub.cardNumber}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">{sub.customer.name}</p>
                                                    <p className="text-sm text-muted-foreground">{sub.customer.email}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {sub.packageName || '-'}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {sub.currency} {sub.price.toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={statusColors[sub.status]}>
                                                    {sub.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {format(new Date(sub.createdAt), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedSub(sub)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Subscription Details Dialog */}
            <Dialog open={!!selectedSub} onOpenChange={() => setSelectedSub(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Subscription Details</DialogTitle>
                    </DialogHeader>
                    {selectedSub && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="text-sm text-muted-foreground">Card Number</h4>
                                    <p className="font-mono">{selectedSub.cardNumber}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm text-muted-foreground">Status</h4>
                                    <Badge className={statusColors[selectedSub.status]}>
                                        {selectedSub.status.replace(/_/g, ' ')}
                                    </Badge>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm text-muted-foreground">Customer</h4>
                                <p className="font-medium">{selectedSub.customer.name}</p>
                                <p className="text-sm">{selectedSub.customer.email}</p>
                            </div>

                            {selectedSub.packageName && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="text-sm text-muted-foreground">Package</h4>
                                        <p>{selectedSub.packageName}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm text-muted-foreground">Original Price</h4>
                                        <p>{selectedSub.currency} {selectedSub.packagePrice?.toFixed(2)}</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <h4 className="text-sm text-muted-foreground">Markup</h4>
                                    <p>{selectedSub.markupPercent}%</p>
                                </div>
                                <div>
                                    <h4 className="text-sm text-muted-foreground">Credit Used</h4>
                                    <p>{selectedSub.currency} {selectedSub.creditUsed.toFixed(2)}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm text-muted-foreground">Final Price</h4>
                                    <p className="font-bold">{selectedSub.currency} {selectedSub.price.toFixed(2)}</p>
                                </div>
                            </div>

                            {selectedSub.resultMessage && (
                                <div>
                                    <h4 className="text-sm text-muted-foreground">Result</h4>
                                    <p className="text-sm p-2 bg-muted rounded">{selectedSub.resultMessage}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Created: </span>
                                    {format(new Date(selectedSub.createdAt), 'MMM d, yyyy HH:mm')}
                                </div>
                                {selectedSub.completedAt && (
                                    <div>
                                        <span className="text-muted-foreground">Completed: </span>
                                        {format(new Date(selectedSub.completedAt), 'MMM d, yyyy HH:mm')}
                                    </div>
                                )}
                                {selectedSub.failedAt && (
                                    <div>
                                        <span className="text-muted-foreground">Failed: </span>
                                        {format(new Date(selectedSub.failedAt), 'MMM d, yyyy HH:mm')}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
