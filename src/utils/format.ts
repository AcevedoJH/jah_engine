/**
 * ============================================================
 * JAH ENGINE - Formateadores (src/utils/format.ts)
 * ============================================================
 * Funciones puras para convertir numeros crudos en texto legible.
 * "Puras" significa: mismo input -> mismo output y sin efectos
 * secundarios. Son facilísimas de testear y de reutilizar.
 */

/**
 * Formatea milisegundos de latencia.
 *
 * @param ms     - Latencia en milisegundos (puede ser null).
 * @param digits - Decimales a mostrar (0 por defecto).
 * @returns Ej. "12 ms" o "-- ms" si no hay dato.
 */
export function formatLatency(ms: number | null | undefined, digits = 0): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '-- ms'
  return `${ms.toFixed(digits)} ms`
}

/**
 * Formatea un porcentaje acotado a [0,100].
 *
 * @param value  - Porcentaje (0-100).
 * @param digits - Decimales a mostrar (1 por defecto).
 * @returns Ej. "99.8%".
 */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--%'
  return `${value.toFixed(digits)}%`
}

/**
 * Formatea una cantidad de SEGUNDOS en texto humano corto.
 * Ej: 90061 -> "1d 1h". Util para el uptime del widget.
 *
 * @param seconds - Segundos totales.
 * @returns Texto compacto con dias/horas/minutos segun magnitud.
 */
export function formatUptime(seconds: number): string {
  // Guardamos contra valores negativos/invalidos.
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m'

  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)

  // Mostramos solo las dos unidades mas significativas.
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Formatea bytes a unidades binarias legibles (KiB, MiB, GiB...).
 * Lo usaremos en el modulo de backups cifrados.
 *
 * @param bytes  - Cantidad en bytes.
 * @param digits - Decimales en la unidad resultante.
 * @returns Ej. "1.5 GiB".
 */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  // 1024 (no 1000): usamos prefijos binarios KiB/MiB/GiB.
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const
  // El indice de unidad se deduce de cuantas veces cabe 1024.
  // (Math.min evita salirnos del array de unidades.)
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(digits)} ${units[exponent]}`
}

/**
 * Formatea una fecha ISO a hora local corta (HH:MM:SS).
 *
 * @param iso - Fecha en formato ISO 8601.
 * @returns Hora local; cadena vacia si la fecha es invalida.
 */
export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '--:--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  // toLocaleTimeString respeta la zona horaria del navegador.
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Formatea el instante ACTUAL a hora local corta (HH:MM:SS).
 * A diferencia de formatClockTime (que parte de una fecha dada), esta
 * variante sirve para etiquetas "ahora mismo", p. ej. marcar el reloj
 * del UI cuando aún no llegó el primer tick del servicio.
 *
 * @returns Hora local del momento de la llamada.
 */
export function formatClockTimeFromNow(): string {
  return formatClockTime(new Date().toISOString())
}

/**
 * Formatea un número con separador de miles y sin decimales.
 * Ej: 1234567 -> "1.234.567".
 *
 * @param value        - Número a formatear.
 * @param fallbackText - Texto si el número no es finito.
 * @returns Número formateado en locale español.
 */
export function formatNumber(value: number, fallbackText = '--'): string {
  if (!Number.isFinite(value)) return fallbackText
  return value.toLocaleString('es-ES')
}