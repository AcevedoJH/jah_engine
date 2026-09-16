import type { HTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

/**
 * ============================================================
 * JAH ENGINE - Componentes base: Card (Shadcn UI)
 * (src/components/ui/card.tsx)
 * ============================================================
 * La "Card" es el contenedor visual estandar del dashboard.
 * Siguiendo el patron de Shadcn UI, exponemos varias piezas
 * componibles (Card, CardHeader, CardTitle...) en lugar de un
 * unico componente monolitico con decenas de props. Esto da al
 * consumidor maxima flexibilidad con el minimo API.
 *
 * Concepto clave: cada componente reenvia (...) las props HTML
 * nativas (via HTMLAttributes) y usa `cn()` para fusionar clases.
 * Asi respetamos atributos como id, onClick, aria-* sin redefinirlos.
 */

/** Contenedor raiz con borde, fondo y sombra. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // rounded-lg/border/bg-card definen el look; shadow-sm da profundidad.
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
}

/** Cabecera: agrupa titulo + descripcion con padding interno. */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
}

/** Titulo de la tarjeta con tipografia destacada. */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

/** Subtitulo o texto de apoyo, en color atenuado. */
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

/** Cuerpo principal de la tarjeta. */
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />
}

/** Pie de tarjeta: acciones alineadas a la derecha. */
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />
}