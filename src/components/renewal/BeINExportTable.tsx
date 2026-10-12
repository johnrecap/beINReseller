'use client'

import { useTranslation } from '@/hooks/useTranslation'

interface Contract {
    type: string
    status: string
    package: string
    startDate: string
    expiryDate: string
    invoiceNo: string
}

interface BeINExportTableProps {
    cardNumber: string
    contracts: Contract[]
}

/**
 * BeINExportTable - Renders a readable, internally scrolling provider document
 * Desktop: Full size table
 * Mobile: Full-size table scrolls inside the available viewport
 * Export: Hidden full-size table for image download
 */
export function BeINExportTable({ cardNumber, contracts }: BeINExportTableProps) {
    const { t, dir } = useTranslation()
    const TABLE_WIDTH = 850

    // Status color helper
    const getStatusColor = (status: string) => {
        const s = status.toLowerCase()
        if (s === 'active') return { bg: '#ccffcc', text: '#006600' }
        if (s === 'expired') return { bg: '#ffffcc', text: '#996600' }
        return { bg: '#ffcccc', text: '#990000' } // Cancelled or other
    }

    // Reuse markup without creating a new component type on every render.
    const tableContent = (providerDocument = false) => (
        <>
            {/* Card Number */}
            <div style={{ 
                textAlign: 'center', 
                fontSize: '18px', 
                fontWeight: 'bold',
                marginBottom: '15px',
                color: '#333333'
            }}>
                {cardNumber}
            </div>
            
            {/* Contracts Table - exact beIN Sport styling */}
            <table dir={providerDocument ? undefined : dir} style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: '1px solid #cccccc',
                fontSize: '12px'
            }}>
                <thead>
                    <tr style={{ 
                        backgroundColor: '#663399', 
                        color: '#ffffff',
                        fontWeight: 'bold'
                    }}>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            {providerDocument ? 'Invoice No' : t.contracts.invoiceNo}
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            {providerDocument ? 'Expiry Date' : t.contracts.expiryDate}
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            {providerDocument ? 'Start Date' : t.contracts.startDate}
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            {providerDocument ? 'Package' : t.contracts.packageName}
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            {providerDocument ? 'Status' : t.contracts.status}
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            {providerDocument ? 'Type' : t.contracts.type}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {contracts.map((contract, idx) => {
                        const statusColor = getStatusColor(contract.status)
                        return (
                            <tr 
                                key={idx}
                                style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f5f5f5' }}
                            >
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.invoiceNo}
                                </td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.expiryDate}
                                </td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.startDate}
                                </td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.package}
                                </td>
                                <td style={{ 
                                    padding: '6px 10px', 
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    backgroundColor: statusColor.bg,
                                    color: statusColor.text,
                                    fontWeight: 500
                                }}>
                                    {providerDocument ? contract.status : contract.status.toLowerCase() === 'active' ? t.contracts.statusActive
                                        : contract.status.toLowerCase() === 'expired' ? t.contracts.statusExpired
                                        : ['canceled', 'cancelled'].includes(contract.status.toLowerCase()) ? t.contracts.statusCancelled : contract.status}
                                </td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.type}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </>
    )

    return (
        <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
            {/* Screen containment does not alter the export document below. */}
            <div 
                tabIndex={0}
                className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                style={{ 
                    width: '100%',
                    overscrollBehaviorX: 'contain'
                }}
            >
                {/* Visible full-size table */}
                <div
                    style={{ 
                        backgroundColor: '#ffffff', 
                        padding: '20px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '12px',
                        width: `${TABLE_WIDTH}px`,
                        marginInline: 'auto'
                    }}
                >
                    {tableContent()}
                </div>
            </div>

            {/* Hidden Full-Size Table for Export - uses fixed position to not affect layout */}
            <div 
                style={{ 
                    position: 'fixed',
                    left: '-9999px',
                    top: '-9999px',
                    pointerEvents: 'none',
                    zIndex: -1
                }}
            >
                <div
                    data-export-table="true"
                    style={{ 
                        backgroundColor: '#ffffff', 
                        padding: '20px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '12px',
                        width: `${TABLE_WIDTH}px`
                    }}
                >
                    {tableContent(true)}
                </div>
            </div>
        </div>
    )
}

export default BeINExportTable
