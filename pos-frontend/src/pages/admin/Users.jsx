import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const emptyForm = { username: '', password: '', name: '', role: 'vendedor' }

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)

  function load() {
    setLoading(true)
    api.listUsers().then(res => setUsers(res.users)).catch(err => setError(err.message)).finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      await api.createUser(form)
      setForm(emptyForm)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggleActive(user) {
    setError('')
    try {
      if (user.active) await api.deactivateUser(user.id)
      else await api.updateUser(user.id, { active: true })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRoleChange(user, role) {
    try {
      await api.updateUser(user.id, { role })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleResetPassword(user) {
    const password = prompt(`Nueva contraseña para ${user.name}:`)
    if (!password) return
    try {
      await api.updateUser(user.id, { password })
      alert('Contraseña actualizada.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-bold text-slate-800">Usuarios del POS</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Usuario</label>
          <input
            required
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Nombre</label>
          <input
            required
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Contraseña</label>
          <input
            required
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Rol</label>
          <select
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="vendedor">Vendedor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-800">
          Crear
        </button>
      </form>

      {loading ? (
        <p className="text-slate-400">Cargando...</p>
      ) : (
        <table className="w-full rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{user.username}</td>
                <td className="px-3 py-2">{user.name}</td>
                <td className="px-3 py-2">
                  <select
                    value={user.role}
                    onChange={e => handleRoleChange(user, e.target.value)}
                    className="rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                  >
                    <option value="vendedor">Vendedor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <span className={user.active ? 'text-emerald-600' : 'text-slate-400'}>
                    {user.active ? 'Activo' : 'Desactivado'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => handleResetPassword(user)} className="mr-3 text-xs text-slate-500 underline">
                    Cambiar contraseña
                  </button>
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`text-xs underline ${user.active ? 'text-red-500' : 'text-emerald-600'}`}
                  >
                    {user.active ? 'Desactivar' : 'Reactivar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
