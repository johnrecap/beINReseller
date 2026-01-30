'use client'

/**
 * Customers Table Component
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
import { Search, UserCircle, Eye, Mail, Phone, MapPin, DollarSign } from 'lucide-react'
import { format } from 'date-fns'

interface Customer {
    id: string
    email: string
    phone: string | null
    name: string
    nameAr: string | null
    isVerified: boolean
    isActive: boolean
    preferredLang: string
    country: string
    storeCredit: number
    createdAt: Date
    lastLoginAt: Date | null
    _count: {
        orders: number
        subscriptions: number
    }
}

interface CustomersTableProps {
    customers: Customer[]
}

export function CustomersTable({ customers: initialCustomers }: CustomersTableProps) {
    const [customers] = useState(initialCustomers)
    const [search, setSearch] = useState('')
    const [countryFilter, setCountryFilter] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

    const filteredCustomers = customers.filter(customer => {
        const matchesSearch = 
            customer.name.toLowerCase().includes(search.toLowerCase()) ||
            customer.email.toLowerCase().includes(search.toLowerCase()) ||
            customer.phone?.includes(search)
        
        const matchesCountry = !countryFilter || customer.country === countryFilter

        return matchesSearch && matchesCountry
    })

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <UserCircle className="h-5 w-5" />
                        Customers ({filteredCustomers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email, phone..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <select
                            value={countryFilter}
                            onChange={(e) => setCountryFilter(e.target.value)}
                            className="px-3 py-2 border rounded-md bg-background"
                        >
                            <option value="">All Countries</option>
                            <option value="SA">Saudi Arabia</option>
                            <option value="EG">Egypt</option>
                        </select>
                    </div>

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Country</TableHead>
                                    <TableHead>Orders</TableHead>
                                    <TableHead>Subscriptions</TableHead>
                                    <TableHead>Store Credit</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Joined</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCustomers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            No customers found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredCustomers.map((customer) => (
                                        <TableRow key={customer.id}>
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">{customer.name}</p>
                                                    <p className="text-sm text-muted-foreground">{customer.email}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {customer.country === 'SA' ? '🇸🇦 SA' : '🇪🇬 EG'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{customer._count.orders}</TableCell>
                                            <TableCell>{customer._count.subscriptions}</TableCell>
                                            <TableCell>
                                                {customer.storeCredit > 0 ? (
                                                    <Badge variant="success">
                                                        ${customer.storeCredit.toFixed(2)}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">$0.00</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Badge variant={customer.isActive ? 'success' : 'destructive'}>
                                                        {customer.isActive ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                    {customer.isVerified && (
                                                        <Badge variant="outline">Verified</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {format(new Date(customer.createdAt), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedCustomer(customer)}
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

            {/* Customer Details Dialog */}
            <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Customer Details</DialogTitle>
                    </DialogHeader>
                    {selectedCustomer && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                    <UserCircle className="h-8 w-8 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">{selectedCustomer.name}</h3>
                                    {selectedCustomer.nameAr && (
                                        <p className="text-muted-foreground" dir="rtl">{selectedCustomer.nameAr}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span>{selectedCustomer.email}</span>
                                </div>
                                {selectedCustomer.phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        <span>{selectedCustomer.phone}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <span>{selectedCustomer.country === 'SA' ? 'Saudi Arabia' : 'Egypt'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    <span>Credit: ${selectedCustomer.storeCredit.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                                <div className="text-center">
                                    <p className="text-2xl font-bold">{selectedCustomer._count.orders}</p>
                                    <p className="text-sm text-muted-foreground">Orders</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold">{selectedCustomer._count.subscriptions}</p>
                                    <p className="text-sm text-muted-foreground">Subscriptions</p>
                                </div>
                            </div>

                            <div className="text-sm text-muted-foreground">
                                <p>Joined: {format(new Date(selectedCustomer.createdAt), 'MMMM d, yyyy')}</p>
                                {selectedCustomer.lastLoginAt && (
                                    <p>Last login: {format(new Date(selectedCustomer.lastLoginAt), 'MMMM d, yyyy HH:mm')}</p>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
