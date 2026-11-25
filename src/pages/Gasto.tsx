import { useState } from 'react'
import { db, hoy, useDatos, type Medio } from '../db'
import { GASTOS, INGRESOS, leerValor, sinSigno } from '../lib/plata'
import { ir, useRuta } from '../lib/ruta'
import { botonPrincipal, entrada } from '../ui'

/** Registro rápido. `#/gasto` desde el Atajo; `#/gasto?tipo=ingreso&cat=Quincena&valor=…` para ingresos. */
export function Gasto() {
  const { params } = useRuta()
  const esIngreso = params.get('tipo') === 'ingreso'
  const d = useDatos()
  const [valor, setValor] = useState(params.get('valor') ?? '')
  const [categoria, setCategoria] = useState(params.get('cat') ?? (esIngreso ? 'Quincena' : 'Mercado'))
  const [medio, setMedio] = useState<Medio>('cuenta')
  const [fecha, setFecha] = useState(hoy())
  const [nota, setNota] = useState('')
  const v = leerValor(valor)
  const pedida = params.get('cat')
  const categorias = [...new Set([...(pedida ? [pedida] : []), ...(esIngreso ? INGRESOS : [...GASTOS, ...(d?.recs ?? []).map((r) => r.categoria)])])]

  const guardar = async () => {
    if (!v) return
    await db.movimientos.add({
      fecha,
      tipo: esIngreso ? 'ingreso' : 'gasto',
      valor: v,
      categoria,
      medio: esIngreso ? 'cuenta' : medio,
      nota: nota.trim() || undefined,
      creado: Date.now(),
    })
    ir(`/hoy?guardado=${v}`)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{esIngreso ? 'Nuevo ingreso' : 'Nuevo gasto'}</h1>
        <a href="#/hoy" className="px-2 py-2 text-suave">
          Cancelar
        </a>
      </div>

      <label className="mt-4 flex items-baseline gap-1 rounded-2xl border border-linea bg-papel px-4 py-3">
        <span className="text-3xl font-semibold text-suave">$</span>
        <input
          autoFocus
          inputMode="numeric"
          enterKeyHint="done"
          aria-label="Valor"
          placeholder="0"
          value={v ? sinSigno(v) : ''}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
          className="w-full bg-transparent text-4xl font-bold tabular-nums outline-none"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Categoría">
        {categorias.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === categoria}
            onClick={() => setCategoria(c)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${c === categoria ? 'border-acento bg-acento text-white' : 'border-linea bg-papel'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {!esIngreso && (
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-linea p-1" role="radiogroup" aria-label="Medio de pago">
          {(['cuenta', 'nubank'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === medio}
              onClick={() => setMedio(m)}
              className={`min-h-11 rounded-xl font-semibold ${m === medio ? 'bg-papel shadow-sm' : 'text-suave'}`}
            >
              {m === 'cuenta' ? 'Cuenta' : 'Nubank'}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={guardar} disabled={!v} className={`mt-4 ${botonPrincipal}`}>
        Guardar
      </button>

      <div className="mt-6 grid grid-cols-[auto_1fr] items-center gap-3 text-sm">
        <span className="text-suave">Fecha</span>
        <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value || hoy())} className={entrada} />
        <span className="text-suave">Nota</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" className={entrada} />
      </div>
    </>
  )
}
