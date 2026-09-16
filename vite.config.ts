import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * ============================================================
 * JAH ENGINE - vite.config.ts
 * ============================================================
 * Archivo de configuracion de Vite (el bundler + dev-server).
 * Se ejecuta en Node y por eso importamos de 'node:url'.
 *
 * Roles de cada parte:
 *  - defineConfig()  : funcion helper que aporta autocompletado de
 *                      tipos y valida las opciones del objeto.
 *  - plugins         : [react] activa React Fast Refresh: cuando
 *                      editas un componente se conserva el estado
 *                      del navegador (HMR en caliente).
 *  - resolve.alias   : crea el alias "@" -> ./src. Es el gemelo en
 *                      Vite del "paths" que definimos en
 *                      tsconfig.app.json. Ambos deben coincidir:
 *                      TypeScript resuelve tipos y Vite los imports.
 *
 * Uso de fileURLToPath + URL:
 *  Se construye la ruta absoluta a /src de forma portable (funciona
 *  en Windows, Linux y macOS) sin depender de "process.cwd()".
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Servidor de desarrollo: dejamos el host por defecto (localhost).
  // Si mas adelante conectamos nuevos microservicios podremos
  // anadir un proxy aqui para evitar problemas de CORS en dev.
  server: {
    port: 5173,
  },
})