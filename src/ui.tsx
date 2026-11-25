import type { ReactNode } from 'react'
import { leerValor, sinSigno } from './lib/plata'

export const Tarjeta = ({ titulo, children, className = '' }: { titulo?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`mt-4 rounded-2xl border border-linea bg-papel p-4 ${className}`}>
    {titulo && <h2 className="mb-2 font-semibold">{titulo}</h2>}
    {children}
  </section>
)

export const Fila = ({ izq, der, suave = false }: { izq: ReactNode; der: ReactNode; suave?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-3 py-1 ${suave ? 'text-sm text-suave' : ''}`}>
    <span>{izq}</span>
    <span className="shrink-0 tabular-nums">{der}</span>
  </div>
)

export const Etiqueta = ({ children, color = 'bg-linea text-tinta' }: { children: ReactNode; color?: string }) => (
  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>{children}</span>
)

export const botonPrincipal = 'w-full rounded-2xl bg-acento py-4 text-lg font-semibold text-white active:opacity-80 disabled:opacity-40'
export const botonSecundario = 'rounded-full border border-linea bg-papel px-4 py-2 font-semibold active:bg-linea'
export const entrada = 'w-full rounded-xl border border-linea bg-fondo px-3 py-2 text-base'

/** Campo que guarda al salir. `tipo` decide cómo se muestra y se lee. Vacío = null (dato por confirmar). */
export function Campo({
  label,
  valor,
  tipo = 'pesos',
  onGuardar,
}: {
  label: string
  valor: string | number | null | undefined
  tipo?: 'pesos' | 'numero' | 'porcentaje' | 'texto' | 'fecha'
  onGuardar: (v: string | number | null) => void
}) {
  const mostrar =
    valor == null || valor === ''
      ? ''
      : tipo === 'pesos'
        ? sinSigno(+valor)
        : tipo === 'porcentaje'
          ? String(Math.round(+valor * 10000) / 100).replace('.', ',')
          : String(valor)
  const leer = (s: string) => {
    if (tipo === 'texto' || tipo === 'fecha') return s.trim()
    if (s.trim() === '') return null
    if (tipo === 'porcentaje') return Number(s.replace(',', '.')) / 100 || null
    return leerValor(s)
  }
  return (
    <label className="block text-sm">
      <span className="text-suave">
        {label}
        {mostrar === '' && tipo !== 'texto' && <Etiqueta color="bg-amber-100 text-amber-900">por confirmar</Etiqueta>}
      </span>
      <input
        key={mostrar}
        defaultValue={mostrar}
        type={tipo === 'fecha' ? 'date' : 'text'}
        inputMode={tipo === 'pesos' || tipo === 'numero' ? 'numeric' : tipo === 'porcentaje' ? 'decimal' : undefined}
        placeholder={tipo === 'porcentaje' ? 'ej. 7,1' : tipo === 'pesos' ? '0' : ''}
        onBlur={(e) => {
          const v = leer(e.target.value)
          if (v !== leer(mostrar)) onGuardar(v)
        }}
        className={`mt-1 ${entrada}`}
      />
    </label>
  )
}
