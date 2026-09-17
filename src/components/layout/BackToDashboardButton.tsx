/**
 * ============================================================
 * JAH ENGINE - BackToDashboardButton
 * (src/components/layout/BackToDashboardButton.tsx)
 * ============================================================
 * Boton REUTILIZABLE de retorno al Dashboard, pensado para el final
 * de las subpaginas (Network, Benchmark, Backups...).
 *
 * ¿Por qué un componente compartido y no un boton copiado en cada
 * pagina? DRY y consistencia: el estilo (outline + ArrowLeft) y el
 * destino ("/") son CISNE y tienen que serlo. Si mañana cambia la
 * ruta raiz o el estilo, solo se edita un lugar.
 *
 * PATRON MOVIL vs ESCRITORIO:
 *   - `w-full` en movil: el area tactil ocupa todo el ancho, cifra
 *     optima para el pulgar y "muy visible" como pide la spec.
 *   - `md:w-auto` en escritorio: discreto, junto a la sidebar que ya
 *     ofrece navegacion; el boton pasa a ser un atajo mas, no ruido.
 * Navegamos con navigate('/') (React Router) para conservar el modo
 * SPA (sin recarga) y que la app no pierda el estado global.
 */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

/** Props del boton de retorno. */
export interface BackToDashboardButtonProps {
  /** Clases extra opcionales para adaptar margenes en cada pagina. */
  className?: string
}

/** Boton "Volver al Dashboard": ancho completo en movil, auto en md+. */
export function BackToDashboardButton({ className }: BackToDashboardButtonProps) {
  const navigate = useNavigate()

  return (
    <Button
      variant="outline"
      onClick={() => navigate('/')}
      className={cn('w-full md:w-auto', className)}
    >
      <ArrowLeft className="h-4 w-4" />
      Volver al Dashboard
    </Button>
  )
}