'use client'

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
 * BeINExportTable - Renders contracts table exactly like beIN Sport source
 * Used for both UI display and image export
 * Column order: Invoice No, Expiry Date, Start Date, Package, Status, Type
 */
export function BeINExportTable({ cardNumber, contracts }: BeINExportTableProps) {
    return (
        <div 
            data-export-table="true"
            style={{ 
            backgroundColor: '#ffffff', 
            padding: '20px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '12px',
            minWidth: '850px'
        }}>
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
                        <th style={{ 
                            padding: '8px 10px', 
                            border: '1px solid #cccccc',
                            textAlign: 'center'
                        }}>
                            Invoice No
                        </th>
                        <th style={{ 
                            padding: '8px 10px', 
                            border: '1px solid #cccccc',
                            textAlign: 'center'
                        }}>
                            Expiry Date
                        </th>
                        <th style={{ 
                            padding: '8px 10px', 
                            border: '1px solid #cccccc',
                            textAlign: 'center'
                        }}>
                            Start Date
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
                            textAlign: 'center'
                        }}>
                            Status
                        </th>
                        <th style={{ 
                            padding: '8px 10px', 
                            border: '1px solid #cccccc',
                            textAlign: 'center'
                        }}>
                            Type
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {contracts.map((contract, idx) => (
                        <tr 
                            key={idx}
                            style={{ 
                                backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f5f5f5'
                            }}
                        >
                            <td style={{ 
                                padding: '6px 10px', 
                                border: '1px solid #cccccc',
                                textAlign: 'center',
                                color: '#333333'
                            }}>
                                {contract.invoiceNo}
                            </td>
                            <td style={{ 
                                padding: '6px 10px', 
                                border: '1px solid #cccccc',
                                textAlign: 'center',
                                color: '#333333'
                            }}>
                                {contract.expiryDate}
                            </td>
                            <td style={{ 
                                padding: '6px 10px', 
                                border: '1px solid #cccccc',
                                textAlign: 'center',
                                color: '#333333'
                            }}>
                                {contract.startDate}
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
                                backgroundColor: contract.status.toLowerCase() === 'active' 
                                    ? '#ccffcc' 
                                    : contract.status.toLowerCase() === 'expired'
                                        ? '#ffffcc'
                                        : '#ffcccc',
                                color: '#333333',
                                fontWeight: 500
                            }}>
                                {contract.status}
                            </td>
                            <td style={{ 
                                padding: '6px 10px', 
                                border: '1px solid #cccccc',
                                textAlign: 'center',
                                color: '#333333'
                            }}>
                                {contract.type}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default BeINExportTable
