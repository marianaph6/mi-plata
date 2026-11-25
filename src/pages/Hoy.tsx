import { useEffect } from 'react'
import { db, hoy, pagar, useDatos, type Datos } from '../db'
import {
  cop,
  diasEntre,
  fechaCorta,
  fechaDe,
  flujo,
  igual,
  periodoDeFecha,
  periodoDeIngreso,
  proximos,
  reembolso,
  saldoTarjeta,
  siguiente,
  sumarDias,
  sumarMeses,
  type Periodo,
} from '../lib/plata'
import { ir, useRuta } from '../lib/ruta'
import { Fila, Tarjeta, botonPrincipal, botonSecundario } from '../ui'

const cuando = (faltan: number) =>
  faltan < 0 ? <span className="text-red-700">vencido</span> : faltan === 0 ? 'hoy' : faltan === 1 ? 'mañana' : `en ${faltan} días`

const hasta = (p: Periodo) => fechaCorta(fechaDe(p.mes, p.q === 1 ? 14 : 31))

/** Desglose del número grande: plegado, para quien quiera ver de dónde sale. */
function Detalle({ d, f, p }: { d: Datos; f: ReturnType<typeof flujo>; p: Periodo }) {
  const c = f.cuadre
  const separarReserva = () =>
    db.movimientos.add({ fecha: hoy(), tipo: 'reserva', valor: d.cfg.reserva, categoria: 'Pagos del 1', medio: 'cuenta', vence: fechaDe(p.mes, 15), creado: Date.now() })
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer py-1 text-suave">¿De dónde sale?</summary>
      <div className="mt-1 border-t border-linea pt-1">
        {c ? (
          <>
            <Fila suave izq={`Saldo en la cuenta (cuadre ${fechaCorta(c.fecha)})`} der={cop(c.saldo)} />
            {c.esperada > 0 && <Fila suave izq="Quincena por llegar" der={`+${cop(c.esperada)}`} />}
            <Fila suave izq="Fondo de emergencia" der={`−${cop(c.fondo)}`} />
            {c.guardar > 0 && <Fila suave izq="Pagos del 1" der={`−${cop(c.guardar)}`} />}
          </>
        ) : (
          <>
            <Fila suave izq={f.llego ? 'Quincena' : 'Quincena (esperada)'} der={cop(f.entra)} />
            {p.q === 1 && <Fila suave izq="Reserva Pagos del 1" der={`+${cop(f.entraReserva)}`} />}
            <Fila suave izq="Ya salió" der={`−${cop(f.salio)}`} />
            {p.q === 2 && <Fila suave izq={f.reservaHecha ? 'Pagos del 1 (separado)' : 'Separar Pagos del 1'} der={`−${cop(f.separar)}`} />}
          </>
        )}
        <Fila suave izq="Pagos por hacer" der={`−${cop(f.porPagar)}`} />
        {f.porGastar > 0 && <Fila suave izq={`Por gastar (${f.variables.map((v) => v.r.nombre.toLowerCase()).join(', ')})`} der={`−${cop(f.porGastar)}`} />}
        {!c && p.q === 2 && !f.reservaHecha && d.cfg.reserva > 0 && (
          <button type="button" onClick={separarReserva} className={`mt-2 w-full ${botonSecundario}`}>Ya separé {cop(d.cfg.reserva)}</button>
        )}
        <a href="#/mas" className="mt-2 inline-block font-semibold text-acento">{c ? 'Volver a cuadrar' : 'Cuadrar con mi cuenta'}</a>
      </div>
    </details>
  )
}

export function Hoy() {
  const { params } = useRuta()
  const d = useDatos()
  const guardado = params.get('guardado')
  useEffect(() => {
    if (!guardado) return
    const t = setTimeout(() => ir('/hoy'), 2500)
    return () => clearTimeout(t)
  }, [guardado])
  if (!d) return null

  const f = hoy()
  const dia = +f.slice(8)
  const p = periodoDeFecha(f)
  const actual = flujo(p, d, f)
  const sig = siguiente(p)
  const libreSig = flujo(sig, d).libre
  const pIngreso = periodoDeIngreso(f)
  const quincena = d.cfg.quincenas.find((x) => x.q === pIngreso.q)!
  const llego = d.movs.some((m) => m.tipo === 'ingreso' && m.categoria === 'Quincena' && igual(periodoDeIngreso(m.fecha), pIngreso))
  // Si cuadraste en esta misma quincena, la plata que ya llegó está dentro del saldo: registrarla la contaría dos veces.
  const cuadradaYa = !!d.cfg.cuadre && igual(periodoDeIngreso(d.cfg.cuadre.fecha), pIngreso)
  const avisos = proximos(d, f)
  const tarjetas = d.deudas
    .filter((t) => t.tarjeta)
    .map((t) => ({ t, saldo: saldoTarjeta(t, d.movs), fecha: t.tarjeta!.pagoFecha }))
    .filter((x) => x.saldo > 0 && (!x.fecha || x.fecha <= sumarDias(f, 7)))
  const cobros = d.recs.filter((r) => r.activo && r.compartido && r.compartido.proximo <= sumarDias(f, 7))
  const ultimos = [...d.movs].sort((a, b) => b.creado - a.creado).slice(0, 8)

  const cobrar = async (r: (typeof cobros)[number]) => {
    const debe = reembolso(r, d.movs)
    if (debe > 0) await db.movimientos.add({ fecha: f, tipo: 'ingreso', valor: debe, categoria: r.categoria, medio: 'cuenta', nota: `Reembolso ${r.nombre} de ${r.compartido!.con}`, recurrenteId: r.id, creado: Date.now() })
    await db.recurrentes.update(r.id!, { compartido: { ...r.compartido!, proximo: fechaDe(sumarMeses(r.compartido!.proximo.slice(0, 7), r.compartido!.cadaMeses), +r.compartido!.proximo.slice(8)) } })
  }
  const borrar = (id: number, texto: string) => confirm(`¿Borrar ${texto}?`) && db.movimientos.delete(id)

  if (!d.recs.length)
    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight">Hoy</h1>
        <Tarjeta>
          <p className="text-sm text-suave">Aún no hay datos. Abre tu archivo <b>mis-datos.json</b> desde <b>Más → Respaldo → Restaurar</b>.</p>
        </Tarjeta>
      </>
    )

  return (
    <>
      {guardado && (
        <p role="status" className="mb-3 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900">Guardado: {cop(+guardado)} ✓</p>
      )}

      <section className="pt-2">
        <p className="text-sm text-suave">Libre hasta el {hasta(p)}</p>
        <p className={`text-5xl font-bold tracking-tight tabular-nums ${actual.libre < 0 ? 'text-red-700' : ''}`}>{cop(actual.libre)}</p>
        {actual.libre < 0 && <p className="mt-1 text-sm text-red-700">Te faltan {cop(-actual.libre)} para esta quincena.</p>}
        <Detalle d={d} f={actual} p={p} />
      </section>

      <a href="#/gasto" className={`mt-4 block text-center ${botonPrincipal}`}>+ Gasto</a>
      {!llego && !cuadradaYa && quincena.valor > 0 && !(dia >= 10 && dia < 15) && (
        <a href={`#/gasto?tipo=ingreso&cat=Quincena&valor=${quincena.valor}`} className={`mt-2 block text-center ${botonSecundario}`}>
          Llegó la quincena
        </a>
      )}

      <Tarjeta titulo="Por pagar">
        <ul className="divide-y divide-linea">
          {tarjetas.map(({ t, saldo, fecha }) => (
            <li key={`t${t.id}`}>
              <a href="#/deudas" className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-medium">{t.nombre}</span>
                  <span className="text-sm text-suave">{fecha ? <>{fechaCorta(fecha)} · {cuando(diasEntre(f, fecha))}</> : 'elige la fecha de pago ›'}</span>
                </span>
                <span className="tabular-nums">{cop(saldo)}</span>
              </a>
            </li>
          ))}
          {avisos.map((o) => (
            <li key={o.r.id + o.vence} className="flex min-h-12 items-center gap-3 py-2">
              <button
                type="button"
                aria-label={`Marcar ${o.r.nombre} como pagado`}
                onClick={() => pagar(o.r, o.vence)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-linea text-acento active:bg-linea"
              >
                ✓
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{o.r.nombre}</span>
                <span className="text-sm text-suave">{fechaCorta(o.vence)} · {cuando(o.faltan)}</span>
              </span>
              <span className="tabular-nums">{cop(o.r.valor)}</span>
            </li>
          ))}
          {cobros.map((r) => (
            <li key={`c${r.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <span>
                <span className="block font-medium">Cobrar a {r.compartido!.con}</span>
                <span className="text-sm text-suave">{r.nombre} · {fechaCorta(r.compartido!.proximo)}</span>
              </span>
              <button type="button" onClick={() => cobrar(r)} className={botonSecundario}>Me pagó {cop(reembolso(r, d.movs))}</button>
            </li>
          ))}
        </ul>
        {!avisos.length && !tarjetas.length && !cobros.length && <p className="text-sm text-suave">Nada esta semana. 🎉</p>}
      </Tarjeta>

      <p className="mt-3 flex justify-between px-1 text-sm text-suave">
        <span>Siguiente quincena (del {sig.q === 1 ? 1 : 15} al {hasta(sig)})</span>
        <span className={`tabular-nums ${libreSig < 0 ? 'text-red-700' : ''}`}>{cop(libreSig)}</span>
      </p>

      {ultimos.length > 0 && (
        <details className="mt-3 rounded-2xl border border-linea bg-papel px-4">
          <summary className="min-h-12 cursor-pointer py-3 font-semibold">Últimos movimientos</summary>
          <ul className="divide-y divide-linea pb-2">
            {ultimos.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => borrar(m.id!, `${m.nota ?? m.categoria} por ${cop(m.valor)}`)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate">{m.nota ?? m.categoria}</span>
                    <span className="text-sm text-suave">{fechaCorta(m.fecha)}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${m.tipo === 'ingreso' ? 'text-emerald-700' : ''}`}>
                    {m.tipo === 'ingreso' ? '+' : '−'}
                    {cop(m.valor)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="pb-3 text-xs text-suave">Toca uno para borrarlo.</p>
        </details>
      )}
    </>
  )
}
