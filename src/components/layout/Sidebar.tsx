/**
 * ============================================================
 * JAH ENGINE - Sidebar (src/components/layout/Sidebar.tsx)
 * ============================================================
 * Menu lateral de navegacion del dashboard. Usa <NavLink> de
 * React Router: es como <a>, pero sabe si la ruta esta activa y
 * expone `isActive` para resaltar el item seleccionado sin estado
 * manual (la URL ES el estado de la navegacion).
 *
 * ============ ESTADO COLABSADO (React) ============
 * El sidebar gestiona su propio estado `isCollapsed` (boolean) con
 * `useState`. ¿Por qué ESTADO y no CSS puro con clases?
 * Porque el renderizado condicional de React nos deja OCULTAR
 * elementos (textos, logo extendido) y CAMBIAR clases de ancho de
 * forma reactiva. Ademas, el estado se PERSISTE en localStorage:
 *   - Inicializacion "lazy": el inicializador de useState solo se
 *     ejecuta UNA vez (primer render) leyendo la preferencia
 *     guardada; sobre escritura con getItem cada render seria
 *     desperdicio.
 *   - Un useEffect guarda cada cambio: SIEMPRE que `isCollapsed`
 *     cambie, se vuelca a localStorage para que la preferencia
 *     sobreviva a recargas y a la vuelta al Dashboard.
 * El try/catch protege entornos sin almacenamiento (private mode).
 *
 * En moviles el sidebar permanece OCULTO (`hidden md:flex`): en
 * pantallas pequenas el menu lateral roba espacio valioso, asi que
 * la navegacion movil se apoya en los enlaces de retorno situados
 * al final de cada pagina (ver "Volver al Dashboard").
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

/** Barra lateral fija y colapsable con el menu de modulos. */
export function Sidebar() {
  /* -------------------------------------------------------------
     ESTADO DE COLAPSO + PERSISTENCIA EN localStorage
     -------------------------------------------------------------
     La inicializacion lazy (callback de useState) lee una sola vez
     la preferencia guardada. Al plegar/desplegar, el efecto de abajo
     persiste el nuevo valor; asi el usuario recupera su modalidad. */
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      // Solo 'true' colapsa; cualquier otro valor (null, 'false')
      // deja la barra expandida por defecto.
      return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true'
    } catch {
      // Sin acceso a localStorage (modo privado): estado por defecto.
      return false
    }
  })

  // Persistir el estado en cada cambio de isCollapsed.
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed))
    } catch {
      // Almacenamiento no disponible: la preferencia no persiste,
      // pero la app sigue funcionando con el estado en memoria.
    }
  }, [isCollapsed])

  // Accion de plegar/desplegar: alterna el boolean (nunca se muta el
  // estado anterior, siempre se deriva del previo con la funcion setter).
  function toggleCollapse(): void {
    setIsCollapsed((prev) => !prev)
  }

  return (
    <aside
      className={cn(
        // h-full: mide el alto completo de la ventana (el layout raiz
        // es h-screen). flex-shrink-0: su ancho es sagrado, ni se
        // encoge ni se estira. transition-all anima el cambio de
        // ancho entre colapsado y expandido.
        'hidden h-full flex-shrink-0 flex-col border-r bg-muted/20 transition-all duration-300 md:flex',
        // Modo colapsado: ancho reducido de 64 a 16 (iconos solos).
        isCollapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* ================= CABECERA / LOGO =================
          En modo expandido muestra icono + texto de marca.
          En modo colapsado queda SOLO el icono, centrado. */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 pb-2 pt-4',
          isCollapsed && 'justify-center px-0',
        )}
      >
        <ArrowLeftRight className="h-5 w-5 shrink-0 text-primary" />
        {/* El texto se DESMONTA (no solo se oculta) cuando colapsa:
            ahorra reflow horizontal y refuerza "modo compacto". */}
        {!isCollapsed && (
          <span className="truncate text-lg font-bold tracking-tight">JAH Engine</span>
        )}
      </div>

      {/* ================= BOTON PLEGAR/DESPLEGAR =================
          El icono cambia segun el estado: ChevronLeft apunta hacia
          la izquierda = "vamos a plegar" (ahorra espacio); ChevronRight
          invita a re-expandir. Al colapsar, el boton se centra para
          no descolocar el hueco que deja el texto oculto. */}
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

      {/* ================= MENU DE NAVEGACION ================= */}
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
              // Tooltip nativo del navegador SOLO en modo colapsado:
              // al no ver la etiqueta, el titulo del enlace la revela
              // al pasar el cursor (patron accesible en sidebar). Si
              // `title` es undefined, el atributo no se renderiza.
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  // Colapsado: sin relleno lateral y centrado, el
                  // enlace queda como un cuadrado con el icono solo.
                  isCollapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {/* Etiqueta visible solo en modo expandido. */}
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}