import { useState } from 'react'
import { api } from '../services/api'

const emptyForm = { name: '', legalName: '', cuit: '', phone: '', email: '', contactName: '', notes: '' }

export default function SupplierForm({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(
    supplier
      ? {
          name: supplier.name || '', legalName: supplier.legalName || '', cuit: supplier.cuit || '',
          phone: supplier.phone || '', email: supplier.email || '', contactName: supplier.contactName || '',
          notes: supplier.notes || '',
        }
      : emptyForm
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    setSubmitting(true)
    try {
      const { supplier: saved } = supplier
        ? await api.updateSupplier(supplier.id, form)
        : await api.createSupplier(form)
      onSaved(saved)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el proveedor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm font-medium text-slate-700">
            Nombre comercial
            <input
              autoFocus
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="col-span-2 text-sm font-medium text-slate-700">
            Razón social
            <input
              value={form.legalName}
              onChange={e => setForm({ ...form, legalName: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            CUIT
            <input
              value={form.cuit}
              onChange={e => setForm({ ...form, cuit: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Teléfono
            <input
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email
            <input
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Contacto
            <input
              value={form.contactName}
              onChange={e => setForm({ ...form, contactName: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="col-span-2 text-sm font-medium text-slate-700">
            Notas
            <input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-slate-300 py-2 text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-md bg-slate-900 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
