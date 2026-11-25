import { useState } from 'react'
import { db, guardarConfig, hoy, useDatos, type Datos, type Recurrente } from '../db'
import { acumulado, ahorroDebido, cop, csv, fechaCorta, fechaDe, fondoActual, leerValor, periodoDeFecha, reembolso, sumarMeses } from '../lib/plata'
import { exportar, guardar, importar } from '../lib/respaldo'
import { Campo, Etiqueta, Fila, Seccion, botonSecundario, entrada } from '../ui'

const URL_APP = 'https://marianaph6.github.io/mi-plata/'

function EditarRecurrente({ r }: { r: Recurrente }) {
  const cambiar = (c: Partial<Recurrente>) => db.recurrentes.update(r.id!, c)
  return (
    <details className="border-t border-linea first:border-t-0">
      <summary className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 py-2 ${r.activo ? '' : 'text-suave line-through'}`}>
        <span className="truncate">
          {r.nombre}
          {r.enRevision && <Etiqueta color="bg-amber-100 text-amber-900">en revisión</Etiqueta>}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-suave">
          {cop(r.valor)} · {r.dia ? `día ${r.dia}` : 'sin día'}
        </span>
      </summary>
      <div className="grid grid-cols-2 gap-3 pb-3">
        <Campo label="Nombre" tipo="texto" valor={r.nombre} onGuardar={(v) => v && cambiar({ nombre: v as string })} />
        <Campo label="Categoría" tipo="texto" valor={r.categoria} onGuardar={(v) => v && cambiar({ categoria: v as string })} />
        <Campo label="Valor" valor={r.valor} onGuardar={(v) => cambiar({ valor: (v as number) ?? 0 })} />
        <Campo label="Día (vacío = sin día)" tipo="numero" valor={r.dia} onGuardar={(v) => cambiar({ dia: v == null ? null : Math.min(31, Math.max(1, v as number)) })} />
        {r.categoria !== 'Ahorro' && (
          <Campo
            label="Pausado desde (mes)"
            tipo="mes"
            valor={r.pausa?.desde}
            onGuardar={(v) => cambiar({ pausa: v ? { desde: v as string, hasta: r.pausa && r.pausa.hasta > (v as string) ? r.pausa.hasta : sumarMeses(v as string, 1) } : undefined })}
          />
        )}
        {r.pausa && <Campo label="Vuelve en (mes)" tipo="mes" valor={r.pausa.hasta} onGuardar={(v) => v && (v as string) > r.pausa!.desde && cambiar({ pausa: { ...r.pausa!, hasta: v as string } })} />}
        {r.compartido && <Campo label="Mi parte" valor={r.miParte} onGuardar={(v) => cambiar({ miParte: (v as number) ?? undefined })} />}
        {r.compartido && <Campo label={`Próximo cobro a ${r.compartido.con}`} tipo="fecha" valor={r.compartido.proximo} onGuardar={(v) => v && cambiar({ compartido: { ...r.compartido!, proximo: v as string } })} />}
        <label className="block text-sm">
          <span className="text-suave">Medio</span>
          <select value={r.medio} onChange={(e) => cambiar({ medio: e.target.value as Recurrente['medio'] })} className={`mt-1 ${entrada}`}>
            <option value="cuenta">Cuenta</option>
            <option value="nubank">Nubank</option>
          </select>
        </label>
        <div className="space-y-2 pt-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={!!r.enRevision} onChange={(e) => cambiar({ enRevision: e.target.checked })} /> En revisión</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={!!r.estimado} onChange={(e) => cambiar({ estimado: e.target.checked })} /> Valor estimado</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={r.activo} onChange={(e) => cambiar({ activo: e.target.checked })} /> Activo</label>
        </div>
      </div>
    </details>
  )
}

function Cuadre({ d }: { d: Datos }) {
  const c = d.cfg.cuadre
  const [saldo, setSaldo] = useState('')
  const [reserva, setReserva] = useState(String(d.cfg.reserva))
  const [fondo, setFondo] = useState(String(fondoActual(d)))
  const [aviso, setAviso] = useState('')
  const [s, r, f] = [leerValor(saldo), leerValor(reserva), leerValor(fondo)]
  const campo = (label: string, valor: string, set: (v: string) => void) => (
    <label className="block text-sm">
      <span className="text-suave">{label}</span>
      <input inputMode="numeric" value={leerValor(valor) ? cop(leerValor(valor)) : ''} placeholder="$0" onChange={(e) => set(e.target.value)} className={`mt-1 ${entrada}`} />
    </label>
  )
  const cuadrar = async () => {
    const f0 = hoy()
    await guardarConfig({ cuadre: { fecha: f0, creado: Date.now(), saldo: s, reserva: r, fondo: f } })
    // En la segunda quincena, lo guardado para el 1 cuenta como reserva separada.
    const p = periodoDeFecha(f0)
    if (p.q === 2 && r > 0 && !d.movs.some((m) => m.tipo === 'reserva' && m.vence?.startsWith(p.mes)))
      await db.movimientos.add({ fecha: f0, tipo: 'reserva', valor: r, categoria: 'Pagos del 1', medio: 'cuenta', vence: fechaDe(p.mes, 15), creado: Date.now() })
    setSaldo('')
    setAviso('Listo: Hoy ya calcula con tu saldo real.')
  }
  return (
    <Seccion titulo="Cuadrar con mi cuenta" resumen={c ? fechaCorta(c.fecha) : 'sin cuadrar'}>
      <p className="text-xs text-suave">Primero marca en Pagos lo que ya pagaste.</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {campo('Saldo en la cuenta hoy', saldo, setSaldo)}
        {campo('Pagos del 1', reserva, setReserva)}
        {campo('Fondo de emergencia', fondo, setFondo)}
        <div className="text-sm">
          <span className="text-suave">Libre</span>
          <p className={`mt-1 py-2 text-lg font-semibold tabular-nums ${s - r - f < 0 ? 'text-red-700' : ''}`}>{s ? cop(s - r - f) : '—'}</p>
        </div>
      </div>
      <button type="button" disabled={!s} onClick={cuadrar} className="mt-3 rounded-full bg-acento px-4 py-2 font-semibold text-white disabled:opacity-40">Cuadrar</button>
      {aviso && <p className="mt-2 text-sm">{aviso}</p>}
    </Seccion>
  )
}

export function Mas() {
  const d = useDatos()
  const [aviso, setAviso] = useState('')
  if (!d) return null

  const restaurar = async (f?: File) => {
    if (!f || !confirm('Esto reemplaza todos tus datos por los del archivo. ¿Continuar?')) return
    try {
      await importar(f)
      setAviso('Datos restaurados.')
    } catch (e) {
      setAviso((e as Error).message)
    }
  }
  const agregar = () => db.recurrentes.add({ nombre: 'Nuevo pago', categoria: 'Otros', valor: 0, dia: 1, medio: 'cuenta', tipo: 'fijo', activo: true })
  const fondo = fondoActual(d)
  const debesAhorro = ahorroDebido(d, hoy())
  const meta = d.cfg.metaEmergencia
  const compartidos = d.recs.filter((r) => r.activo && r.compartido)
  const porConfirmar = [
    ...d.deudas.filter((x) => x.tarjeta && !x.tarjeta.pagoFecha && x.saldo).map((x) => `${x.nombre}: fecha en que la vas a pagar`),
    ...d.deudas.filter((x) => !x.tarjeta).flatMap((x) => [
      x.saldo == null && `${x.nombre}: saldo`,
      x.tasaEA == null && `${x.nombre}: tasa`,
      x.cuotasRestantes == null && x.tasaEA == null && `${x.nombre}: cuotas restantes`,
    ]),
    ...d.recs.filter((r) => r.activo && r.estimado).map((r) => `${r.nombre}: el valor es estimado`),
    ...d.recs.filter((r) => r.activo && r.enRevision).map((r) => `Decidir si sigues con ${r.nombre}`),
    meta == null && 'Meta del fondo de emergencia',
  ].filter((x): x is string => !!x)

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Más</h1>

      <Cuadre key={`${d.cfg.reserva}-${fondo}`} d={d} />

      <Seccion titulo="Ahorro" resumen={debesAhorro > 0 ? <span className="text-amber-800">te debes {cop(debesAhorro)}</span> : cop(fondo)}>
        <Fila izq="Cajitas" der={cop(acumulado(d.movs, 'Ahorro'))} />
        {debesAhorro > 0 && (
          <div className="my-1 flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm">
            <span>Te debes <b>{cop(debesAhorro)}</b></span>
            <a href={`#/gasto?cat=Ahorro&valor=${debesAhorro}`} className={`shrink-0 ${botonSecundario}`}>Ponerme al día</a>
          </div>
        )}
        <Fila izq="Fondo de emergencia" der={meta ? `${cop(fondo)} de ${cop(meta)}` : cop(fondo)} />
        {compartidos.map((r) => (
          <Fila key={r.id} izq={`${r.compartido!.con} te debe (${r.nombre})`} der={cop(reembolso(r, d.movs))} />
        ))}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Campo label="Meta del fondo" valor={meta} onGuardar={(v) => guardarConfig({ metaEmergencia: v as number | null })} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="#/gasto?cat=Fondo de emergencia" className={botonSecundario}>Abonar al fondo</a>
          <a href="#/gasto?tipo=ingreso&cat=Fondo de emergencia" className={botonSecundario}>Usé del fondo</a>
        </div>
      </Seccion>

      <Seccion titulo="Ingresos" resumen={cop(d.cfg.quincenas.reduce((t, q) => t + q.valor, 0))}>
        <div className="grid grid-cols-2 gap-3">
          {d.cfg.quincenas.map((q) => (
            <Campo key={q.q} label={q.nombre} valor={q.valor} onGuardar={(v) => guardarConfig({ quincenas: d.cfg.quincenas.map((x) => (x.q === q.q ? { ...x, valor: (v as number) ?? 0 } : x)) })} />
          ))}
          <Campo label="Separar para Pagos del 1" valor={d.cfg.reserva} onGuardar={(v) => guardarConfig({ reserva: (v as number) ?? 0 })} />
        </div>
        <a href="#/gasto?tipo=ingreso&cat=Prima" className={`mt-3 inline-block ${botonSecundario}`}>+ Ingreso extra</a>
      </Seccion>

      <Seccion titulo="Pagos recurrentes" resumen={d.recs.filter((r) => r.activo).length}>
        {d.recs.map((r) => <EditarRecurrente key={r.id} r={r} />)}
        <button type="button" onClick={agregar} className={`mt-2 ${botonSecundario}`}>+ Agregar</button>
        <p className="mt-2 text-xs text-suave">Sin día = presupuesto del mes (mercado, transporte).</p>
      </Seccion>

      {(porConfirmar.length > 0 || d.cfg.pendientes.length > 0) && (
        <Seccion titulo="Por confirmar" resumen={porConfirmar.length + d.cfg.pendientes.length}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {porConfirmar.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {d.cfg.pendientes.map((t) => (
            <label key={t} className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-5" onChange={() => guardarConfig({ pendientes: d.cfg.pendientes.filter((x) => x !== t) })} />
              {t}
            </label>
          ))}
        </Seccion>
      )}

      <Seccion titulo="Respaldo y Excel">
        <p className="text-xs text-suave">Tus datos viven solo en este teléfono: guarda una copia de vez en cuando.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={async () => guardar(await exportar())} className="rounded-full bg-acento px-4 py-2 font-semibold text-white">Exportar respaldo</button>
          <label className={botonSecundario}>
            Restaurar
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => restaurar(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => guardar(new File([csv(d)], `mi-plata-${hoy()}.csv`, { type: 'text/csv' }))} className={botonSecundario}>Excel (CSV)</button>
        </div>
        {aviso && <p className="mt-2 text-sm">{aviso}</p>}
      </Seccion>

      <Seccion titulo="Widget e instalación">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-suave">
          <li>Abre {URL_APP} en Safari → Compartir → <b>Agregar a pantalla de inicio</b>.</li>
          <li>App <b>Atajos</b> → nuevo atajo → acción <b>Abrir URL</b> con <code className="break-all">{URL_APP}#/gasto</code>.</li>
          <li>Mantén presionada la pantalla de inicio → <b>+</b> → <b>Atajos</b> → elige el atajo. Un toque y anotas un gasto.</li>
          <li>Opcional: Atajos → Automatización → <b>Hora del día</b> (8:00 a. m.) → abrir {URL_APP}#/hoy para ver lo que vence.</li>
        </ol>
      </Seccion>
    </>
  )
}
