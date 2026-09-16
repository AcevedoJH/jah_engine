import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * ============================================================
 * JAH ENGINE - Utilidad cn() (src/utils/cn.ts)
 * ============================================================
 * `cn` (classNames) es el helper estrella de Shadcn UI. Combina dos
 * librerias con propositos distintos:
 *
 *  - clsx: acepta strings, arrays, objetos condicionales y los une
 *    en una sola cadena. Ej: cn('p-4', isActive && 'bg-primary').
 *  - tailwind-merge: resuelve CONFLICTOS entre clases de Tailwind.
 *    Si un componente tiene 'p-2' por defecto y le pasas 'p-8', sin
 *    merge ambas quedarian y ganaria la ultima del CSS (impredecible).
 *    tailwind-merge elimina la clase pisada y deja solo 'p-8'.
 *
 * Resultado: personalizacion de componentes segura y predecible.
 *
 * @param inputs - Lista de clases (strings/arrays/objetos condicionales).
 * @returns Cadena de clases final, sin duplicados conflictivos.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}