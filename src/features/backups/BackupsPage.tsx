/**
 * ============================================================
 * JAH ENGINE - Pagina Storage & Remote Backups
 * (src/features/backups/BackupsPage.tsx)
 * ============================================================
 * Placeholder del Modulo 3. Contendra:
 *  - Listado de jobs de respaldo (BackupJob) con su estado.
 *  - Barra de progreso de cifrado (AES-256 en origen).
 *  - Verificacion de checksum e informacion del ultimo/next run.
 *
 * Los tipos ya estan definidos en src/types/index.ts para que el
 * backend y esta vista compartan el mismo contrato de datos.
 */

import { DatabaseBackup } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Vista del orquestador de backups cifrados (aun sin logica). */
export function BackupsPage() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <DatabaseBackup className="h-6 w-6 text-primary" /> Storage &amp; Remote Backups
        </h1>
        <p className="text-sm text-muted-foreground">
          Orquestación de copias cifradas con sincronización remota. En construcción.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximamente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Aquí se gestionarán las copias de seguridad cifradas en origen
          (AES-256) y su sincronización remota mediante Rclone/S3.
        </CardContent>
      </Card>
    </section>
  )
}

export default BackupsPage