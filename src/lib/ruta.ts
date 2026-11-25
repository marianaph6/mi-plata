import { useSyncExternalStore } from 'react'

const leer = () => location.hash.slice(1) || '/hoy'
const suscribir = (f: () => void) => {
  addEventListener('hashchange', f)
  return () => removeEventListener('hashchange', f)
}

/**
 * Rutas con hash (`#/hoy?accion=…`): GitHub Pages no necesita configuración y los Atajos de iOS
 * pueden abrir una pantalla concreta. Devuelve la ruta y sus parámetros.
 */
export function useRuta() {
  const [ruta, query = ''] = useSyncExternalStore(suscribir, leer).split('?')
  return { ruta, params: new URLSearchParams(query) }
}

export const ir = (ruta: string) => (location.hash = ruta)
