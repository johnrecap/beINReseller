import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { ReportCenterTab } from './report-tabs'

type ReportPlaceholderPanelProps = {
    tab: ReportCenterTab
}

export function ReportPlaceholderPanel({ tab }: ReportPlaceholderPanelProps) {
    return (
        <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Report module</p>
                    <h2 className="text-xl font-semibold text-foreground">{tab.label}</h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">{tab.description}</p>
                </div>
                <Link
                    href={tab.legacyHref}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    <ExternalLink className="h-4 w-4" />
                    Open full page
                </Link>
            </div>
        </section>
    )
}
