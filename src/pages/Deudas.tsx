import { useState } from 'react'
import { db, hoy, useDatos, type Deuda, type Movimiento } from '../db'
import { PAGO_TARJETA, cop, estadoDeuda, fechaCorta, leerValor, mesCorto, saldoTarjeta, simular } from '../lib/plata'
import { Campo, Fila, Tarjeta, botonSecundario, entrada } from '../ui'

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
    <div>
      <p className="text-xs text-suave">{dd.modoAbono === 'plazo' ? 'Un abono aquí reduce el plazo.' : 'Un abono aquí reduce la cuota.'}</p>
      <input inputMode="numeric" placeholder="$ valor del abono" aria-label="Valor del abono" value={abono ? cop(abono) : ''} onChange={(ev) => setTexto(ev.target.value)} className={`mt-2 ${entrada}`} />
      {abono > 0 && !s && <p className="mt-2 text-sm text-amber-900">Para simular, completa saldo y tasa abajo.</p>}
      {s?.modo === 'plazo' && (
        <div className="mt-2 text-sm">
          {e.restantes != null && isFinite(e.restantes) && <Fila izq="Cuotas que faltan" der={`${e.restantes} → ${e.restantes - (s.cuotasAntes - s.cuotasDespues)}`} />}
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

function TarjetaNubank({ t, movs, cambiar }: { t: Deuda; movs: Movimiento[]; cambiar: (c: Partial<Deuda>) => void }) {
  const saldo = saldoTarjeta(t, movs)
  const [texto, setTexto] = useState('')
  const valor = leerValor(texto) || saldo
  const pagos = movs.filter((m) => m.deudaId === t.id && m.tipo === 'gasto').sort((a, b) => a.fecha.localeCompare(b.fecha))
  const pagarTarjeta = async () => {
    if (!valor || !confirm(`¿Registrar pago de ${cop(valor)} a ${t.nombre} desde la cuenta?`)) return
    await db.movimientos.add({ fecha: hoy(), tipo: 'gasto', valor, categoria: PAGO_TARJETA, medio: 'cuenta', nota: `Pago ${t.nombre}`, deudaId: t.id, creado: Date.now() })
    setTexto('')
    if (valor >= saldo && t.tarjeta?.acumula && confirm('Quedó en $0. ¿Vuelves a pagar cada cargo el mismo día?'))
      cambiar({ tarjeta: { acumula: false, pagoFecha: null } })
  }
  return (
    <Tarjeta>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{t.nombre}</h2>
        <span className={`text-xl font-bold tabular-nums ${saldo > 0 ? 'text-red-700' : ''}`}>{cop(saldo)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Campo label="La pago el" tipo="fecha" valor={t.tarjeta?.pagoFecha} onGuardar={(v) => cambiar({ tarjeta: { acumula: !!t.tarjeta?.acumula, pagoFecha: (v as string) || null } })} />
      </div>
      {saldo > 0 && (
        <div className="mt-3 flex gap-2">
          <input inputMode="numeric" aria-label="Valor pagado" placeholder={cop(saldo)} value={leerValor(texto) ? cop(leerValor(texto)) : ''} onChange={(e) => setTexto(e.target.value)} className={entrada} />
          <button type="button" onClick={pagarTarjeta} className={`shrink-0 ${botonSecundario}`}>Pagué</button>
        </div>
      )}
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-suave">Ajustes e historial</summary>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-5" checked={!!t.tarjeta?.acumula} onChange={(e) => cambiar({ tarjeta: { pagoFecha: t.tarjeta?.pagoFecha ?? null, acumula: e.target.checked } })} />
          <span>Los cargos nuevos se suman aquí y salen de la cuenta cuando pagues la tarjeta.</span>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Campo label="Saldo real" valor={t.saldo} onGuardar={(v) => cambiar({ saldo: v as number | null })} />
          <Campo label="Al final del día" tipo="fecha" valor={t.saldoFecha} onGuardar={(v) => v && cambiar({ saldoFecha: v as string })} />
        </div>
        {pagos.length > 0 && (
          <ul className="mt-3 text-sm">
            {[...pagos].reverse().map((m) => (
              <li key={m.id} className="flex justify-between py-0.5"><span>Pago {fechaCorta(m.fecha)}</span><span className="tabular-nums">{cop(m.valor)}</span></li>
            ))}
          </ul>
        )}
        {t.notas && <p className="mt-2 text-xs text-suave">{t.notas}</p>}
      </details>
    </Tarjeta>
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
    <p className="text-sm text-suave">Aún no hay pagos. Las cuotas se marcan en Pagos.</p>
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
      <p className="mt-1 text-sm text-suave">Cuotas al mes: {cop(deudas.reduce((t, x) => t + x.cuota, 0))}</p>
      {!deudas.length && <Tarjeta><p className="text-sm text-suave">No hay deudas registradas. Se cargan con tu archivo de datos (Más → Restaurar).</p></Tarjeta>}

      {deudas.map((dd) => {
        if (dd.tarjeta) return <TarjetaNubank key={dd.id} t={dd} movs={d.movs} cambiar={(c) => cambiar(dd, c)} />
        const e = estadoDeuda(dd, d.movs, f)
        return (
          <Tarjeta key={dd.id}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{dd.nombre}</h2>
              <span className="tabular-nums text-suave">{cop(dd.cuota)}</span>
            </div>
            <p className="mt-1 text-sm text-suave">
              {e.saldo != null && <>Saldo {e.i != null && e.movs.length ? '≈' : ''}{cop(e.saldo)} · </>}
              {e.restantes != null && isFinite(e.restantes) ? `${e.restantes} cuotas` : 'cuotas por confirmar'}
              {e.ultima && <> · hasta {mesCorto(e.ultima)}</>}
            </p>
            <p className={`mt-1 text-sm ${e.cuotaDelMes ? 'text-emerald-800' : 'text-amber-900'}`}>{e.cuotaDelMes ? '✓ Al día este mes' : `Pendiente: día ${dd.dia}`}</p>
            {dd.enlace && <a href={dd.enlace} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-acento">Ir a pagar ↗</a>}
            {e.cuotaNueva && Math.abs(e.cuotaNueva - dd.cuota) > 500 && <p className="mt-1 text-sm">Cuota nueva ≈ {cop(e.cuotaNueva)}</p>}

            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm text-suave">Abonar y detalles</summary>
              <Simulador dd={dd} e={e} />
              <p className="mt-4 text-sm font-semibold">Pagos</p>
              {historial(e.movs)}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Campo label="Saldo" valor={dd.saldo} onGuardar={(v) => cambiar(dd, { saldo: v as number | null })} />
                <Campo label="Fecha del saldo" tipo="fecha" valor={dd.saldoFecha} onGuardar={(v) => v && cambiar(dd, { saldoFecha: v as string })} />
                <Campo label="Tasa E.A. (%)" tipo="porcentaje" valor={dd.tasaEA} onGuardar={(v) => cambiar(dd, { tasaEA: v as number | null })} />
                <Campo label="Cuotas restantes" tipo="numero" valor={dd.cuotasRestantes} onGuardar={(v) => cambiar(dd, { cuotasRestantes: v as number | null })} />
                <Campo label="Cuota" valor={dd.cuota} onGuardar={(v) => v && cambiar(dd, { cuota: v as number })} />
              </div>
              {dd.notas && <p className="mt-2 text-xs text-suave">{dd.notas}</p>}
            </details>
          </Tarjeta>
        )
      })}
    </>
  )
}
