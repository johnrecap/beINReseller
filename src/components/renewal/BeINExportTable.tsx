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
    const tableRef = useRef<HTMLDivElement>(null)
    const [tableHeight, setTableHeight] = useState<number>(0)
    const TABLE_WIDTH = 850

    // Calculate scale factor based on screen width
    useEffect(() => {
        const calculateScale = () => {
            if (typeof window === 'undefined') return
            
            const screenWidth = window.innerWidth
            const availableWidth = screenWidth - 48 // account for page padding
            
            if (availableWidth < TABLE_WIDTH) {
                const newScale = availableWidth / TABLE_WIDTH
                setScaleFactor(Math.max(newScale, 0.35)) // minimum 35% scale
            } else {
                setScaleFactor(1)
            }
        }
        
        calculateScale()
        window.addEventListener('resize', calculateScale)
        return () => window.removeEventListener('resize', calculateScale)
    }, [])

    // Measure actual table height after render
    useEffect(() => {
        if (tableRef.current) {
            const height = tableRef.current.getBoundingClientRect().height
            setTableHeight(height)
        }
    }, [contracts])

    // Status color helper
    const getStatusColor = (status: string) => {
        const s = status.toLowerCase()
        if (s === 'active') return { bg: '#ccffcc', text: '#006600' }
        if (s === 'expired') return { bg: '#ffffcc', text: '#996600' }
        return { bg: '#ffcccc', text: '#990000' } // Cancelled or other
    }

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

    // Calculate the scaled height for the container
    const scaledContainerHeight = tableHeight > 0 ? tableHeight * scaleFactor : 'auto'

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {/* Container that holds the scaled table with proper height */}
            <div 
                style={{ 
                    width: '100%',
                    height: typeof scaledContainerHeight === 'number' ? `${scaledContainerHeight}px` : 'auto',
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start'
                }}
            >
                {/* Visible Scaled Table */}
                <div
                    ref={tableRef}
                    style={{ 
                        backgroundColor: '#ffffff', 
                        padding: '20px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        fontSize: '12px',
                        width: `${TABLE_WIDTH}px`,
                        flexShrink: 0,
                        transform: scaleFactor < 1 ? `scale(${scaleFactor})` : 'none',
                        transformOrigin: 'top center'
                    }}
                >
                    <TableContent />
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
                    <TableContent />
                </div>
            </div>
        </div>
    )
}

export default BeINExportTable
