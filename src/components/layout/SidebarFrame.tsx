'use client'
import { useSyncExternalStore, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from '@/hooks/useTranslation'

const query = '(min-width: 1024px)'
const subscribe = (notify: () => void) => {
    const media = window.matchMedia(query)
    media.addEventListener('change', notify)
    return () => media.removeEventListener('change', notify)
}
const desktopSnapshot = () => window.matchMedia(query).matches

export function SidebarFrame({ children, isOpen, onClose, className, dir }: {
    children: ReactNode; isOpen: boolean; onClose: () => void; className: string; dir: string
}) {
    const desktop = useSyncExternalStore(subscribe, desktopSnapshot, () => true)
    const { t } = useTranslation()
    if (desktop) return <aside className={`${className} hidden lg:block`} dir={dir}>{children}</aside>
    return <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content dir={dir} aria-describedby={undefined}
                className="stitch-sidebar fixed inset-y-0 start-0 z-[60] w-[var(--sidebar-width)] max-w-[calc(100vw-2rem)] border-e border-border"
                onCloseAutoFocus={event => { event.preventDefault(); document.getElementById('panel-menu-button')?.focus() }}>
                <Dialog.Title className="sr-only">{t.panelUi.menu}</Dialog.Title>
                {children}
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
}
