/**
 * ============================================================
 * JAH ENGINE - Navbar (src/components/layout/Navbar.tsx)
 * ============================================================
 * Cabecera SOLO para móvil (`md:hidden`): en pantallas pequenas no
 * hay sidebar visible (la ocultamos en Sidebar.tsx), asi que este
 * top-bar aporta el acceso a la navegacion:
 *   - Boton HAMBURGUESA (icono Menu) en la esquina superior izquierda.
 *   - Titulo de la marca centrado/compañero.
 *
 * ¿Por que NO gestiona aqui el estado del menu?
 * El estado `isMobileMenuOpen` vive "elevado" (lifting state up) en
 * DashboardLayout: la hamburguesa AQUI abre el panel, pero el panel
 * (el drawer con la sidebar) está en Sidebar. Como dos componentes
 * necesitan tocar el mismo estado, el padre común es el lugar natural.
 * Navbar solo expone `onMenuToggle` (la accion "abrir/cerrar").
 *
 * PATRON MOVIL: el botón se coloca arriba a la izquierda porque es la
 * convención de accesibilidad/antigüedad: el pulgar lo alcanza con
 * comodidad y el ojo ya sabe que ahí está la navegación.
 */

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Props de la cabecera móvil. */
export interface NavbarProps {
  /**
   * Callback de alternancia de la hamburguesa. El padre (DashboardLayout)
   * lo conecta a `setIsMobileMenuOpen(prev => !prev)`.
   */
  onMenuToggle: () => void
}

/** Cabecera móvil con botón hamburguesa para abrir la navegación. */
export function Navbar({ onMenuToggle }: NavbarProps) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 md:hidden">
      {/* Hamburguesa: solo visible en <md. size="icon" fabrica un boton
          cuadrado accesible (h-10 w-10) con el icono centrado. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onMenuToggle}
        aria-label="Abrir menú de navegación"
        title="Abrir menú de navegación"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Marca compacta: refuerza que seguimos en JAH Engine. */}
      <span className="truncate text-base font-bold tracking-tight">JAH Engine</span>
    </header>
  )
}