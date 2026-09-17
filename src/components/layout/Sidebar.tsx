/**
 * ============================================================
 * JAH ENGINE - Sidebar (src/components/layout/Sidebar.tsx)
 * ============================================================
 * Menu lateral de navegacion del dashboard, en DOS modos:
 *
 *   1. ESCRITORIO (md+): `<aside>` estatico y fijo dentro del layout
 *      Flexbox (h-full flex-shrink-0). Colapsable entre w-64 y w-16
 *      con estado `isCollapsed` persistido en localStorage.
 *
 *   2. MOVIL (<md): la sidebar estatica se OCULTA (`hidden md:flex`);
 *      en su lugar, cuando `isMobileOpen` es true, se renderiza un
 *      PANEL SUPERPUESTO (drawer/overlay):
 *        - Un fondo semitransparente (bg-black/50) que intercepta
 *          clics: pulsar fuera = cerrar.
 *        - Un panel fijo a la izquierda con el MISMO menu (se reutiliza
 *          el componente interno MenuItems) mas boton de cierre (X).
 *
 * El estado mobile vive en DashboardLayout (lanzamiento desde la
 * hamburguesa del Navbar): aqui solo recibimos `isMobileOpen` y el
 * callback `onCloseMobile`.
 *
 * NOTA DE RENDERIZADO CONDICIONAL: ambos menus comparten las
 * definiciones de NAV_ITEMS y el JSX de los enlaces via <MenuItems/>.
 * Evitar duplicar ese JSX es clave: si hubiera dos copias, el estilo
 * de los enlaces se desincronizaria entre escritorio y movil.
 */

import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Activity,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Gauge,
  LayoutDashboard,
  X,
} from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Defnicion declarativa de los items del menu.
 * Separar DATOS de RENDER facilita anadir rutas en el futuro.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/network', label: 'Network & Hosts', icon: Activity, end: false },
  { to: '/benchmark', label: 'Benchmark', icon: Gauge, end: false },
  { to: '/backups', label: 'Backups', icon: DatabaseBackup, end: false },
] as const

/** Clave de localStorage donde se guarda la preferencia de colapso. */
const COLLAPSED_STORAGE_KEY = 'jah-engine:sidebar-collapsed'

/* =====================================================================
   ============ COMPONENTE INTERNO: LISTA DE ENLACES ====================
   ===================================================================== */

/**
 * Renderiza los enlaces del menu (NavLink de React Router).
 * Es el JSX COMPARTIDO por el aside de escritorio y el drawer movil.
 *
 * @param collapsed   - true en el modo compacto de escritorio: oculta
 *                      los textos, centra iconos y anade tooltip nativo.
 * @param onNavigate  - Callback opcional ejecutado al pulsar un enlace.
 *                      En movil se conecta a `onCloseMobile` para cerrar
 *                      el panel tras navegar.
 */
function MenuItems({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        // Desestructuramos el componente de icono y lo renombramos
        // a PascalCase (obligatorio para usarlos como <JSX/>).
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            // `end` evita que "/" se marque activo en todas las rutas.
            end={item.end}
            // En movil, tras navegar se cierra el drawer: e.preventDefault
            // NO se usa porque navegar es lo que queremos; simplemente
            // avisamos al padre para que desmonte el overlay.
            onClick={onNavigate}
            // Tooltip nativo SOLO en colapsado (escritorio compacto):
            // sin etiqueta a la vista, el titulo revela el destino.
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                // Colapsado: sin relleno lateral y centrado, el enlace
                // queda como un cuadrado con el icono solo.
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {/* Etiqueta visible solo en modo expandido. */}
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        )
      })}
    </nav>
  )
}

/* =====================================================================
   ========================== PROPS DEL SIDEBAR ========================
   ===================================================================== */

/** Props que el layout le inyecta al sidebar. */
export interface SidebarProps {
  /**
   * true cuando el drawer movil debe estar desplegado (lo controla
   * DashboardLayout desde la hamburguesa del Navbar).
   */
  isMobileOpen: boolean
  /** Cierra el drawer: tanto el fondo ("clic fuera") como la X. */
  onCloseMobile: () => void
}

/* =====================================================================
   ========================= COMPONENTE PRINCIPAL ======================
   ===================================================================== */

/** Barra lateral de escritorio (colapsable) + drawer movil superpuesto. */
export function Sidebar({ isMobileOpen, onCloseMobile }: SidebarProps) {
  /* -------------------------------------------------------------
     ESTADO DE COLAPSO (solo lo usa el modo escritorio)
     ------------------------------------------------------------- */
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      // Solo 'true' colapsa; cualquier otro valor deja la barra
      // expandida por defecto.
      return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true'
    } catch {
      // Sin acceso a localStorage (modo privado): estado por defecto.
      return false
    }
  })

  // Persistir la preferencia en cada cambio de isCollapsed.
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed))
    } catch {
      // Almacenamiento no disponible: la app sigue funcionando igual.
    }
  }, [isCollapsed])

  // Accion de plegar/desplegar: alterna el boolean derivado del previo.
  function toggleCollapse(): void {
    setIsCollapsed((prev) => !prev)
  }

  return (
    <>
      {/* ============================================================
          MODO ESCRITORIO (aside estatico, oculto en <md)
         ============================================================ */}
      <aside
        className={cn(
          'hidden h-full flex-shrink-0 flex-col border-r bg-muted/20 transition-all duration-300 md:flex',
          isCollapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Cabecera / logo (icono + marca) o solo icono si colapse. */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 pb-2 pt-4',
            isCollapsed && 'justify-center px-0',
          )}
        >
          <ArrowLeftRight className="h-5 w-5 shrink-0 text-primary" />
          {!isCollapsed && (
            <span className="truncate text-lg font-bold tracking-tight">JAH Engine</span>
          )}
        </div>

        {/* Boton plegar/desplegar: chevron que invita hacia dentro/fuera. */}
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Expandir menú lateral' : 'Plegar menú lateral'}
          title={isCollapsed ? 'Expandir menú lateral' : 'Plegar menú lateral'}
          className={cn(
            'mx-2 mb-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            isCollapsed && 'mx-auto',
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>

        {/* Menu compacto (sin onNavigate: el escritorio no se cierra). */}
        <MenuItems collapsed={isCollapsed} />
      </aside>

      {/* ============================================================
          MODO MOVIL (drawer superpuesto, visible solo en <md)
         ============================================================
         Se monta/desmonta con renderizado condicional: si isMobileOpen
         es false, este bloque NO existe en el DOM (cerrado limpio). */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Fondo semitransparente: interceptor de clics. Pulsar aqui
              cierra el menu (patron "click outside to dismiss"). */}
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />

          {/* El panel: fijo a la izquierda, ancho completo w-64, con
              su propio scroll por si hubiera muchos items. La sombra
              (shadow-xl) lo separa visualmente del fondo oscurecido. */}
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto bg-background p-4 shadow-xl">
            {/* Cabecera del panel: marca + boton de cierre (X). */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
                <span className="text-lg font-bold tracking-tight">JAH Engine</span>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Cerrar menú de navegación"
                title="Cerrar menú de navegación"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* MISMO menu que el escritorio, pero expandido. onNavigate
                cierra el drawer al pulsar cualquier enlace. */}
            <MenuItems collapsed={false} onNavigate={onCloseMobile} />
          </div>
        </div>
      )}
    </>
  )
}