import { useState } from 'react'
import { db, hoy, pagar, useDatos, type Recurrente } from '../db'
import { cop, fechaCorta, leerValor, mesCorto, nombreMes, ocurrencias, pagoDe, pausado, presupuesto, sumarMeses } from '../lib/plata'
import { Seccion, botonSecundario, entrada } from '../ui'

export function Pagos() {
  const d = useDatos()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const [abierto, setAbierto] = useState<number | null>(null)
  const [valor, setValor] = useState('')
  if (!d) return null

  // Lo que vencía antes de empezar a usar la app y no se marcó, no se muestra.
  const lista = ocurrencias(d.recs, mes)
    .map((o) => ({ ...o, pago: pagoDe(d.movs, o.r, mes) }))
    .filter((o) => o.pago || o.vence >= d.cfg.inicio)
    .sort((a, b) => a.vence.localeCompare(b.vence))
  const falta = lista.reduce((t, o) => t + (o.pago ? 0 : o.r.valor), 0)
  const enPausa = d.recs.filter((r) => r.activo && pausado(r, mes))
  const categorias = presupuesto(mes, d)
  const planTotal = categorias.reduce((t, c) => t + c.plan, 0)
  const realTotal = categorias.reduce((t, c) => t + c.real, 0)
  const tope = Math.max(...categorias.map((c) => Math.max(c.plan, c.real)), 1)
  // Pausar solo este mes; si ya venía pausado hasta este mes, se alarga.
  const pausarMes = (r: Recurrente) =>
    db.recurrentes.update(r.id!, { pausa: { desde: r.pausa?.hasta === mes ? r.pausa.desde : mes, hasta: sumarMeses(mes, 1) } })

  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))} className="size-11 text-2xl text-suave">‹</button>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight first-letter:uppercase">{nombreMes(mes)}</h1>
          <p className="text-sm text-suave">{falta ? `Falta ${cop(falta)}` : 'Todo pagado ✓'}</p>
        </div>
        <button type="button" aria-label="Mes siguiente" onClick={() => setMes(sumarMeses(mes, 1))} className="size-11 text-2xl text-suave">›</button>
      </div>

      <ul className="mt-4 divide-y divide-linea rounded-2xl border border-linea bg-papel px-4">
        {lista.map(({ r, vence, pago }) => {
          const marcar = async (v = r.valor) => {
            await pagar(r, vence, v)
            setAbierto(null)
          }
          return (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={pago ? `Desmarcar ${r.nombre}` : `Marcar ${r.nombre} como pagado`}
                  aria-pressed={!!pago}
                  onClick={() => (pago ? confirm(`¿Desmarcar ${r.nombre}?`) && db.movimientos.delete(pago.id!) : marcar())}
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${pago ? 'border-acento bg-acento text-white' : 'border-linea text-transparent'}`}
                >
                  ✓
                </button>
                <button type="button" onClick={() => { setAbierto(abierto === r.id ? null : r.id!); setValor(String(r.valor)) }} className="min-w-0 flex-1 text-left">
                  <span className={`block truncate ${pago ? 'text-suave line-through' : 'font-medium'}`}>{r.nombre}</span>
                  <span className="text-sm text-suave">{fechaCorta(vence)}</span>
                </button>
                <span className={`tabular-nums ${pago ? 'text-suave' : ''}`}>{cop(pago?.valor ?? r.valor)}</span>
              </div>
              {abierto === r.id && !pago && (
                <div className="mt-2 space-y-2 pl-13">
                  <div className="flex gap-2">
                    <input inputMode="numeric" aria-label="Valor real" value={valor} onChange={(e) => setValor(e.target.value)} className={entrada} />
                    <button type="button" onClick={() => marcar(leerValor(valor) || r.valor)} className={`shrink-0 ${botonSecundario}`}>Pagado</button>
                  </div>
                  {r.categoria !== 'Ahorro' && (
                    <button type="button" onClick={() => pausarMes(r)} className={`w-full ${botonSecundario}`}>No lo pago este mes</button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-1 px-1 text-xs text-suave">Toca el nombre para otro valor o para saltarlo este mes.</p>

      {enPausa.length > 0 && (
        <Seccion titulo="En pausa" resumen={enPausa.length}>
          <ul className="divide-y divide-linea">
            {enPausa.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{r.nombre}</span>
                  <span className="text-sm text-suave">vuelve en {mesCorto(r.pausa!.hasta)}</span>
                </span>
                <button type="button" onClick={() => db.recurrentes.update(r.id!, { pausa: undefined })} className={`shrink-0 ${botonSecundario}`}>Reactivar</button>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion titulo="Presupuesto" resumen={`${cop(realTotal)} de ${cop(planTotal)}`}>
        <ul className="space-y-3">
          {categorias.map((c) => {
            const pasado = c.plan > 0 && c.real > c.plan
            return (
              <li key={c.categoria}>
                <div className="flex justify-between text-sm">
                  <span>{c.categoria}</span>
                  <span className={`tabular-nums ${pasado ? 'font-semibold text-red-700' : 'text-suave'}`}>
                    {cop(c.real)}{c.plan > 0 && ` / ${cop(c.plan)}`}
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 rounded-full bg-linea">
                  <div className={`absolute inset-y-0 left-0 rounded-full ${pasado ? 'bg-red-600' : 'bg-acento'}`} style={{ width: `${Math.min(100, (Math.max(c.real, 0) / (c.plan || tope)) * 100)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </Seccion>
    </>
  )
}
