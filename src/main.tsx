/**
 * ============================================================
 * JAH ENGINE - main.tsx (punto de entrada de React)
 * ============================================================
 * Es el primer modulo que se ejecuta en el navegador (lo carga
 * index.html con <script type="module">). Sus dos tareas:
 *   1. Localizar el nodo #root del DOM.
 *   2. Montar el arbol de React dentro de ese nodo.
 *
 * Importamos el CSS global AQUI para que Vite lo procese (Tailwind +
 * PostCSS) y lo inyecte en la pagina.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import App from '@/App.tsx'

// Buscamos el contenedor. El "!" (non-null assertion) le dice a TS que
// confiamos en que existe; si no estuviera, seria un error de maquetado.
const container = document.getElementById('root')!

// createRoot crea la "raiz" de React 18/19 vinculada a ese nodo.
// A partir de aqui TODA la UI la gestiona React (no tocamos el DOM a mano).
createRoot(container).render(
  // <StrictMode> no pinta nada: activa comprobaciones extra en DESARROLLO
  // (doble invocacion de efectos, deteccion de efectos sin limpieza...).
  // En produccion no tiene coste. Por eso nuestro WebSocket debe tolerar
  // montar/desmontar dos veces.
  <StrictMode>
    <App />
  </StrictMode>,
)