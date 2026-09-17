/**
 * ============================================================
 * JAH ENGINE - DashboardLayout (src/components/layout/DashboardLayout.tsx)
 * ============================================================
 * Estructura visual comun a TODAS las rutas (sidebar + cabecera movil +
 * area de contenido). El contenido cambiante se inyecta con <Outlet/>:
 * React Router renderiza ahi la pagina que corresponda a la URL.
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
 *      - `flex-shrink-0` le prohibe encogerse; su ancho lo decide ella.
 *
 *   3. La columna derecha (`flex min-w-0 flex-1 flex-col`) apila la
 *      cabecera movil y el contenido; `min-w-0` es clave para que el
 *      flex hijo pueda encoger (evita desbordes con contenidos anchos
 *      tipo tablas/graficas).
 *
 *   4. `<main>` es `flex-1 overflow-y-auto min-h-0`:
 *      - `flex-1` absorbe el alto sobrante bajo la cabecera movil.
 *      - `min-h-0` permite que el hijo flex se ENCOJA por debajo de su
 *        contenido (sin el, el main empujaria la columna a crecer);
 *        asi `overflow-y-auto` se activa y SOLO esta zona hace scroll.
 *
 * ============ ESTADO DEL MENÚ MÓVIL (React) ============
 * El estado `isMobileMenuOpen` vive elevado AQUI porque lo comparten
 * dos componentes del layout:
 *   - <Navbar/>: la hamburguesa (solo <md) lo enciende/apaga.
 *   - <Sidebar/>: el drawer superpuesto lo consume y lo apaga cuando
 *     se pulsa un enlace, la X o el fondo.
 * Elevar el estado (lifting state up) al ancestro comun es el patron
 * correcto: ninguno de los dos es padre del otro.
 */

import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Navbar } from '@/components/layout/Navbar'

/** Esqueleto del dashboard: sidebar fija + contenido scrollable. */
export function DashboardLayout() {
  // Estado del menu movil (ver comentario del encabezado).
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Alterna el estado derivando SIEMPRE del valor previo (nunca de una
  // variable capturada, que podria estar desactualizada).
  function toggleMobileMenu(): void {
    setIsMobileMenuOpen((prev) => !prev)
  }

  return (
    // h-screen + overflow-hidden: la ventana ES el layout y no hace
    // scroll como un todo; el scroll vive en <main> (ver encabezado).
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar de escritorio + drawer movil (estado compartido). */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Columna derecha: cabecera movil + zona de trabajo. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera solo en movil (hamburguesa); invisible en md+. */}
        <Navbar onMenuToggle={toggleMobileMenu} />

        {/* Unica zona con scroll vertical de toda la app. */}
        <main className="h-full min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-6">
            {/* Aqui se renderiza la pagina hija segun la ruta activa. */}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}