import { useState } from 'react'
import { db, hoy, useDatos, type Deuda, type Movimiento } from '../db'
import { cop, estadoDeuda, fechaCorta, leerValor, mesCorto, simular } from '../lib/plata'
import { Campo, Etiqueta, Fila, Tarjeta, botonSecundario, entrada } from '../ui'

function Simulador({ dd, e }: { dd: Deuda; e: ReturnType<typeof estadoDeuda> }) {
  const [texto, setTexto] = useState('')
  const abono = leerValor(texto)
  const s = simular(dd, e, abono)
  const registrar = async () => {
    const regla = dd.modoAbono === 'plazo' ? 'abono a capital con reducción de plazo' : 'abono a capital'
    if (!confirm(`¿Registrar un abono de ${cop(abono)} a ${dd.nombre}?\n\nRecuerda pedirlo como "${regla}".`)) return
    await db.movimientos.add({ fecha: hoy(), tipo: 'gasto', valor: abono, categoria: 'Deudas', medio: 'cuenta', nota: `Abono ${dd.nombre}`, deudaId: dd.id, abono: true, creado: Date.now() })
    setTexto('')
  }
  return (
    <div className="mt-3 rounded-xl bg-fondo p-3">
      <p className="text-sm font-semibold">Simular un abono extra</p>
      <p className="text-xs text-suave">{dd.modoAbono === 'plazo' ? 'Aquí un abono reduce el plazo: misma cuota, terminas antes.' : 'Aquí un abono reduce la cuota: mismo plazo, pagas menos cada mes.'}</p>
      <input inputMode="numeric" placeholder="$ valor del abono" aria-label="Valor del abono" value={abono ? cop(abono) : ''} onChange={(ev) => setTexto(ev.target.value)} className={`mt-2 ${entrada}`} />
      {abono > 0 && !s && <p className="mt-2 text-sm text-amber-900">Para simular, completa el saldo{dd.modoAbono === 'cuota' ? ', las cuotas restantes' : ''} y la tasa abajo.</p>}
      {s?.modo === 'plazo' && (
        <div className="mt-2 text-sm">
          <Fila izq="Cuotas que faltan" der={`${s.cuotasAntes} → ${s.cuotasDespues}`} />
          <Fila izq="Terminas antes" der={`${s.cuotasAntes - s.cuotasDespues} meses`} />
          <Fila izq="Te ahorras en intereses" der={<b>{cop(s.interesesAhorrados)}</b>} />
        </div>
      )}
      {s?.modo === 'cuota' && (
        <div className="mt-2 text-sm">
          <Fila izq="Cuota mensual" der={`${cop(s.cuotaAntes)} → ${cop(s.cuotaDespues)}`} />
          <Fila izq="Te ahorras en intereses" der={<b>{cop(s.interesesAhorrados)}</b>} />
        </div>
      )}
      {abono > 0 && (
        <button type="button" onClick={registrar} className={`mt-2 w-full ${botonSecundario}`}>
          Ya lo hice: registrar abono
        </button>
      )}
    </div>
  )
}

const historial = (ms: Movimiento[]) =>
  ms.length ? (
    <ul className="mt-1 text-sm">
      {[...ms].reverse().map((m) => (
        <li key={m.id} className="flex justify-between py-0.5">
          <span>
            {fechaCorta(m.fecha)} · {m.abono ? 'Abono' : 'Cuota'}
          </span>
          <span className="tabular-nums">{cop(m.valor)}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="mt-1 text-sm text-suave">Aún no hay pagos registrados. Las cuotas se marcan en Pagos.</p>
  )

export function Deudas() {
  const d = useDatos()
  if (!d) return null
  const f = hoy()
  const deudas = [...d.deudas].sort((a, b) => a.prioridad - b.prioridad)
  const cambiar = (dd: Deuda, cambio: Partial<Deuda>) => {
    db.deudas.update(dd.id!, cambio)
    // la cuota del pago recurrente sigue a la de la deuda
    if (cambio.cuota != null) for (const r of d.recs) if (r.deudaId === dd.id) db.recurrentes.update(r.id!, { valor: cambio.cuota })
  }

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Deudas</h1>
      <p className="mt-1 text-suave">Cuotas al mes: {cop(deudas.reduce((t, x) => t + x.cuota, 0))}</p>
      {!deudas.length && <Tarjeta><p className="text-sm text-suave">No hay deudas registradas. Se cargan con tu archivo de datos (Más → Restaurar).</p></Tarjeta>}

      {deudas.map((dd) => {
        const e = estadoDeuda(dd, d.movs, f)
        return (
          <Tarjeta key={dd.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{dd.nombre}</h2>
                <p className="text-sm text-suave">{dd.entidad} · día {dd.dia}</p>
              </div>
              <Etiqueta>abonos: #{dd.prioridad}</Etiqueta>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Dato titulo="Cuota" valor={cop(dd.cuota)} nota={e.cuotaNueva && Math.abs(e.cuotaNueva - dd.cuota) > 500 ? `nueva ≈ ${cop(e.cuotaNueva)}` : undefined} />
              <Dato titulo="Saldo" valor={e.saldo == null ? null : `${e.i != null && e.movs.length ? '≈' : ''}${cop(e.saldo)}`} />
              <Dato titulo="Cuotas restantes" valor={e.restantes == null ? null : isFinite(e.restantes) ? String(e.restantes) : '∞'} nota={`${e.cuotasPagadas} pagadas aquí`} />
              <Dato titulo="Última cuota" valor={e.ultima ? `≈ ${mesCorto(e.ultima)}` : null} />
            </div>
            <p className={`mt-3 text-sm ${e.cuotaDelMes ? 'text-emerald-800' : 'text-amber-900'}`}>{e.cuotaDelMes ? '✓ Cuota de este mes al día' : `Cuota de este mes pendiente (día ${dd.dia})`}</p>
            {dd.notas && <p className="mt-1 text-sm text-suave">{dd.notas}</p>}
            {dd.enlace && <a href={dd.enlace} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-acento">Ir a pagar ↗</a>}

            <Simulador dd={dd} e={e} />

            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Historial</summary>
              {historial(e.movs)}
            </details>
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Editar datos</summary>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Saldo" valor={dd.saldo} onGuardar={(v) => cambiar(dd, { saldo: v as number | null })} />
                <Campo label="Fecha del saldo" tipo="fecha" valor={dd.saldoFecha} onGuardar={(v) => v && cambiar(dd, { saldoFecha: v as string })} />
                <Campo label="Tasa E.A. (%)" tipo="porcentaje" valor={dd.tasaEA} onGuardar={(v) => cambiar(dd, { tasaEA: v as number | null })} />
                <Campo label="Cuotas restantes" tipo="numero" valor={dd.cuotasRestantes} onGuardar={(v) => cambiar(dd, { cuotasRestantes: v as number | null })} />
                <Campo label="Cuota" valor={dd.cuota} onGuardar={(v) => v && cambiar(dd, { cuota: v as number })} />
              </div>
              <p className="mt-2 text-xs text-suave">Saldo y cuotas restantes son los de la fecha del saldo (por ejemplo, el del último extracto). Los pagos que registres después se descuentan solos.</p>
            </details>
          </Tarjeta>
        )
      })}
    </>
  )
}

const Dato = ({ titulo, valor, nota }: { titulo: string; valor: string | null; nota?: string }) => (
  <div>
    <p className="text-xs text-suave">{titulo}</p>
    {valor == null ? <p className="font-semibold text-amber-900">Por confirmar</p> : <p className="font-semibold tabular-nums">{valor}</p>}
    {nota && <p className="text-xs text-suave">{nota}</p>}
  </div>
)
