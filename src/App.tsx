/**
 * ============================================================
 * JAH ENGINE - App.tsx (componente raiz + enrutado)
 * ============================================================
 * Aqui definimos el MAPA DE RUTAS de la SPA con React Router v7.
 *
 * Estructura de rutas anidadas:
 *   <Route element={<DashboardLayout />}>   <- layout con sidebar
 *     ├── "/"          -> DashboardPage
 *     ├── "/network"   -> NetworkPage
 *     ├── "/benchmark" -> BenchmarkPage
 *     └── "/backups"   -> BackupsPage
 *
 * El layout envuelve a todas las paginas y su <Outlet/> renderiza la
 * hija activa. Nota: la ruta padre NO tiene `path`, es una "layout
 * route" (solo aporta UI, no segmento de URL).
 *
 * ESTADO GLOBAL DEL BENCHMARK:
 * <BenchmarkProvider> envuelve todo el arbol de rutas y monta el hook
 * `useBenchmark` en la raiz UNA sola vez. Asi el estado de una prueba
 * es compartido entre la vista completa (/benchmark) y el gadget del
 * Dashboard (/), que viven en rutas distintas y se montan/desmontan
 * por separado. Como el provider nunca se desmonta por navegacion,
 * la simulacion sigue viva y el widget la muestra en tiempo real.
 */

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { NetworkPage } from '@/features/network/NetworkPage'
import { BenchmarkPage } from '@/features/benchmark/BenchmarkPage'
import { BenchmarkProvider } from '@/features/benchmark/context/BenchmarkProvider'
import { BackupsPage } from '@/features/backups/BackupsPage'

/**
 * Componente raiz de JAH Engine.
 * @returns El proveedor de rutas con el arbol de paginas.
 */
function App() {
  return (
    // BrowserRouter usa la History API del navegador (URLs limpias).
    <BrowserRouter>
      {/* Proveedor de estado global del benchmark (envuelve TODAS las
          rutas: página completa y widget del dashboard comparten el
          mismo estado de la prueba en curso). */}
      <BenchmarkProvider>
        <Routes>
          {/* Layout compartido por todas las vistas. */}
          <Route element={<DashboardLayout />}>
            {/* index = ruta "/" exacta. */}
            <Route index element={<DashboardPage />} />
            <Route path="network" element={<NetworkPage />} />
            <Route path="benchmark" element={<BenchmarkPage />} />
            <Route path="backups" element={<BackupsPage />} />
          </Route>
        </Routes>
      </BenchmarkProvider>
    </BrowserRouter>
  )
}

export default App