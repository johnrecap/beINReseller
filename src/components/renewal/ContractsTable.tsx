'use client'

import { Badge } from '@/components/ui/badge'
import { FileText, Calendar, Receipt, Package, CheckCircle, XCircle, Clock } from 'lucide-react'

interface Contract {
    type: string
    status: string
    package: string
    startDate: string
    expiryDate: string
    invoiceNo: string
}

interface ContractsTableProps {
    contracts: Contract[]
}

/**
 * ContractsTable - Displays subscription/package history
 * Responsive design for desktop and mobile
 */
export function ContractsTable({ contracts }: ContractsTableProps) {

    if (!contracts || contracts.length === 0) {
        return null
    }

    const getStatusBadge = (status: string) => {
        const statusLower = status.toLowerCase()
        if (statusLower.includes('active')) {
            return (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 whitespace-nowrap">
                    <CheckCircle className="w-3 h-3 me-1" />
                    نشط
                </Badge>
            )
        } else if (statusLower.includes('cancel')) {
            return (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 whitespace-nowrap">
                    <XCircle className="w-3 h-3 me-1" />
                    ملغي
                </Badge>
            )
        } else if (statusLower.includes('expir')) {
            return (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 whitespace-nowrap">
                    <Clock className="w-3 h-3 me-1" />
                    منتهي
                </Badge>
            )
        }
        return <Badge variant="outline">{status}</Badge>
    }

    const getTypeIcon = (type: string) => {
        const typeLower = type.toLowerCase()
        if (typeLower.includes('package')) {
            return <Package className="w-4 h-4 text-purple-400 shrink-0" />
        } else if (typeLower.includes('addon') || typeLower.includes('event')) {
            return <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
        } else if (typeLower.includes('purchase') || typeLower.includes('installment')) {
            return <Receipt className="w-4 h-4 text-green-400 shrink-0" />
        }
        return <FileText className="w-4 h-4 text-gray-400 shrink-0" />
    }

    return (
        <div className="mt-6 bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gray-800/80 border-b border-gray-700">
                <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-400" />
                    العقود والاشتراكات
                    <span className="text-sm text-gray-500">({contracts.length})</span>
                </h3>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                    <thead className="bg-gray-800/60">
                        <tr className="text-gray-400 text-xs">
                            <th className="px-3 py-3 text-start w-[100px]">النوع</th>
                            <th className="px-3 py-3 text-start w-[80px]">الحالة</th>
                            <th className="px-3 py-3 text-start">الباقة</th>
                            <th className="px-3 py-3 text-center w-[90px]">البداية</th>
                            <th className="px-3 py-3 text-center w-[90px]">الانتهاء</th>
                            <th className="px-3 py-3 text-center w-[80px]">الفاتورة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                        {contracts.map((contract, index) => (
                            <tr
                                key={index}
                                className="hover:bg-gray-700/30 transition-colors"
                            >
                                <td className="px-3 py-3">
                                    <div className="flex items-center gap-1.5 text-gray-300">
                                        {getTypeIcon(contract.type)}
                                        <span className="text-xs">{contract.type}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    {getStatusBadge(contract.status)}
                                </td>
                                <td className="px-3 py-3">
                                    <span className="text-gray-100 text-base font-semibold block">
                                        {contract.package}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                    <span className="text-gray-400 text-xs font-mono">
                                        {contract.startDate}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                    <span className="text-gray-400 text-xs font-mono">
                                        {contract.expiryDate}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                    <span className="text-gray-500 text-xs font-mono">
                                        {contract.invoiceNo}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-700/50 max-h-[400px] overflow-y-auto">
                {contracts.map((contract, index) => (
                    <div
                        key={index}
                        className="p-4 hover:bg-gray-700/30 transition-colors space-y-3"
                    >
                        {/* Row 1: Type & Status */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-gray-300">
                                {getTypeIcon(contract.type)}
                                <span className="text-sm font-medium">{contract.type}</span>
                            </div>
                            {getStatusBadge(contract.status)}
                        </div>

                        {/* Row 2: Package Name - Full Width */}
                        <div className="bg-gray-700/40 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-500 mb-1">الباقة</p>
                            <p className="text-gray-200 text-sm font-medium">
                                {contract.package}
                            </p>
                        </div>

                        {/* Row 3: Dates & Invoice */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-gray-700/30 rounded-lg p-2">
                                <p className="text-xs text-gray-500 mb-1">البداية</p>
                                <p className="text-gray-400 text-xs font-mono">{contract.startDate}</p>
                            </div>
                            <div className="bg-gray-700/30 rounded-lg p-2">
                                <p className="text-xs text-gray-500 mb-1">الانتهاء</p>
                                <p className="text-gray-400 text-xs font-mono">{contract.expiryDate}</p>
                            </div>
                            <div className="bg-gray-700/30 rounded-lg p-2">
                                <p className="text-xs text-gray-500 mb-1">الفاتورة</p>
                                <p className="text-gray-500 text-xs font-mono">{contract.invoiceNo}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default ContractsTable
