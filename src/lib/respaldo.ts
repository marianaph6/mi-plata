import { db, hoy } from '../db'

const APP = 'mi-plata'

/** Copia de todos los datos en un .json. shortcut: no incluye Blobs (fotos); si la app guarda fotos, usa un .zip con JSZip. */
export async function exportar(): Promise<File> {
  const datos: Record<string, unknown[]> = {}
  for (const t of db.tables) datos[t.name] = await t.toArray()
  const json = JSON.stringify({ app: APP, version: db.verno, exportado: new Date().toISOString(), datos })
  return new File([json], `${APP}-${hoy()}.json`, { type: 'application/json' })
}

/** Reemplaza todo con el contenido del respaldo. Valida el archivo antes de borrar nada. */
export async function importar(archivo: File) {
  let j: { app?: string; datos?: Record<string, unknown> }
  try {
    j = JSON.parse(await archivo.text())
  } catch {
    throw new Error('El archivo no es un respaldo válido.')
  }
  const datos = j.datos
  if (j.app !== APP || !datos || db.tables.some((t) => datos[t.name] !== undefined && !Array.isArray(datos[t.name])))
    throw new Error('Este archivo no es un respaldo de esta app.')
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear()
      await t.bulkAdd((datos[t.name] as object[] | undefined) ?? [])
    }
  })
}

/** En el iPhone abre la hoja de compartir (Guardar en Archivos / iCloud); en otros navegadores descarga. */
export async function guardar(archivo: File) {
  if (navigator.canShare?.({ files: [archivo] })) return navigator.share({ files: [archivo] })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(archivo), download: archivo.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
