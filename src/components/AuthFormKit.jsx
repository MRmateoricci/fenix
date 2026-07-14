// Kit de formulario para las páginas de cuenta (Login/Register/Account).
// Estilo propio, deliberadamente no compartido con Checkout.jsx.

export function Field({ label, error, children }) {
  return (
    <div>
      <label
        style={{
          display: 'block', fontSize: '0.68rem', fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--color-text-muted)', marginBottom: '0.5rem',
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <p style={{ fontSize: '0.75rem', marginTop: '0.375rem', color: 'var(--color-primary)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

export function DarkInput({ type = 'text', placeholder, value, onChange, hasError }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '0.75rem 1rem', borderRadius: '0.625rem',
        fontSize: '0.9rem', outline: 'none',
        backgroundColor: 'var(--color-surface-2)',
        border: `1.5px solid ${hasError ? 'var(--color-primary)' : 'var(--color-border)'}`,
        color: 'var(--color-text)',
        transition: 'border-color 150ms ease',
      }}
      onFocus={(e) => { if (!hasError) e.currentTarget.style.borderColor = 'var(--color-primary)' }}
      onBlur={(e)  => { if (!hasError) e.currentTarget.style.borderColor = 'var(--color-border)' }}
    />
  )
}

export function PrimaryBtn({ onClick, type = 'button', disabled, children }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '0.85rem 0', borderRadius: '0.75rem',
        fontSize: '0.9rem', fontWeight: 600,
        backgroundColor: disabled ? 'var(--color-border)' : 'var(--color-primary)',
        color: disabled ? 'var(--color-text-muted)' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 150ms ease',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)' }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary)' }}
    >
      {children}
    </button>
  )
}
