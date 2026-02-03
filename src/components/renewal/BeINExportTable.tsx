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
 * Mobile: Same table scaled down to fit screen width
 */
export function BeINExportTable({ cardNumber, contracts }: BeINExportTableProps) {
    const [scaleFactor, setScaleFactor] = useState(1)
    const [tableHeight, setTableHeight] = useState<number | null>(null)
    const tableRef = useRef<HTMLDivElement>(null)

    // Calculate scale factor based on screen width
    useEffect(() => {
        const calculateScale = () => {
            if (typeof window === 'undefined') return
            
            const screenWidth = window.innerWidth
            const tableMinWidth = 890 // table width + padding
            const availableWidth = screenWidth - 48 // account for page padding
            
            if (availableWidth < tableMinWidth) {
                const newScale = availableWidth / tableMinWidth
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

    return (
        <div 
            style={{ 
                width: '100%',
                height: typeof scaledHeight === 'number' ? `${scaledHeight}px` : 'auto',
                overflow: 'hidden'
            }}
        >
            <div
                ref={tableRef}
                data-export-table="true"
                style={{ 
                    backgroundColor: '#ffffff', 
                    padding: '20px',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontSize: '12px',
                    minWidth: '850px',
                    transform: scaleFactor < 1 ? `scale(${scaleFactor})` : 'none',
                    transformOrigin: 'top left',
                    width: scaleFactor < 1 ? `${100 / scaleFactor}%` : '100%'
                }}
            >
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
            </div>
        </div>
    )
}

export default BeINExportTable
