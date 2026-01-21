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
 * Improved layout for better readability of long package names
 */
export function ContractsTable({ contracts }: ContractsTableProps) {

    if (!contracts || contracts.length === 0) {
        return null
    }

    const getStatusBadge = (status: string) => {
        const statusLower = status.toLowerCase()
        if (statusLower.includes('active')) {
            return (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20 whitespace-nowrap">
                    <CheckCircle className="w-3 h-3 me-1.5" />
                    نشط
                </Badge>
            )
        } else if (statusLower.includes('cancel')) {
            return (
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 whitespace-nowrap">
                    <XCircle className="w-3 h-3 me-1.5" />
                    ملغي
                </Badge>
            )
        } else if (statusLower.includes('expir')) {
            return (
                <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20 whitespace-nowrap">
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
        <div className="mt-8 bg-gray-900/40 rounded-xl border border-gray-800 overflow-hidden shadow-sm backdrop-blur-sm">
            {/* Header */}
            <div className="px-5 py-4 bg-gray-900/60 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-100 flex items-center gap-2.5">
                    <div className="p-1.5 bg-purple-500/10 rounded-lg">
                        <FileText className="w-5 h-5 text-purple-400" />
                    </div>
                    العقود والاشتراكات
                </h3>
                <span className="text-xs font-mono bg-gray-800/80 text-gray-400 px-2.5 py-1 rounded-md border border-gray-700/50">
                    {contracts.length}
                </span>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
                {/* 
                    Using min-w-[1000px] ensures the table is wide enough and doesn't squish contents.
                    Removed table-fixed so columns like Package can expand naturally.
                */}
                <table className="w-full text-sm min-w-[1000px]">
                    <thead className="bg-gray-800/40">
                        <tr className="text-gray-400 text-xs border-b border-gray-700/50">
                            {/* Fixed width for metadata columns to keep them compact */}
                            <th className="px-5 py-4 text-start font-medium w-[150px]">النوع</th>
                            <th className="px-5 py-4 text-start font-medium w-[120px]">الحالة</th>
                            {/* Auto width for Package to take remaining space */}
                            <th className="px-5 py-4 text-start font-medium min-w-[400px]">اسم الباقة</th>
                            <th className="px-5 py-4 text-center font-medium w-[130px]">تاريخ البداية</th>
                            <th className="px-5 py-4 text-center font-medium w-[130px]">تاريخ الانتهاء</th>
                            <th className="px-5 py-4 text-center font-medium w-[120px]">الفاتورة</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/40">
                        {contracts.map((contract, index) => (
                            <tr
                                key={index}
                                className="hover:bg-gray-800/40 transition-colors group"
                            >
                                <td className="px-5 py-3 align-middle">
                                    <div className="flex items-center gap-2.5 text-gray-300">
                                        {getTypeIcon(contract.type)}
                                        <span className="text-sm font-medium whitespace-nowrap">{contract.type}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3 align-middle">
                                    {getStatusBadge(contract.status)}
                                </td>
                                <td className="px-5 py-3 align-middle">
                                    {/* Larger, cleaner text for package name */}
                                    <span className="text-gray-100 text-[15px] font-bold block leading-relaxed py-1">
                                        {contract.package}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-center align-middle">
                                    <span className="text-gray-400 text-sm font-mono whitespace-nowrap bg-gray-800/30 px-2 py-1 rounded border border-gray-700/30">
                                        {contract.startDate}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-center align-middle">
                                    <span className="text-gray-400 text-sm font-mono whitespace-nowrap bg-gray-800/30 px-2 py-1 rounded border border-gray-700/30">
                                        {contract.expiryDate}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-center align-middle">
                                    <span className="text-gray-500 text-xs font-mono select-all hover:text-gray-300 transition-colors cursor-pointer">
                                        {contract.invoiceNo}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-800 max-h-[500px] overflow-y-auto">
                {contracts.map((contract, index) => (
                    <div
                        key={index}
                        className="p-4 hover:bg-gray-800/20 transition-colors space-y-4"
                    >
                        {/* Row 1: Type & Status */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-gray-200">
                                {getTypeIcon(contract.type)}
                                <span className="text-sm font-semibold">{contract.type}</span>
                            </div>
                            {getStatusBadge(contract.status)}
                        </div>

                        {/* Row 2: Package Name - Prominent Display */}
                        <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                                <Package className="w-3 h-3" />
                                اسم الباقة
                            </p>
                            <p className="text-gray-100 text-base font-bold leading-relaxed">
                                {contract.package}
                            </p>
                        </div>

                        {/* Row 3: Details Grid */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-gray-800/20 rounded-lg p-2.5 border border-gray-800">
                                <p className="text-[10px] text-gray-500 mb-1">تاريخ البداية</p>
                                <p className="text-gray-300 text-xs font-mono">{contract.startDate}</p>
                            </div>
                            <div className="bg-gray-800/20 rounded-lg p-2.5 border border-gray-800">
                                <p className="text-[10px] text-gray-500 mb-1">تاريخ الانتهاء</p>
                                <p className="text-gray-300 text-xs font-mono">{contract.expiryDate}</p>
                            </div>
                            <div className="bg-gray-800/20 rounded-lg p-2.5 border border-gray-800">
                                <p className="text-[10px] text-gray-500 mb-1">رقم الفاتورة</p>
                                <p className="text-gray-400 text-xs font-mono tracking-wider">{contract.invoiceNo}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default ContractsTable
