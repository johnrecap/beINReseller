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
    expiryDate?: string  // Card expiry date for the yellow banner
}

/**
 * BeINExportTable - Renders contracts table exactly like beIN Sport source
 * Used for image export/download - hidden in UI, captured with html-to-image
 */
export function BeINExportTable({ cardNumber, contracts, expiryDate }: BeINExportTableProps) {
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
        <div style={{ 
            backgroundColor: '#ffffff', 
            padding: '20px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '12px',
            minWidth: '750px'
        }}>
            {/* Card Number Header */}
            <div style={{ 
                textAlign: 'center', 
                fontSize: '18px', 
                fontWeight: 'bold',
                marginBottom: '15px',
                color: '#333333'
            }}>
                {cardNumber}
            </div>

            {/* Fieldset container - beIN portal style */}
            <fieldset style={{
                border: '1px solid #cccccc',
                margin: '10px 0',
                padding: '10px'
            }}>
                <legend style={{
                    padding: '0 8px',
                    fontWeight: 'bold',
                    color: '#333333',
                    fontSize: '14px'
                }}>
                    Contracts
                </legend>

                {/* Yellow ErrorBox banner */}
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
                                Type
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
                                Package
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
                                Expiry Date
                            </th>
                            <th style={{ 
                                padding: '8px 10px', 
                                border: '1px solid #cccccc',
                                textAlign: 'center'
                            }}>
                                Invoice No
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
                                    {contract.type}
                                </td>
                                <td style={{ 
                                    padding: '6px 10px', 
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    color: '#333333',
                                    fontWeight: 500,
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
                                    {contract.expiryDate}
                                </td>
                                <td style={{ 
                                    padding: '6px 10px', 
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    color: '#333333'
                                }}>
                                    {contract.invoiceNo}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </fieldset>
        </div>
    )
}

export default BeINExportTable
