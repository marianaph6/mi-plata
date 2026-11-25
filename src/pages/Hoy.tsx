import { useEffect } from 'react'
import { db, hoy, pagar, useDatos, type Datos } from '../db'
import {
  cop,
  diasEntre,
  fechaCorta,
  fechaDe,
  fechaLarga,
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
import { Etiqueta, Fila, Tarjeta, botonPrincipal, botonSecundario } from '../ui'

const cuandoVence = (faltan: number) =>
  faltan < 0 ? <Etiqueta color="bg-red-100 text-red-800">vencido</Etiqueta>
  : faltan === 0 ? <Etiqueta color="bg-amber-100 text-amber-900">hoy</Etiqueta>
  : faltan === 1 ? <Etiqueta color="bg-amber-100 text-amber-900">mañana</Etiqueta>
  : <Etiqueta>en {faltan} días</Etiqueta>

const hasta = (p: Periodo) => fechaCorta(fechaDe(p.mes, p.q === 1 ? 14 : 31))

function Quincena({ d, p, actual }: { d: Datos; p: Periodo; actual: boolean }) {
  const f = flujo(p, d, actual ? hoy() : undefined)
  const c = f.cuadre
  const separarReserva = () =>
    db.movimientos.add({ fecha: hoy(), tipo: 'reserva', valor: d.cfg.reserva, categoria: 'Pagos del 1', medio: 'cuenta', vence: fechaDe(p.mes, 15), creado: Date.now() })
  const pagos = (
    <Fila suave izq={`Pagos por hacer (${f.pendientes.length + f.tarjetas.length})`} der={`−${cop(f.porPagar)}`} />
  )
  const porGastar = f.variables.length > 0 && (
    <Fila suave izq={`Por gastar: ${f.variables.map((v) => v.r.nombre.toLowerCase()).join(', ')}`} der={`−${cop(f.porGastar)}`} />
  )
  return (
    <Tarjeta className={actual ? '' : 'opacity-90'}>
      <p className="text-sm text-suave">{actual ? `Libre hasta el ${hasta(p)}` : `Siguiente: del ${p.q === 1 ? 1 : 15} al ${hasta(p)}`}</p>
      <p className={`font-bold tracking-tight tabular-nums ${actual ? 'text-4xl' : 'text-2xl'} ${f.libre < 0 ? 'text-red-700' : ''}`}>{cop(f.libre)}</p>
      {actual && f.libre < 0 && <p className="text-sm text-red-700">Te faltan {cop(-f.libre)} para cubrir esta quincena.</p>}
      {c ? (
        <div className="mt-2 border-t border-linea pt-2">
          <Fila suave izq={<>Saldo en la cuenta<Etiqueta>cuadre {fechaCorta(c.fecha)}</Etiqueta></>} der={cop(c.saldo)} />
          {c.esperada > 0 && <Fila suave izq={<>Entra · {f.nombre.toLowerCase()}<Etiqueta>esperada</Etiqueta></>} der={`+${cop(c.esperada)}`} />}
          <Fila suave izq="Fondo de emergencia (no se toca)" der={`−${cop(c.fondo)}`} />
          {c.guardar > 0 && <Fila suave izq="Pagos del 1 (guardado)" der={`−${cop(c.guardar)}`} />}
          {pagos}
          {porGastar}
          <a href="#/mas" className="mt-1 inline-block text-sm font-semibold text-acento">Volver a cuadrar</a>
        </div>
      ) : (
        <div className="mt-2 border-t border-linea pt-2">
          <Fila suave izq={<>Entra · {f.nombre.toLowerCase()}{!f.llego && <Etiqueta>esperada</Etiqueta>}</>} der={cop(f.entra)} />
          {p.q === 1 && <Fila suave izq={<>Reserva Pagos del 1{!f.entraReserva && <Etiqueta color="bg-red-100 text-red-800">no separada</Etiqueta>}</>} der={`+${cop(f.entraReserva)}`} />}
          {actual && <Fila suave izq="Ya salió" der={`−${cop(f.salio)}`} />}
          {pagos}
          {porGastar}
          {p.q === 2 && <Fila suave izq={<>Separar Pagos del 1{f.reservaHecha && <Etiqueta color="bg-emerald-100 text-emerald-900">hecho</Etiqueta>}</>} der={`−${cop(f.separar)}`} />}
          {actual && <a href="#/mas" className="mt-1 inline-block text-sm font-semibold text-acento">Cuadrar con mi cuenta</a>}
        </div>
      )}
      {actual && !c && p.q === 2 && !f.reservaHecha && d.cfg.reserva > 0 && (
        <button type="button" onClick={separarReserva} className={`mt-3 w-full ${botonSecundario}`}>
          Ya separé {cop(d.cfg.reserva)} en Pagos del 1
        </button>
      )}
    </Tarjeta>
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
  const pIngreso = periodoDeIngreso(f)
  const quincena = d.cfg.quincenas.find((x) => x.q === pIngreso.q)!
  const llego = d.movs.some((m) => m.tipo === 'ingreso' && m.categoria === 'Quincena' && igual(periodoDeIngreso(m.fecha), pIngreso))
  // Si cuadraste en esta misma quincena, la plata que ya llegó está dentro del saldo: registrarla la contaría dos veces.
  const cuadradaYa = !!d.cfg.cuadre && igual(periodoDeIngreso(d.cfg.cuadre.fecha), pIngreso)
  const avisos = proximos(d, f)
  const acumula = d.deudas.some((t) => t.tarjeta?.acumula)
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
        <Tarjeta titulo="Empieza aquí">
          <p className="text-sm text-suave">
            Todavía no hay datos. Pasa tu archivo <b>mis-datos.json</b> a este teléfono y ábrelo desde <b>Más → Restaurar</b>, o agrega tus pagos en <b>Más</b>.
          </p>
          <a href="#/mas" className={`mt-3 inline-block ${botonSecundario}`}>Ir a Más</a>
        </Tarjeta>
      </>
    )

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Hoy</h1>
      <p className="mt-1 first-letter:uppercase text-suave">{fechaLarga(f)}</p>
      {guardado && (
        <p role="status" className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900">
          Guardado: {cop(+guardado)} ✓
        </p>
      )}

      <a href="#/gasto" className={`mt-4 block text-center ${botonPrincipal}`}>+ Gasto</a>

      {!llego && !cuadradaYa && quincena.valor > 0 && !(dia >= 10 && dia < 15) && (
        <a href={`#/gasto?tipo=ingreso&cat=Quincena&valor=${quincena.valor}`} className={`mt-2 block text-center ${botonSecundario}`}>
          ¿Llegó la {quincena.nombre.toLowerCase()}? Regístrala
        </a>
      )}

      <Quincena d={d} p={p} actual />

      <Tarjeta titulo="Próximos 7 días">
        {tarjetas.map(({ t, saldo, fecha }) => (
          <a key={t.id} href="#/deudas" className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm">
            <span>
              <b>{t.nombre}</b>: debes {cop(saldo)}
              {fecha ? <> · pagar el {fechaCorta(fecha)}{cuandoVence(diasEntre(f, fecha))}</> : ' · elige la fecha de pago'}
            </span>
            <span aria-hidden>›</span>
          </a>
        ))}
        {!avisos.length && <p className="text-sm text-suave">Nada por pagar esta semana. 🎉</p>}
        <ul className="divide-y divide-linea">
          {avisos.map((o) => (
            <li key={o.r.id + o.vence} className="flex items-center gap-3 py-2">
              <button
                type="button"
                aria-label={`Marcar ${o.r.nombre} como pagado`}
                onClick={() => pagar(o.r, o.vence)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-linea text-lg text-acento active:bg-linea"
              >
                ✓
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{o.r.nombre}</p>
                <p className="text-sm text-suave">
                  {fechaCorta(o.vence)} · {o.r.medio === 'nubank' ? (acumula ? 'se suma a Nubank' : 'Nubank') : 'Cuenta'}
                  {cuandoVence(o.faltan)}
                </p>
              </div>
              <span className="tabular-nums">{o.r.estimado ? '≈' : ''}{cop(o.r.valor)}</span>
            </li>
          ))}
        </ul>
        {cobros.map((r) => (
          <div key={r.id} className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-fondo p-3 text-sm">
            <span>
              Cobrarle a {r.compartido!.con} {cop(reembolso(r, d.movs))} de {r.nombre} ({fechaCorta(r.compartido!.proximo)})
            </span>
            <button type="button" onClick={() => cobrar(r)} className={botonSecundario}>Me pagó</button>
          </div>
        ))}
      </Tarjeta>

      <Quincena d={d} p={siguiente(p)} actual={false} />

      {ultimos.length > 0 && (
        <Tarjeta titulo="Últimos movimientos">
          <ul className="divide-y divide-linea">
            {ultimos.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => borrar(m.id!, `${m.nota ?? m.categoria} por ${cop(m.valor)}`)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate">{m.nota ?? m.categoria}</span>
                    <span className="text-sm text-suave">
                      {fechaCorta(m.fecha)} · {m.categoria}
                      {m.tipo !== 'ingreso' && ` · ${m.medio === 'nubank' ? 'Nubank' : 'Cuenta'}`}
                    </span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${m.tipo === 'ingreso' ? 'text-emerald-700' : ''}`}>
                    {m.tipo === 'ingreso' ? '+' : '−'}
                    {cop(m.valor)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-suave">Toca un movimiento para borrarlo.</p>
        </Tarjeta>
      )}
    </>
  )
}
