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
 */
export function ContractsTable({ contracts }: ContractsTableProps) {

    if (!contracts || contracts.length === 0) {
        return null
    }

    const getStatusBadge = (status: string) => {
        const statusLower = status.toLowerCase()
        if (statusLower.includes('active')) {
            return (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <CheckCircle className="w-3 h-3 me-1" />
                    نشط
                </Badge>
            )
        } else if (statusLower.includes('cancel')) {
            return (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    <XCircle className="w-3 h-3 me-1" />
                    ملغي
                </Badge>
            )
        } else if (statusLower.includes('expir')) {
            return (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
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
            return <Package className="w-4 h-4 text-purple-400" />
        } else if (typeLower.includes('addon') || typeLower.includes('event')) {
            return <Calendar className="w-4 h-4 text-blue-400" />
        } else if (typeLower.includes('purchase') || typeLower.includes('installment')) {
            return <Receipt className="w-4 h-4 text-green-400" />
        }
        return <FileText className="w-4 h-4 text-gray-400" />
    }

    return (
        <div className="mt-6 bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gray-800/80 border-b border-gray-700">
                <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    العقود والاشتراكات
                    <span className="text-xs text-gray-500">({contracts.length})</span>
                </h3>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-800/60">
                        <tr className="text-gray-400 text-xs">
                            <th className="px-4 py-3 text-start">النوع</th>
                            <th className="px-4 py-3 text-start">الحالة</th>
                            <th className="px-4 py-3 text-start">الباقة</th>
                            <th className="px-4 py-3 text-center">تاريخ البداية</th>
                            <th className="px-4 py-3 text-center">تاريخ الانتهاء</th>
                            <th className="px-4 py-3 text-center">رقم الفاتورة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                        {contracts.map((contract, index) => (
                            <tr
                                key={index}
                                className="hover:bg-gray-700/30 transition-colors"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 text-gray-300">
                                        {getTypeIcon(contract.type)}
                                        <span className="text-xs">{contract.type}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    {getStatusBadge(contract.status)}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-gray-200 text-xs font-medium line-clamp-1" title={contract.package}>
                                        {contract.package}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="text-gray-400 text-xs font-mono">
                                        {contract.startDate}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="text-gray-400 text-xs font-mono">
                                        {contract.expiryDate}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="text-gray-500 text-xs font-mono">
                                        {contract.invoiceNo}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default ContractsTable
