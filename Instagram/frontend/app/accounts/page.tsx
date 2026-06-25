'use client'

import { useState, useEffect } from 'react'
import { accountsApi } from '@/lib/api'
import type { Account } from '@/lib/types'
import { AccountManager } from '@/components/accounts/AccountManager'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  const loadAccounts = () => {
    setLoading(true)
    accountsApi.list()
      .then(d => setAccounts(d.accounts))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAccounts() }, [])

  return (
    <div className="animate-slide-up space-y-5">
      <div className="page-header mb-0">
        <h1 className="page-title">Cuentas Conectadas</h1>
        <p className="page-subtitle">Gestioná tus cuentas de Instagram y Facebook</p>
      </div>

      <AccountManager accounts={accounts} loading={loading} onRefresh={loadAccounts} />
    </div>
  )
}
