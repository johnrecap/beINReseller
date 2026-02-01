'use client'

import { useTranslation } from '@/hooks/useTranslation'
import { FileText, Calendar, Receipt, Package, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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
    expiryDate?: string  // Card expiry date for the yellow banner
}

/**
 * ContractsTable - Displays subscription/package history
 * Desktop: beIN Sport portal exact styling (fieldset, purple header, zebra rows)
 * Mobile: Card-based layout (unchanged)
 */
export function ContractsTable({ contracts, expiryDate }: ContractsTableProps) {
    const { t } = useTranslation()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ct = (t as any).contracts || {}

    if (!contracts || contracts.length === 0) {
        return null
    }

    // Mobile helper functions (unchanged)
    const getStatusBadge = (status: string) => {
        const statusLower = status.toLowerCase()
        if (statusLower.includes('active')) {
            return (
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20 whitespace-nowrap">
                    <CheckCircle className="w-3 h-3 me-1.5" />
                    {ct.statusActive || 'Active'}
                </Badge>
            )
        } else if (statusLower.includes('cancel')) {
            return (
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 whitespace-nowrap">
                    <XCircle className="w-3 h-3 me-1.5" />
                    {ct.statusCancelled || 'Cancelled'}
                </Badge>
            )
        } else if (statusLower.includes('expir')) {
            return (
                <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20 whitespace-nowrap">
                    <Clock className="w-3 h-3 me-1" />
                    {ct.statusExpired || 'Expired'}
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
        } else if (typeLower.includes('purchase') || typeLower.includes('installment') || typeLower.includes('payperview')) {
            return <Receipt className="w-4 h-4 text-green-400 shrink-0" />
        }
        return <FileText className="w-4 h-4 text-gray-400 shrink-0" />
    }

    // Get status cell background color (beIN portal style)
    const getStatusCellStyle = (status: string): React.CSSProperties => {
        const statusLower = status.toLowerCase()
        if (statusLower.includes('active')) {
            return { backgroundColor: '#ccffcc' }  // Light green
        } else if (statusLower.includes('cancel')) {
            return { backgroundColor: '#ffcccc' }  // Light pink/red
        } else if (statusLower.includes('expir')) {
            return { backgroundColor: '#ffffcc' }  // Light yellow
        }
        return {}
    }

    return (
        <div className="mt-6">
            {/* ===== DESKTOP: beIN Sport Portal Exact Styling ===== */}
            <div className="hidden md:block">
                {/* Fieldset container - exact beIN portal style */}
                <fieldset style={{
                    border: '1px solid #cccccc',
                    margin: '10px 0',
                    padding: '10px',
                    backgroundColor: '#ffffff',
                    borderRadius: '4px'
                }}>
                    <legend style={{
                        padding: '0 8px',
                        fontWeight: 'bold',
                        color: '#333333',
                        fontSize: '14px'
                    }}>
                        Contracts
                    </legend>

                    {/* Yellow ErrorBox banner - "This Card still Valid..." */}
                    {expiryDate && (
                        <div style={{
                            backgroundColor: '#FFFF99',
                            border: '1px solid #CCCCCC',
                            padding: '8px 12px',
                            color: '#cc0000',
                            fontWeight: 'bold',
                            marginBottom: '12px',
                            fontSize: '13px'
                        }}>
                            This Card still Valid and will be Expired on {expiryDate}
                        </div>
                    )}

                    {/* beIN Grid Table */}
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        border: '1px solid #cccccc',
                        fontSize: '12px',
                        fontFamily: 'Arial, Helvetica, sans-serif'
                    }}>
                        <thead>
                            {/* GridHeader - Purple */}
                            <tr style={{
                                backgroundColor: '#663399',
                                color: '#ffffff',
                                fontWeight: 'bold'
                            }}>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    Type
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    Status
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center'
                                }}>
                                    Package
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    Start Date
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    Expiry Date
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    Invoice No
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {contracts.map((contract, index) => (
                                <tr
                                    key={index}
                                    style={{
                                        // GridRow (white) / GridAlternatingRow (gray)
                                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f5f5f5'
                                    }}
                                >
                                    <td style={{
                                        padding: '6px 10px',
                                        border: '1px solid #cccccc',
                                        textAlign: 'center',
                                        color: '#333333',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {contract.type}
                                    </td>
                                    <td style={{
                                        padding: '6px 10px',
                                        border: '1px solid #cccccc',
                                        textAlign: 'center',
                                        color: '#333333',
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap',
                                        ...getStatusCellStyle(contract.status)
                                    }}>
                                        {contract.status}
                                    </td>
                                    <td style={{
                                        padding: '6px 10px',
                                        border: '1px solid #cccccc',
                                        textAlign: 'center',
                                        color: '#333333'
                                    }}>
                                        {contract.package}
                                    </td>
                                    <td style={{
                                        padding: '6px 10px',
                                        border: '1px solid #cccccc',
                                        textAlign: 'center',
                                        color: '#333333',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {contract.startDate}
                                    </td>
                                    <td style={{
                                        padding: '6px 10px',
                                        border: '1px solid #cccccc',
                                        textAlign: 'center',
                                        color: '#333333',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {contract.expiryDate}
                                    </td>
                                    <td style={{
                                        padding: '6px 10px',
                                        border: '1px solid #cccccc',
                                        textAlign: 'center',
                                        color: '#333333',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {contract.invoiceNo}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </fieldset>
            </div>

            {/* ===== MOBILE: Card-based layout (unchanged) ===== */}
            <div className="md:hidden bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border-default)] overflow-hidden shadow-sm">
                {/* Header */}
                <div className="px-5 py-4 bg-gray-900/60 border-b border-gray-800 flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-100 flex items-center gap-2.5">
                        <div className="p-1.5 bg-purple-500/10 rounded-lg">
                            <FileText className="w-5 h-5 text-purple-400" />
                        </div>
                        {ct.title || 'Contracts & Subscriptions'}
                    </h3>
                    <span className="text-xs font-mono bg-gray-800/80 text-gray-400 px-2.5 py-1 rounded-md border border-gray-700/50">
                        {contracts.length}
                    </span>
                </div>

                {/* Mobile Cards */}
                <div className="divide-y divide-gray-800 max-h-[500px] overflow-y-auto">
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
                                    {ct.packageName || 'Package'}
                                </p>
                                <p className="text-gray-100 text-base font-bold leading-relaxed">
                                    {contract.package}
                                </p>
                            </div>

                            {/* Row 3: Details Grid */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-gray-800/20 rounded-lg p-2.5 border border-gray-800">
                                    <p className="text-[10px] text-gray-500 mb-1">{ct.startDate || 'Start'}</p>
                                    <p className="text-gray-300 text-xs font-mono">{contract.startDate}</p>
                                </div>
                                <div className="bg-gray-800/20 rounded-lg p-2.5 border border-gray-800">
                                    <p className="text-[10px] text-gray-500 mb-1">{ct.expiryDate || 'Expiry'}</p>
                                    <p className="text-gray-300 text-xs font-mono">{contract.expiryDate}</p>
                                </div>
                                <div className="bg-gray-800/20 rounded-lg p-2.5 border border-gray-800">
                                    <p className="text-[10px] text-gray-500 mb-1">{ct.invoiceNo || 'Invoice'}</p>
                                    <p className="text-gray-400 text-xs font-mono tracking-wider">{contract.invoiceNo}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default ContractsTable
