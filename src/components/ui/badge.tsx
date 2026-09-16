import type { HTMLAttributes } from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/cn'

/**
 * ============================================================
 * JAH ENGINE - Componentes base: Badge (Shadcn UI)
 * (src/components/ui/badge.tsx)
 * ============================================================
 * Un Badge es una etiqueta pequena de estado (online, degraded...).
 *
 * Aqui introducimos class-variance-authority (CVA): una libreria que
 * separa la ESTRUCTURA de las VARIANTES de estilo. Definimos "variants"
 * (default, success, warning, destructive, outline) y CVA genera la
 * funcion que devuelve las clases correctas segun la variante elegida.
 * Ventaja: el sistema de diseno vive en un solo lugar y es tipado.
 */

// Definicion de las variantes visuales del badge.
const badgeVariants = cva(
  // Clases BASE comunes a todas las variantes.
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        // success/warning/destructive usan colores semaforo directos.
        success: 'border-transparent bg-emerald-500 text-white',
        warning: 'border-transparent bg-amber-500 text-white',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
      },
    },
    // Variante usada si el consumidor no especifica ninguna.
    defaultVariants: {
      variant: 'default',
    },
  },
)

/**
 * Props del Badge = atributos HTML + variantes autogeneradas por CVA.
 * `VariantProps<typeof badgeVariants>` extrae el tipo de `variant`.
 */
export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/** Componente Badge listo para consumir. */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
