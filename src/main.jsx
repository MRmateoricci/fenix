import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.jsx'
import { initMetaPixel } from './utils/metaPixel'
import './index.css'

// Carga el Meta Pixel una sola vez para toda la app. El PageView no se dispara
// acá: lo maneja el tracker de rutas, que también cubre la primera pantalla.
initMetaPixel()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)
