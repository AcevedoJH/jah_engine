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
 *
 * ============ GESTIÓN DEL LAYOUT: FLEX + SCROLL ============
 * El objetivo es que la sidebar quede FIJA mientras el contenido
 * hace scroll. La tecnica clasica de CSS Flexbox es esta:
 *
 *   1. `h-screen` en el contenedor raiz: ocupa exactamente el 100vh
 *      (alto de la ventana). Con `overflow-hidden` cortamos CUALQUIER
 *      desbordamiento del propio contenedor: todo el scroll se delega
 *      a los hijos que lo permitan.
 *
 *   2. La sidebar usa `h-full` + `flex-shrink-0`:
 *      - `h-full` la estira al alto completo de la ventana.
 *      - `flex-shrink-0` le prohibe encogerse aunque el contenido
 *        del main sea muy ancho; su ancho lo decide ella misma.
 *
 *   3. `<main>` es `flex-1 overflow-y-auto h-full`:
 *      - `flex-1` le hace absorber TODO el espacio sobrante a la
 *        derecha de la sidebar (crece/shrink segun haga falta).
 *      - `overflow-y-auto` convierte SOLO a este area en la banda de
 *        rodadura vertical: cuando el contenido de una pagina excede
 *        el alto de la ventana, el scroll ocurre aqui y la sidebar
 *        ni se entera (permanece inmóvil, fija en pantalla).
 *
 * Suma: un unico scroll (el del main) en un layout de dos columnas,
 * que es exactamente el patron de las apps de productividad.
 */

import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'

/** Esqueleto del dashboard: sidebar fija + contenido scrollable. */
export function DashboardLayout() {
  return (
    // h-screen + overflow-hidden: la ventana ES el layout y no hace
    // scroll como un todo; el scroll vive en <main> (ver comentarios
    // del encabezado para la logica Flexbox completa).
    <div className="flex h-screen overflow-hidden bg-background">
      {/* La sidebar es h-full + flex-shrink-0: ancho proprio y fija.
          Maneja su estado colapsado internamente (ver Sidebar.tsx). */}
      <Sidebar />

      {/* Unica zona con scroll vertical de toda la app. */}
      <main className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">
          {/* Aqui se renderiza la pagina hija segun la ruta activa. */}
          <Outlet />
        </div>
      </main>
    </div>
  )
}