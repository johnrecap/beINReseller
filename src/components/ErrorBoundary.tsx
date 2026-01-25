'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

interface ErrorBoundaryProps {
    children: React.ReactNode
    fallback?: React.ReactNode
}

// Separate component for error UI that can use hooks
function ErrorFallbackUI({ error }: { error: Error | null }) {
    return (
        <div className="min-h-[400px] flex items-center justify-center p-8" dir="rtl">
            <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">An unexpected error occurred</h2>
                <p className="text-muted-foreground mb-4">
                    We apologize for this error. Please reload the page or try again later.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-2 bg-[#00A651] text-white px-6 py-2 rounded-lg hover:bg-[#008f45] transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Reload Page
                </button>
                {process.env.NODE_ENV === 'development' && error && (
                    <details className="mt-4 text-left bg-secondary p-4 rounded-lg text-sm">
                        <summary className="cursor-pointer text-foreground font-medium">Error Details</summary>
                        <pre className="mt-2 overflow-auto text-red-600">
                            {error.message}
                            {'\n'}
                            {error.stack}
                        </pre>
                    </details>
                )}
            </div>
        </div>
    )
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback
            }

            return <ErrorFallbackUI error={this.state.error} />
        }

        return this.props.children
    }
}

export default ErrorBoundary
