/**
 * ============================================================
 * JAH ENGINE - Sidebar (src/components/layout/Sidebar.tsx)
 * ============================================================
 * Menu lateral de navegacion del dashboard. Usa <NavLink> de
 * React Router: es como <a>, pero sabe si la ruta esta activa y
 * expone `isActive` para resaltar el item seleccionado sin estado
 * manual (la URL ES el estado de la navegacion).
 */

import { NavLink } from 'react-router-dom'
import { Activity, ArrowLeftRight, DatabaseBackup, Gauge, LayoutDashboard } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Definicion declarativa de los items del menu.
 * Separar DATOS de RENDER facilita anadir rutas en el futuro.
 */
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/network', label: 'Network & Hosts', icon: Activity, end: false },
  { to: '/benchmark', label: 'Benchmark', icon: Gauge, end: false },
  { to: '/backups', label: 'Backups', icon: DatabaseBackup, end: false },
] as const

/** Barra lateral fija con el menu de modulos. */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/20 p-4 md:block">
      {/* Logotipo / titulo de la marca JAH Engine. */}
      <div className="mb-6 flex items-center gap-2 px-2">
        <ArrowLeftRight className="h-5 w-5 text-primary" />
        <span className="text-lg font-bold tracking-tight">JAH Engine</span>
      </div>

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
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}