/**
 * ============================================================
 * JAH ENGINE - Pagina Network & Hosts
 * (src/features/network/NetworkPage.tsx)
 * ============================================================
 * Vista COMPLETA (no miniatura) del Modulo 1. Es la ruta a la que
 * navega el widget cuando el usuario pulsa "Ver dashboard completo".
 *
 * Punto pedagogico: "retorno al dashboard". Incrustamos un enlace de
 * vuelta (React Router <Link to="/">). Asi la navegacion es fluida
 * (SPA: no recarga el navegador) y el usuario puede ir y volver entre
 * la miniatura y la vista completa.
 */

import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BackToDashboardButton } from '@/components/layout/BackToDashboardButton'
import { useHomeLabWidget } from '@/hooks/useHomeLabWidget'
import type { HostStatus } from '@/types'
import { formatLatency, formatPercent, formatUptime } from '@/utils/format'

/** Mapa de estado de host -> variante de Badge. */
function statusBadgeVariant(status: HostStatus): 'success' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'online':
      return 'success'
    case 'degraded':
      return 'warning'
    case 'maintenance':
      return 'outline'
    default:
      return 'destructive'
  }
}

/** Vista completa del modulo de red. */
export function NetworkPage() {
  // Mismo hook de dominio que usa el widget: un solo origen de datos.
  const { snapshot, connection, isSimulated } = useHomeLabWidget()

  return (
    <section className="space-y-6">
      {/* Boton de retorno al dashboard. Link mantiene la navegacion SPA. */}
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al dashboard
      </Link>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Network &amp; Hosts</h1>
          <p className="text-sm text-muted-foreground">
            Estado detallado de la infraestructura monitorizada por HomeLab Monitor.
          </p>
        </div>
        <Badge variant={isSimulated ? 'outline' : 'success'}>
          {isSimulated ? 'SIMULADO' : connection.toUpperCase()}
        </Badge>
      </header>

      {/* Tabla de hosts: en produccion usariamos un <table> o DataTable. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hosts monitorizados</CardTitle>
          <CardDescription>
            {snapshot ? `${snapshot.hosts.length} nodos detectados` : 'Esperando datos...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {snapshot?.hosts.map((host) => (
              <li key={host.id} className="flex items-center gap-4 px-6 py-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{host.name}</div>
                  <div className="text-xs text-muted-foreground">{host.ipAddress}</div>
                </div>
                <Badge variant={statusBadgeVariant(host.status)}>{host.status}</Badge>
                <span className="w-20 text-right font-mono text-xs text-muted-foreground">
                  {formatLatency(host.latency?.latencyMs ?? null, 1)}
                </span>
                <span className="w-24 text-right font-mono text-xs text-muted-foreground">
                  {formatPercent(host.uptime?.uptimePercent ?? null, 1)}
                </span>
                <span className="w-16 text-right font-mono text-xs text-muted-foreground">
                  {formatUptime(host.uptime?.uptimeSeconds ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Boton compartido de retorno (ancho completo en movil, discreto
          en escritorio). Visita BackToDashboardButton.tsx para el
          patron movil vs escritorio. */}
      <BackToDashboardButton />
    </section>
  )
}

export default NetworkPage