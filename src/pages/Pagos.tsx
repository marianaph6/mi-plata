import { useState } from 'react'
import { db, hoy, pagar, useDatos } from '../db'
import { cop, fechaCorta, leerValor, nombreMes, ocurrencias, pagoDe, presupuesto, sumarMeses } from '../lib/plata'
import { Etiqueta, Fila, Tarjeta, botonSecundario, entrada } from '../ui'

export function Pagos() {
  const d = useDatos()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [abierto, setAbierto] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  if (!d) return null

  const lista = ocurrencias(d.recs, mes)
    .map((o) => ({ ...o, pago: pagoDe(d.movs, o.r, mes), antes: o.vence < d.cfg.inicio }))
    .sort((a, b) => a.vence.localeCompare(b.vence))
  const cuentan = lista.filter((o) => o.pago || !o.antes) // lo que vencía antes de empezar a usar la app no cuenta como pendiente
  const total = cuentan.reduce((t, o) => t + (o.pago?.valor ?? o.r.valor), 0)
  const pagado = cuentan.reduce((t, o) => t + (o.pago?.valor ?? 0), 0)
  const categorias = presupuesto(mes, d)
  const planTotal = categorias.reduce((t, c) => t + c.plan, 0)
  const realTotal = categorias.reduce((t, c) => t + c.real, 0)
  const tope = Math.max(...categorias.map((c) => Math.max(c.plan, c.real)), 1)

  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))} className="size-11 text-2xl text-suave">‹</button>
        <h1 className="text-2xl font-bold tracking-tight first-letter:uppercase">{nombreMes(mes)}</h1>
        <button type="button" aria-label="Mes siguiente" onClick={() => setMes(sumarMeses(mes, 1))} className="size-11 text-2xl text-suave">›</button>
      </div>

      <Tarjeta>
        <Fila izq="Pagado" der={cop(pagado)} />
        <Fila izq="Falta" der={<b>{cop(total - pagado)}</b>} />
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-linea">
          <div className="h-full rounded-full bg-acento" style={{ width: `${(pagado / (total || 1)) * 100}%` }} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Pagos del mes">
        <ul className="divide-y divide-linea">
          {lista.map(({ r, vence, pago, antes }) => {
            const clave = `${r.id}`
            const marcar = async (v = r.valor) => {
              await pagar(r, vence, v)
              setAbierto(null)
            }
            return (
              <li key={clave} className="py-2">
                <div className={`flex items-center gap-3 ${antes && !pago ? 'opacity-50' : ''}`}>
                  <button
                    type="button"
                    aria-label={pago ? `Desmarcar ${r.nombre}` : `Marcar ${r.nombre} como pagado`}
                    aria-pressed={!!pago}
                    onClick={() => (pago ? confirm(`¿Desmarcar ${r.nombre}?`) && db.movimientos.delete(pago.id!) : marcar())}
                    className={`flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-lg ${pago ? 'border-acento bg-acento text-white' : 'border-linea text-transparent'}`}
                  >
                    ✓
                  </button>
                  <button type="button" onClick={() => { setAbierto(abierto === clave ? null : clave); setValor(String(r.valor)) }} className="min-w-0 flex-1 text-left">
                    <span className={`block truncate font-medium ${pago ? 'text-suave line-through' : ''}`}>{r.nombre}</span>
                    <span className="text-sm text-suave">
                      {fechaCorta(vence)} · {r.medio === 'nubank' ? 'Nubank' : 'Cuenta'}
                      {r.enRevision && <Etiqueta color="bg-amber-100 text-amber-900">en revisión</Etiqueta>}
                      {r.estimado && !pago && <Etiqueta>estimado</Etiqueta>}
                      {antes && !pago && <Etiqueta>antes de usar la app</Etiqueta>}
                    </span>
                  </button>
                  <span className="tabular-nums">{cop(pago?.valor ?? r.valor)}</span>
                </div>
                {abierto === clave && !pago && (
                  <div className="mt-2 flex gap-2 pl-14">
                    <input inputMode="numeric" aria-label="Valor real" value={valor} onChange={(e) => setValor(e.target.value)} className={entrada} />
                    <button type="button" onClick={() => marcar(leerValor(valor) || r.valor)} className={`shrink-0 ${botonSecundario}`}>Pagado</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-1 text-xs text-suave">Toca el nombre para pagar un valor distinto (por ejemplo EPM).</p>
      </Tarjeta>

      <Tarjeta titulo="Presupuesto vs. real">
        <ul className="space-y-3">
          {categorias.map((c) => {
            const pasado = c.plan > 0 && c.real > c.plan
            return (
              <li key={c.categoria}>
                <div className="flex justify-between text-sm">
                  <span>{c.categoria}{!c.plan && <Etiqueta>sin presupuesto</Etiqueta>}</span>
                  <span className={`tabular-nums ${pasado ? 'font-semibold text-red-700' : 'text-suave'}`}>
                    {cop(c.real)}{c.plan > 0 && ` de ${cop(c.plan)}`}
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-linea">
                  {c.plan > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-black/10" style={{ width: `${(c.plan / tope) * 100}%` }} />}
                  <div className={`absolute inset-y-0 left-0 rounded-full ${pasado ? 'bg-red-600' : 'bg-acento'}`} style={{ width: `${(Math.max(c.real, 0) / tope) * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-3 border-t border-linea pt-2">
          <Fila izq="Total del mes" der={`${cop(realTotal)} de ${cop(planTotal)}`} />
        </div>
      </Tarjeta>
    </>
  )
}
