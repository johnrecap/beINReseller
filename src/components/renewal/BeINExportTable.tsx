'use client'

import { useEffect, useState, useRef } from 'react'

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
 * BeINExportTable - Renders contracts table with responsive scaling
 * Desktop: Full size table
 * Mobile: Same table scaled down to fit screen width (centered)
 * Export: Hidden full-size table for image download
 */
export function BeINExportTable({ cardNumber, contracts }: BeINExportTableProps) {
    const [scaleFactor, setScaleFactor] = useState(1)
    const [tableHeight, setTableHeight] = useState<number | null>(null)
    const tableRef = useRef<HTMLDivElement>(null)
    const TABLE_MIN_WIDTH = 890

    // Calculate scale factor based on screen width
    useEffect(() => {
        const calculateScale = () => {
            if (typeof window === 'undefined') return
            
            const screenWidth = window.innerWidth
            const availableWidth = screenWidth - 48 // account for page padding
            
            if (availableWidth < TABLE_MIN_WIDTH) {
                const newScale = availableWidth / TABLE_MIN_WIDTH
                setScaleFactor(Math.max(newScale, 0.35)) // minimum 35% scale
            } else {
                setScaleFactor(1)
            }
        }
        
        calculateScale()
        window.addEventListener('resize', calculateScale)
        return () => window.removeEventListener('resize', calculateScale)
    }, [])

    // Measure table height for container adjustment
    useEffect(() => {
        if (tableRef.current) {
            setTableHeight(tableRef.current.offsetHeight)
        }
    }, [contracts, scaleFactor])

    // Status color helper
    const getStatusColor = (status: string) => {
        const s = status.toLowerCase()
        if (s === 'active') return { bg: '#ccffcc', text: '#006600' }
        if (s === 'expired') return { bg: '#ffffcc', text: '#996600' }
        return { bg: '#ffcccc', text: '#990000' } // Cancelled or other
    }

    // Calculate container height when scaled
    const scaledHeight = tableHeight ? tableHeight * scaleFactor : 'auto'

    // Table content component (reused for both visible and export)
    const TableContent = () => (
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
            <table style={{
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
                            Invoice No
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Expiry Date
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Start Date
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Package
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Status
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Type
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
                                    {contract.status}
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
        <>
            {/* Visible Scaled Table - centered */}
            <div 
                style={{ 
                    width: '100%',
                    height: typeof scaledHeight === 'number' ? `${scaledHeight}px` : 'auto',
                    overflow: 'visible',
                    display: 'flex',
                    justifyContent: 'center'
                }}
            >
                <div
                    ref={tableRef}
                    style={{ 
                        backgroundColor: '#ffffff', 
                        padding: '20px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '12px',
                        minWidth: `${TABLE_MIN_WIDTH - 40}px`,
                        width: `${TABLE_MIN_WIDTH - 40}px`,
                        transform: scaleFactor < 1 ? `scale(${scaleFactor})` : 'none',
                        transformOrigin: 'top center'
                    }}
                >
                    <TableContent />
                </div>
            </div>

            {/* Hidden Full-Size Table for Export - no transform */}
            <div 
                style={{ 
                    position: 'absolute', 
                    left: '-9999px', 
                    top: 0,
                    opacity: 1,
                    pointerEvents: 'none'
                }}
            >
                <div
                    data-export-table="true"
                    style={{ 
                        backgroundColor: '#ffffff', 
                        padding: '20px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '12px',
                        minWidth: `${TABLE_MIN_WIDTH - 40}px`
                    }}
                >
                    <TableContent />
                </div>
            </div>
        </>
    )
}

export default BeINExportTable
