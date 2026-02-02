'use client'

import { useEffect, useState } from 'react'

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
 * BeINExportTable - Renders contracts in responsive layout
 * Desktop (≥768px): Full 6-column table (beIN Sport style)
 * Mobile (<768px): Stacked cards showing all info
 * Always renders hidden table for image export
 */
export function BeINExportTable({ cardNumber, contracts }: BeINExportTableProps) {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Status color helper
    const getStatusColor = (status: string) => {
        const s = status.toLowerCase()
        if (s === 'active') return { bg: '#ccffcc', text: '#006600' }
        if (s === 'expired') return { bg: '#ffffcc', text: '#996600' }
        return { bg: '#ffcccc', text: '#990000' } // Cancelled or other
    }

    // Desktop Table (also used for export)
    const DesktopTable = ({ forExport = false }: { forExport?: boolean }) => (
        <div 
            data-export-table={forExport ? "true" : undefined}
            style={{ 
                backgroundColor: '#ffffff', 
                padding: '20px',
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '12px',
                minWidth: forExport ? '850px' : undefined,
                ...(forExport && !isMobile ? {} : {}),
                // Hide on mobile unless it's for export
                ...(!forExport && isMobile ? { display: 'none' } : {})
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
                            Type
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Status
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Package
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Start Date
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Expiry Date
                        </th>
                        <th style={{ padding: '8px 10px', border: '1px solid #cccccc', textAlign: 'center' }}>
                            Invoice No
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
                                    {contract.type}
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
                                    {contract.package}
                                </td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.startDate}
                                </td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.expiryDate}
                                </td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cccccc', textAlign: 'center', color: '#333333' }}>
                                    {contract.invoiceNo}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )

    // Mobile Cards View
    const MobileCards = () => (
        <div style={{ 
            backgroundColor: '#ffffff', 
            padding: '12px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            display: isMobile ? 'block' : 'none'
        }}>
            {/* Card Number */}
            <div style={{ 
                textAlign: 'center', 
                fontSize: '16px', 
                fontWeight: 'bold',
                marginBottom: '12px',
                color: '#333333',
                padding: '8px',
                backgroundColor: '#663399',
                color: '#ffffff',
                borderRadius: '6px'
            }}>
                {cardNumber}
            </div>
            
            {/* Contract Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contracts.map((contract, idx) => {
                    const statusColor = getStatusColor(contract.status)
                    return (
                        <div 
                            key={idx}
                            style={{ 
                                border: '1px solid #cccccc',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9f9f9'
                            }}
                        >
                            {/* Package Name - Header */}
                            <div style={{
                                backgroundColor: '#663399',
                                color: '#ffffff',
                                padding: '8px 12px',
                                fontSize: '13px',
                                fontWeight: 'bold'
                            }}>
                                {contract.package}
                            </div>
                            
                            {/* Card Content */}
                            <div style={{ padding: '10px 12px' }}>
                                {/* Type and Status Row */}
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    marginBottom: '8px'
                                }}>
                                    <span style={{ 
                                        fontSize: '12px', 
                                        color: '#666666'
                                    }}>
                                        <strong>Type:</strong> {contract.type}
                                    </span>
                                    <span style={{
                                        backgroundColor: statusColor.bg,
                                        color: statusColor.text,
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        fontWeight: 'bold'
                                    }}>
                                        {contract.status}
                                    </span>
                                </div>
                                
                                {/* Dates Row */}
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    fontSize: '11px',
                                    color: '#666666',
                                    marginBottom: '6px'
                                }}>
                                    <span><strong>Start:</strong> {contract.startDate}</span>
                                    <span><strong>Expiry:</strong> {contract.expiryDate}</span>
                                </div>
                                
                                {/* Invoice Row */}
                                <div style={{ 
                                    fontSize: '11px', 
                                    color: '#888888',
                                    borderTop: '1px solid #eeeeee',
                                    paddingTop: '6px',
                                    marginTop: '4px'
                                }}>
                                    <strong>Invoice:</strong> {contract.invoiceNo}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Table - visible on desktop, hidden on mobile */}
            <DesktopTable forExport={false} />
            
            {/* Mobile Cards - visible on mobile, hidden on desktop */}
            <MobileCards />
            
            {/* Hidden table for image export - always rendered but visually hidden on mobile */}
            {isMobile && (
                <div style={{ 
                    position: 'absolute', 
                    left: '-9999px', 
                    top: 0, 
                    opacity: 0,
                    pointerEvents: 'none'
                }}>
                    <DesktopTable forExport={true} />
                </div>
            )}
        </>
    )
}

export default BeINExportTable
