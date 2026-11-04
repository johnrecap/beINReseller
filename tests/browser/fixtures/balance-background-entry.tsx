import React from 'react'
import { createRoot } from 'react-dom/client'
import Header from '@/components/layout/Header'
import Accounts from '@/app/dashboard/admin/bein-accounts/page'
import { PanelCommandProvider } from '@/components/providers/PanelCommandProvider'
import { useStore } from '@/store/useStore'

useStore.setState({ language: 'en' })
createRoot(document.getElementById('root')!).render(<PanelCommandProvider>
    <Header title="Panel" onMenuClick={() => {}} />
    <nav><a href="/accounts">Accounts</a> <a href="/other">Other page</a></nav>
    <main>{location.pathname === '/accounts' ? <Accounts /> : <h1>Other page</h1>}</main>
</PanelCommandProvider>)
