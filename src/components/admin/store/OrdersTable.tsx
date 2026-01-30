'use client'

/**
 * Orders Table Component
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
import { Search, ShoppingCart, Eye, Truck } from 'lucide-react'
import { format } from 'date-fns'

interface Order {
    id: string
    orderNumber: string
    status: string
    currency: string
    subtotal: number
    shippingCost: number
    total: number
    trackingNumber: string | null
    createdAt: Date
    paidAt: Date | null
    shippedAt: Date | null
    shippingCity: string
    shippingCountry: string
    customer: {
        id: string
        name: string
        email: string
        phone: string | null
    }
    items: Array<{
        id: string
        name: string
        quantity: number
        price: number
    }>
    payment: {
        id: string
        status: string
    } | null
}

interface OrdersTableProps {
    orders: Order[]
}

const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PAID: 'bg-blue-100 text-blue-800',
    PROCESSING: 'bg-purple-100 text-purple-800',
    SHIPPED: 'bg-indigo-100 text-indigo-800',
    DELIVERED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
    REFUNDED: 'bg-gray-100 text-gray-800',
}

export function OrdersTable({ orders: initialOrders }: OrdersTableProps) {
    const [orders] = useState(initialOrders)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

    const filteredOrders = orders.filter(order => {
        const matchesSearch = 
            order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            order.customer.name.toLowerCase().includes(search.toLowerCase()) ||
            order.customer.email.toLowerCase().includes(search.toLowerCase())
        
        const matchesStatus = !statusFilter || order.status === statusFilter

        return matchesSearch && matchesStatus
    })

    const statuses = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Orders ({filteredOrders.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by order #, customer..."
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
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order #</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead>Total</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            No orders found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOrders.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-mono font-medium">
                                                {order.orderNumber}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">{order.customer.name}</p>
                                                    <p className="text-sm text-muted-foreground">{order.customer.email}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {order.currency} {order.total.toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={statusColors[order.status]}>
                                                    {order.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {format(new Date(order.createdAt), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedOrder(order)}
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

            {/* Order Details Dialog */}
            <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Order {selectedOrder?.orderNumber}</DialogTitle>
                    </DialogHeader>
                    {selectedOrder && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-medium mb-2">Customer</h4>
                                    <p>{selectedOrder.customer.name}</p>
                                    <p className="text-sm text-muted-foreground">{selectedOrder.customer.email}</p>
                                    <p className="text-sm text-muted-foreground">{selectedOrder.customer.phone}</p>
                                </div>
                                <div>
                                    <h4 className="font-medium mb-2">Shipping</h4>
                                    <p>{selectedOrder.shippingCity}, {selectedOrder.shippingCountry}</p>
                                    {selectedOrder.trackingNumber && (
                                        <p className="text-sm flex items-center gap-1 mt-1">
                                            <Truck className="h-3 w-3" />
                                            {selectedOrder.trackingNumber}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h4 className="font-medium mb-2">Items</h4>
                                <div className="space-y-2">
                                    {selectedOrder.items.map(item => (
                                        <div key={item.id} className="flex justify-between p-2 bg-muted/50 rounded">
                                            <span>{item.name} x{item.quantity}</span>
                                            <span>{selectedOrder.currency} {(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span>{selectedOrder.currency} {selectedOrder.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Shipping</span>
                                    <span>{selectedOrder.currency} {selectedOrder.shippingCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold mt-2">
                                    <span>Total</span>
                                    <span>{selectedOrder.currency} {selectedOrder.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
