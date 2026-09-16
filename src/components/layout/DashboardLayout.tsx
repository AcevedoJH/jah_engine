/**
 * ============================================================
 * JAH ENGINE - DashboardLayout (src/components/layout/DashboardLayout.tsx)
 * ============================================================
 * Estructura visual comun a TODAS las rutas (sidebar + area de
 * contenido). El contenido cambiante se inyecta con <Outlet/>:
 * React Router renderiza ahi la pagina que corresponda a la URL.
 *
 * Ventaja de usar un "layout route": definimos cabecera/sidebar una
 * sola vez y las paginas solo se preocupan de su propio contenido.
 */

import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'

/** Esqueleto del dashboard: sidebar fija + contenido scrollable. */
export function DashboardLayout() {
  return (
    // min-h-screen asegura que el fondo cubra toda la ventana.
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      {/* flex-1 ocupa el resto del ancho; overflow-auto permite scroll
          independiente del menu lateral. */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-6">
          {/* Aqui se renderiza la pagina hija segun la ruta activa. */}
          <Outlet />
        </div>
      </main>
    </div>
  )
}