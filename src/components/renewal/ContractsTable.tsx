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

interface ContractsTableProps {
    contracts: Contract[]
    expiryDate?: string  // Card expiry date for the yellow banner
}

/**
 * ContractsTable - Displays subscription/package history
 * Desktop: beIN Sport portal exact styling (fieldset, purple header, zebra rows)
 * Mobile: Same provider table with internal horizontal scrolling
 */
export function ContractsTable({ contracts, expiryDate }: ContractsTableProps) {
    const { t } = useTranslation()
    const ct = t.contracts

    if (!contracts || contracts.length === 0) {
        return null
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
        <div className="mt-6 min-w-0 max-w-full">
            {/* Provider visual contract remains separate from panel table tokens. */}
            <div tabIndex={0} className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                {/* Fieldset container - exact beIN portal style */}
                <fieldset style={{
                    border: '1px solid #cccccc',
                    margin: '10px 0',
                    padding: '10px',
                    backgroundColor: '#ffffff',
                    borderRadius: '4px',
                    minWidth: '680px'
                }}>
                    <legend style={{
                        padding: '0 8px',
                        fontWeight: 'bold',
                        color: '#333333',
                        fontSize: '14px'
                    }}>
                        {ct.title}
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
                            {ct.validUntil.replace('{date}', expiryDate)}
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
                                    {ct.type}
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {ct.status}
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center'
                                }}>
                                    {ct.packageName}
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {ct.startDate}
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {ct.expiryDate}
                                </th>
                                <th style={{
                                    padding: '8px 10px',
                                    border: '1px solid #cccccc',
                                    textAlign: 'center',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {ct.invoiceNo}
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

        </div>
    )
}

export default ContractsTable
