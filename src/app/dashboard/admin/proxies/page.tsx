'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { withRequestDeadline } from '@/lib/request-deadline'
import {
    Plus,
    RefreshCw,
    Trash2,
    Edit,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Globe,
    Network,
    Activity,
    Server,
    Upload
} from 'lucide-react'
import { usePanelRequest, readPanelJson, PanelRequestError } from '@/hooks/usePanelRequest'
import { PanelLoadError } from '@/components/ui/PanelLoadError'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/useTranslation'

interface Proxy {
    id: string
    host: string
    port: number
    username: string | null
    hasPassword: boolean
    label: string
    isActive: boolean
    lastTestedAt: string | null
    lastIp: string | null
    responseTimeMs: number | null
    failureCount: number
    accountsCount: number
    createdAt: string
}

interface ProxyImportPreview {
    summary: {
        totalLines: number
        blankLines: number
        validCount: number
        duplicateCount: number
        invalidCount: number
        nextLabelStart: number
    }
    validRows: Array<{
        lineNumber: number
        host: string
        port: number
        username: string | null
        hasPassword: boolean
        label: string
    }>
    duplicates: Array<{
        lineNumber: number
        host: string
        port: number
        reason: string
    }>
    invalidRows: Array<{
        lineNumber: number
        rawLine: string
        reason: string
    }>
}

const initialFormData = {
    host: '',
    port: '',
    username: '',
    password: '',
    label: '',
    isActive: true
}

async function proxyCommand(url: string, init: RequestInit) {
    return withRequestDeadline(async signal => {
        const response = await fetch(url, { ...init, signal })
        if (!response.ok) throw new Error('PROXY_REQUEST_REJECTED')
        return response.json()
    })
}

export default function ProxiesPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { t, dir } = useTranslation()
    const [proxies, setProxies] = useState<Proxy[]>([])
    const { run, loading, error: readError } = usePanelRequest()
    const mutationPending = useRef(false)
    const [mutationBusy, setMutationBusy] = useState(false)
    const [mutationError, setMutationError] = useState<string | null>(null)
    const previewedText = useRef<string | null>(null)
    const editOpener = useRef<HTMLElement | null>(null)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editProxy, setEditProxy] = useState<Proxy | null>(null)
    const [testingProxyId, setTestingProxyId] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [importDialogOpen, setImportDialogOpen] = useState(false)
    const [importText, setImportText] = useState('')
    const [importPreview, setImportPreview] = useState<ProxyImportPreview | null>(null)
    const [previewingImport, setPreviewingImport] = useState(false)
    const [committingImport, setCommittingImport] = useState(false)

    // Set dynamic page title
    useEffect(() => {
        document.title = `${t.adminProxies?.title || 'Proxy Management'} | Desh Panel`
    }, [t])

    // Form state
    const [formData, setFormData] = useState(initialFormData)

    const fetchProxies = useCallback(async () => {
        await run(async signal => {
            const data = await readPanelJson<{success: boolean; proxies: Proxy[]}>('/api/admin/proxies', signal)
            if (!data.success) throw new PanelRequestError(500)
            return data.proxies
        }, setProxies)
    }, [run])

    useEffect(() => {
        if (status === 'authenticated') {
            if (session?.user?.role !== 'ADMIN') {
                router.push('/dashboard')
            } else {
                fetchProxies()
            }
        }
    }, [status, session, router, fetchProxies])

    function beginMutation() {
        if (mutationPending.current) return false
        mutationPending.current = true
        setMutationBusy(true)
        setMutationError(null)
        return true
    }
    function endMutation() { mutationPending.current = false; setMutationBusy(false) }
    function notifyError(message: string) { setMutationError(message); toast.error(message) }

    const handleAddProxy = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!beginMutation()) return
        setSubmitting(true)
        try {
            const data = await proxyCommand('/api/admin/proxies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: formData.host.trim(),
                    port: parseInt(formData.port, 10),
                    username: formData.username.trim() || null,
                    password: formData.password || null,
                    label: formData.label.trim(),
                    isActive: formData.isActive
                })
            })
            if (data.success) {
                toast.success(t.adminProxies?.messages?.addSuccess || 'Proxy added successfully')
                setAddDialogOpen(false)
                setFormData(initialFormData)
                fetchProxies()
            } else {
                notifyError(data.error || t.panelUi.actionFailed)
            }
        } catch {
            notifyError(t.adminProxies?.messages?.addFailed || 'Failed to add proxy')
        } finally {
            endMutation()
            setSubmitting(false)
        }
    }

    const resetImportDialog = () => {
        setImportText('')
        setImportPreview(null)
        setPreviewingImport(false)
        setCommittingImport(false)
    }

    const handleImportDialogChange = (open: boolean) => {
        if (mutationPending.current) return
        setMutationError(null)
        setImportDialogOpen(open)
        if (!open) {
            resetImportDialog()
        }
    }

    const handlePreviewImport = async () => {
        if (!importText.trim() || !beginMutation()) return
        previewedText.current = null
        setImportPreview(null)
        setPreviewingImport(true)
        try {
            const data = await proxyCommand('/api/admin/proxies/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'preview',
                    text: importText,
                    isActive: true,
                }),
            })
            if (data.success) {
                previewedText.current = importText
                setImportPreview({
                    summary: data.summary,
                    validRows: data.validRows || [],
                    duplicates: data.duplicates || [],
                    invalidRows: data.invalidRows || [],
                })
            } else {
                setImportPreview(null)
                notifyError(data.error || t.adminProxies?.messages?.importPreviewFailed || 'Failed to preview import')
            }
        } catch {
            setImportPreview(null)
            notifyError(t.adminProxies?.messages?.importPreviewFailed || 'Failed to preview import')
        } finally {
            endMutation()
            setPreviewingImport(false)
        }
    }

    const handleCommitImport = async () => {
        if (!importPreview || importPreview.summary.validCount === 0 || previewedText.current !== importText || !beginMutation()) return
        setCommittingImport(true)
        try {
            const data = await proxyCommand('/api/admin/proxies/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'commit',
                    text: importText,
                    isActive: true,
                }),
            })
            if (data.success) {
                toast.success(
                    `${t.adminProxies?.messages?.importSuccess || 'Imported proxies'}: ${data.summary?.importedCount || 0}`
                )
                setImportDialogOpen(false)
                resetImportDialog()
                fetchProxies()
            } else {
                notifyError(data.error || t.adminProxies?.messages?.importFailed || 'Failed to import proxies')
            }
        } catch {
            notifyError(t.adminProxies?.messages?.importFailed || 'Failed to import proxies')
        } finally {
            endMutation()
            setCommittingImport(false)
        }
    }

    const handleUpdateProxy = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editProxy || !beginMutation()) return
        setSubmitting(true)
        try {
            const data = await proxyCommand(`/api/admin/proxies/${editProxy.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: formData.host.trim(),
                    port: parseInt(formData.port, 10),
                    username: formData.username.trim() || null,
                    password: formData.password || null,
                    label: formData.label.trim(),
                    isActive: formData.isActive
                })
            })
            if (data.success) {
                toast.success(t.adminProxies?.messages?.updateSuccess || 'Proxy updated successfully')
                setEditProxy(null)
                setFormData(initialFormData)
                fetchProxies()
            } else {
                notifyError(data.error || t.panelUi.actionFailed)
            }
        } catch {
            notifyError(t.adminProxies?.messages?.updateFailed || 'Failed to update proxy')
        } finally {
            endMutation()
            setSubmitting(false)
        }
    }

    const handleDeleteProxy = async (proxy: Proxy) => {
        if (mutationPending.current) return
        if (!confirm(t.adminProxies?.messages?.deleteConfirm || 'Are you sure you want to delete this proxy?')) return
        if (!beginMutation()) return
        try {
            const data = await proxyCommand(`/api/admin/proxies/${proxy.id}`, {
                method: 'DELETE'
            })
            if (data.success) {
                toast.success(data.message)
                fetchProxies()
            } else {
                notifyError(data.error || t.panelUi.actionFailed)
            }
        } catch {
            notifyError(t.adminProxies?.messages?.deleteFailed || 'Failed to delete proxy')
        } finally {
            endMutation()
        }
    }

    const handleTestProxy = async (proxy: Proxy) => {
        if (!beginMutation()) return
        setTestingProxyId(proxy.id)
        try {
            const data = await proxyCommand(`/api/admin/proxies/${proxy.id}/test`, {
                method: 'POST'
            })
            if (data.success) {
                toast.success(`${t.adminProxies?.messages?.testSuccess || 'Connection successful'}: ${data.result.ip}`)
                fetchProxies()
            } else {
                notifyError(data.error || t.adminProxies?.messages?.testFailed || 'Connection failed')
            }
        } catch {
            notifyError(t.adminProxies?.messages?.testError || 'Failed to test proxy')
        } finally {
            endMutation()
            setTestingProxyId(null)
        }
    }

    const handleToggleStatus = async (proxy: Proxy) => {
        if (!beginMutation()) return
        try {
            const data = await proxyCommand(`/api/admin/proxies/${proxy.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    isActive: !proxy.isActive
                })
            })
            if (data.success) {
                toast.success(t.adminProxies?.messages?.statusChanged || 'Proxy status changed')
                fetchProxies()
            } else {
                notifyError(t.adminProxies.messages.statusChangeFailed)
            }
        } catch {
            notifyError(t.adminProxies?.messages?.statusChangeFailed || 'Failed to change status')
        } finally {
            endMutation()
        }
    }

    const getStatusBadge = (proxy: Proxy) => {
        if (!proxy.isActive) {
            return <Badge variant="secondary" className="gap-1 opacity-50"><XCircle className="h-3 w-3" />{t.adminProxies?.status?.disabled || 'Disabled'}</Badge>
        }
        if (proxy.failureCount > 0) {
            return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{t.adminProxies?.status?.error || 'Issues'}</Badge>
        }
        if (proxy.lastTestedAt) {
            return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />{t.adminProxies?.status?.active || 'Connected'}</Badge>
        }
        return <Badge variant="outline" className="gap-1">{t.adminProxies?.status?.new || 'New'}</Badge>
    }

    if (status === 'loading' || (loading && proxies.length === 0)) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (readError !== null) return <PanelLoadError status={readError} retry={() => void fetchProxies()} />

    const activeProxies = proxies.filter(p => p.isActive).length
    const totalProxies = proxies.length
    const failedProxies = proxies.filter(p => p.failureCount > 0).length

    return (
        <div className="space-y-6 p-6">
            {loading && <p role="status" className="text-sm text-muted-foreground">{t.common.loading} {t.panelUi.staleData}</p>}
            {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg">
                        <Globe className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{t.adminProxies?.title || 'Proxy Management'}</h1>
                        <p className="text-muted-foreground text-sm">{t.adminProxies?.subtitle || 'Manage IP addresses and beIN connections'}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={fetchProxies}>
                        <RefreshCw className="h-4 w-4 ml-2" />
                        {t.adminProxies?.refresh || t.common?.refresh || 'Refresh'}
                    </Button>
                    <Dialog open={importDialogOpen} onOpenChange={handleImportDialogChange}>
                        <DialogTrigger asChild>
                            <Button variant="outline">
                                <Upload className="h-4 w-4 ml-2" />
                                {t.adminProxies?.import?.button || 'Bulk Import'}
                            </Button>
                        </DialogTrigger>
                        <DialogContent panel closeLabel={t.panelUi.close} dir={dir} className="max-w-3xl">
                            <DialogHeader>
                                <DialogTitle>{t.adminProxies?.import?.title || 'Bulk Proxy Import'}</DialogTitle>
                            </DialogHeader>
                            {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="proxy-import-text">
                                        {t.adminProxies?.import?.textareaLabel || 'Proxy list'}
                                    </Label>
                                    <textarea disabled={mutationBusy}
                                        id="proxy-import-text"
                                        value={importText}
                                        onChange={(e) => {
                                            setImportText(e.target.value)
                                            setImportPreview(null)
                                        }}
                                        placeholder={t.adminProxies?.import?.placeholder || 'host:port:username:password'}
                                        className="min-h-56 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono dir-ltr shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {t.adminProxies?.import?.hint || 'Paste one proxy per line. Supported formats: host:port or host:port:username:password.'}
                                    </p>
                                </div>

                                {importPreview && (
                                    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                            <div>
                                                <div className="text-xs text-muted-foreground">{t.adminProxies?.import?.valid || 'Valid'}</div>
                                                <div className="text-xl font-semibold text-green-600">{importPreview.summary.validCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted-foreground">{t.adminProxies?.import?.duplicates || 'Duplicates'}</div>
                                                <div className="text-xl font-semibold text-yellow-600">{importPreview.summary.duplicateCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted-foreground">{t.adminProxies?.import?.invalid || 'Invalid'}</div>
                                                <div className="text-xl font-semibold text-red-600">{importPreview.summary.invalidCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted-foreground">{t.adminProxies?.import?.blank || 'Blank'}</div>
                                                <div className="text-xl font-semibold">{importPreview.summary.blankLines}</div>
                                            </div>
                                        </div>

                                        {importPreview.validRows.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="text-sm font-medium">{t.adminProxies?.import?.assignedLabels || 'Assigned labels'}</div>
                                                <div className="max-h-28 overflow-auto rounded border bg-background">
                                                    {importPreview.validRows.slice(0, 8).map(row => (
                                                        <div key={`${row.lineNumber}-${row.label}`} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs last:border-b-0">
                                                            <span className="font-medium">{row.label}</span>
                                                            <span className="font-mono dir-ltr">{row.host}:{row.port}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {(importPreview.invalidRows.length > 0 || importPreview.duplicates.length > 0) && (
                                            <div className="grid gap-3 md:grid-cols-2">
                                                {importPreview.invalidRows.length > 0 && (
                                                    <div className="space-y-2">
                                                        <div className="text-sm font-medium text-red-600">{t.adminProxies?.import?.invalidRows || 'Invalid rows'}</div>
                                                        <div className="max-h-28 overflow-auto rounded border bg-background">
                                                            {importPreview.invalidRows.slice(0, 5).map(row => (
                                                                <div key={`invalid-${row.lineNumber}`} className="border-b px-3 py-2 text-xs last:border-b-0">
                                                                    <div>{t.adminProxies?.import?.line || 'Line'} {row.lineNumber}: {row.reason}</div>
                                                                    <div className="mt-1 font-mono text-muted-foreground dir-ltr">{row.rawLine}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {importPreview.duplicates.length > 0 && (
                                                    <div className="space-y-2">
                                                        <div className="text-sm font-medium text-yellow-600">{t.adminProxies?.import?.duplicateRows || 'Duplicate rows'}</div>
                                                        <div className="max-h-28 overflow-auto rounded border bg-background">
                                                            {importPreview.duplicates.slice(0, 5).map(row => (
                                                                <div key={`duplicate-${row.lineNumber}`} className="border-b px-3 py-2 text-xs last:border-b-0">
                                                                    <span>{t.adminProxies?.import?.line || 'Line'} {row.lineNumber}: </span>
                                                                    <span className="font-mono dir-ltr">{row.host}:{row.port}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => handleImportDialogChange(false)}>
                                        {t.common?.cancel || 'Cancel'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handlePreviewImport}
                                        disabled={previewingImport || committingImport || importText.trim().length === 0}
                                    >
                                        {previewingImport ? t.adminProxies?.import?.previewing || 'Previewing...' : t.adminProxies?.import?.preview || 'Preview'}
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handleCommitImport}
                                        disabled={mutationBusy || !importPreview || importPreview.summary.validCount === 0}
                                    >
                                        {committingImport ? t.adminProxies?.import?.importing || 'Importing...' : t.adminProxies?.import?.import || 'Import'}
                                    </Button>
                                </DialogFooter>
                            </div>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={addDialogOpen} onOpenChange={open => { if (!mutationPending.current) { setAddDialogOpen(open); setMutationError(null) } }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 ml-2" />
                                {t.adminProxies?.addProxy || 'Add Proxy'}
                            </Button>
                        </DialogTrigger>
                        <DialogContent panel closeLabel={t.panelUi.close} dir={dir} className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>{t.adminProxies?.dialogs?.addTitle || 'Add New Proxy'}</DialogTitle>
                            </DialogHeader>
                            {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
                            <form onSubmit={handleAddProxy} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="label">{t.adminProxies?.dialogs?.label || 'Label'} *</Label>
                                    <Input
                                        id="label"
                                        value={formData.label}
                                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                        placeholder={t.adminProxies?.dialogs?.labelPlaceholder || 'e.g. Main Egypt Server'}
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2 space-y-2">
                                        <Label htmlFor="host">{t.adminProxies?.dialogs?.ip || 'IP Address'} *</Label>
                                        <Input
                                            id="host"
                                            value={formData.host}
                                            onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                            placeholder="149.87.157.84"
                                            required
                                            className="dir-ltr font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="port">{t.adminProxies?.dialogs?.port || 'Port'} *</Label>
                                        <Input
                                            id="port"
                                            type="number"
                                            min="1"
                                            max="65535"
                                            value={formData.port}
                                            onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                                            placeholder="8080"
                                            required
                                            className="dir-ltr font-mono"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="username">{t.adminProxies?.dialogs?.username || 'Username'}</Label>
                                        <Input
                                            id="username"
                                            value={formData.username}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                            placeholder={t.adminProxies?.dialogs?.optional || 'Optional'}
                                            className="dir-ltr"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">{t.adminProxies?.dialogs?.password || 'Password'}</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder={t.adminProxies?.dialogs?.optional || 'Optional'}
                                            className="dir-ltr"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t.adminProxies?.dialogs?.noAuthHint || 'Leave username and password empty if no authentication required'}
                                </p>
                                <DialogFooter>
                                    <DialogClose asChild disabled={mutationBusy}>
                                        <Button type="button" variant="outline">{t.common?.cancel || 'Cancel'}</Button>
                                    </DialogClose>
                                    <Button type="submit" disabled={mutationBusy}>
                                        {submitting ? t.adminProxies?.dialogs?.adding || 'Adding...' : t.adminProxies?.dialogs?.add || 'Add'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{totalProxies}</div>
                            <div className="text-sm text-muted-foreground">{t.adminProxies?.stats?.totalServers || 'Total Servers'}</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-green-600">{activeProxies}</div>
                            <div className="text-sm text-muted-foreground">{t.adminProxies?.stats?.activeServers || 'Active Servers'}</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-red-600">{failedProxies}</div>
                            <div className="text-sm text-muted-foreground">{t.adminProxies?.stats?.connectionIssues || 'Connection Issues'}</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                            <Globe className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">{proxies.reduce((acc, curr) => acc + curr.accountsCount, 0)}</div>
                            <div className="text-sm text-muted-foreground">{t.adminProxies?.stats?.linkedAccounts || 'Linked Accounts'}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Proxies Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Network className="h-5 w-5" />
                        {t.adminProxies?.table?.serversList || 'Servers List'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table panel density="compact">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t.adminProxies?.table?.label || 'Label'}</TableHead>
                                <TableHead className="text-center">{t.adminProxies?.table?.hostPort || 'Host:Port'}</TableHead>
                                <TableHead className="text-center">{t.adminProxies?.table?.auth || 'Auth'}</TableHead>
                                <TableHead className="text-center">{t.adminProxies?.table?.status || 'Status'}</TableHead>
                                <TableHead className="text-center">{t.adminProxies?.table?.currentIP || 'Current IP'}</TableHead>
                                <TableHead className="text-center">{t.adminProxies?.table?.accounts || 'Accounts'}</TableHead>
                                <TableHead className="text-center">{t.adminProxies?.table?.actions || 'Actions'}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {proxies.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        {t.adminProxies?.table?.noProxies || 'No proxy servers. Add one now!'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                proxies.map((proxy) => (
                                    <TableRow key={proxy.id}>
                                        <TableCell>
                                            <div className="font-medium">{proxy.label}</div>
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-sm">
                                            {proxy.host}:{proxy.port}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {proxy.hasPassword ? (
                                                <Badge variant="default" className="bg-green-600">{t.common?.yes || 'Yes'}</Badge>
                                            ) : (
                                                <Badge variant="secondary">{t.common?.no || 'No'}</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">{getStatusBadge(proxy)}</TableCell>
                                        <TableCell className="text-center font-mono text-sm">
                                            {proxy.lastIp || '-'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary">{proxy.accountsCount}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleTestProxy(proxy)}
                                                    disabled={mutationBusy}
                                                    title={t.adminProxies?.actions?.testConnection || 'Test Connection'}
                                                >
                                                    <Activity className={`h-4 w-4 ${testingProxyId === proxy.id ? 'animate-spin' : ''}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleToggleStatus(proxy)}
                                                    disabled={mutationBusy}
                                                    title={proxy.isActive ? t.adminProxies?.actions?.disable || 'Disable' : t.adminProxies?.actions?.enable || 'Enable'}
                                                >
                                                    <div className={`h-2 w-2 rounded-full ${proxy.isActive ? 'bg-green-600' : 'bg-gray-300'}`} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        editOpener.current = document.activeElement as HTMLElement
                                                        setMutationError(null)
                                                        setEditProxy(proxy)
                                                        setFormData({
                                                            host: proxy.host,
                                                            port: String(proxy.port),
                                                            username: proxy.username || '',
                                                            password: '',
                                                            label: proxy.label,
                                                            isActive: proxy.isActive
                                                        })
                                                    }}
                                                    title={t.common?.edit || 'Edit'}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteProxy(proxy)}
                                                    title={t.adminProxies?.actions?.delete || 'Delete'}
                                                    className="text-red-600 hover:text-red-700"
                                                    disabled={mutationBusy || proxy.accountsCount > 0}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={!!editProxy} onOpenChange={open => { if (!open && !mutationPending.current) setEditProxy(null) }}>
                <DialogContent panel closeLabel={t.panelUi.close} dir={dir} className="max-w-md" onCloseAutoFocus={event => {
                    if (editOpener.current?.isConnected) { event.preventDefault(); editOpener.current.focus() }
                }}>
                    <DialogHeader>
                        <DialogTitle>{t.adminProxies?.dialogs?.editTitle || 'Edit Proxy'}</DialogTitle>
                    </DialogHeader>
                            {mutationError && <p role="alert" className="text-sm text-destructive">{mutationError}</p>}
                    <form onSubmit={handleUpdateProxy} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-label">{t.adminProxies?.dialogs?.label || 'Label'} *</Label>
                            <Input
                                id="edit-label"
                                value={formData.label}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2 space-y-2">
                                <Label htmlFor="edit-host">{t.adminProxies?.dialogs?.ip || 'IP Address'} *</Label>
                                <Input
                                    id="edit-host"
                                    value={formData.host}
                                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                    required
                                    className="dir-ltr font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-port">{t.adminProxies?.dialogs?.port || 'Port'} *</Label>
                                <Input
                                    id="edit-port"
                                    type="number"
                                    min="1"
                                    max="65535"
                                    value={formData.port}
                                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                                    required
                                    className="dir-ltr font-mono"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="edit-username">{t.adminProxies?.dialogs?.username || 'Username'}</Label>
                                <Input
                                    id="edit-username"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    placeholder={t.adminProxies?.dialogs?.optional || 'Optional'}
                                    className="dir-ltr"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-password">{t.adminProxies?.dialogs?.password || 'Password'}</Label>
                                <Input
                                    id="edit-password"
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder={editProxy?.hasPassword ? t.adminProxies?.dialogs?.noChange || '(No change)' : t.adminProxies?.dialogs?.optional || 'Optional'}
                                    className="dir-ltr"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t.adminProxies?.dialogs?.keepPasswordHint || 'Leave password empty to keep current'}
                        </p>
                        <DialogFooter>
                            <DialogClose asChild disabled={mutationBusy}>
                                <Button type="button" variant="outline">{t.common?.cancel || 'Cancel'}</Button>
                            </DialogClose>
                            <Button type="submit" disabled={mutationBusy}>
                                {submitting ? t.adminProxies?.dialogs?.saving || 'Saving...' : t.common?.save || 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
