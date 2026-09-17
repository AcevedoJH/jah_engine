/**
 * ============================================================
 * JAH ENGINE - Tipos de variables de entorno (import.meta.env)
 * (src/vite-env.d.ts)
 * ============================================================
 * Vite trae los tipos base en el paquete "vite/client" (ya referenciado
 * en tsconfig.app.json -> "types"). Aqui AUMENTAMOS esa interfaz con
 * nuestras variables VITE_* propias para que TypeScript muestre errores
 * si tecleamos mal una clave o comparamos un tipo incorrecto.
 *
 * Nota: todos los valores llegan SIEMPRE como string (un valor de .env
 * nunca es numero ni boolean real), de ahi que los tipemos como string.
 */

/** Interfaz de variables expuestas al cliente; se fusiona con la de Vite. */
interface ImportMetaEnv {
  /** 'true' activa el modo de datos simulados (Modulos 1 y 3). */
  readonly VITE_USE_MOCK_DATA: string
  /** URL base de la API REST de backups (solo con mock desactivado). */
  readonly VITE_API_BASE_URL: string
}

/** Variable global que Vite inyecta en el codigo del navegador. */
interface ImportMeta {
  readonly env: ImportMetaEnv
}