import { useState } from 'react'
import { db, guardarConfig, hoy, useDatos, type Recurrente } from '../db'
import { acumulado, cop, csv, fechaCorta, reembolso } from '../lib/plata'
import { exportar, guardar, importar } from '../lib/respaldo'
import { Campo, Etiqueta, Fila, Tarjeta, botonSecundario, entrada } from '../ui'

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
  const fondo = acumulado(d.movs, 'Fondo de emergencia')
  const meta = d.cfg.metaEmergencia
  const compartidos = d.recs.filter((r) => r.activo && r.compartido)
  const porConfirmar = [
    ...d.deudas.flatMap((x) => [
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

      <Tarjeta titulo="Ahorro">
        <Fila izq="Cajitas – libertad financiera" der={cop(acumulado(d.movs, 'Ahorro'))} />
        <Fila izq="Fondo de emergencia" der={meta ? `${cop(fondo)} de ${cop(meta)}` : cop(fondo)} />
        {meta ? (
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-linea">
            <div className="h-full rounded-full bg-acento" style={{ width: `${Math.min(100, (fondo / meta) * 100)}%` }} />
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Campo label="Meta del fondo" valor={meta} onGuardar={(v) => guardarConfig({ metaEmergencia: v as number | null })} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="#/gasto?cat=Fondo de emergencia" className={botonSecundario}>Abonar al fondo</a>
          <a href="#/gasto?tipo=ingreso&cat=Fondo de emergencia" className={botonSecundario}>Usé del fondo</a>
        </div>
        <p className="mt-2 text-xs text-suave">Cuenta desde que empezaste a usar la app.</p>
      </Tarjeta>

      {compartidos.length > 0 && (
        <Tarjeta titulo="Te deben">
          {compartidos.map((r) => (
            <Fila key={r.id} izq={`${r.compartido!.con} · ${r.nombre} (cobrar el ${fechaCorta(r.compartido!.proximo)})`} der={cop(reembolso(r, d.movs))} />
          ))}
          <p className="mt-1 text-xs text-suave">Cuando te pague, toca “Me pagó” en Hoy (aparece la semana del cobro).</p>
        </Tarjeta>
      )}

      <Tarjeta titulo="Ingresos y reserva">
        <div className="grid grid-cols-2 gap-3">
          {d.cfg.quincenas.map((q) => (
            <Campo key={q.q} label={q.nombre} valor={q.valor} onGuardar={(v) => guardarConfig({ quincenas: d.cfg.quincenas.map((x) => (x.q === q.q ? { ...x, valor: (v as number) ?? 0 } : x)) })} />
          ))}
          <Campo label="Separar para Pagos del 1" valor={d.cfg.reserva} onGuardar={(v) => guardarConfig({ reserva: (v as number) ?? 0 })} />
        </div>
        <a href="#/gasto?tipo=ingreso&cat=Prima" className={`mt-3 inline-block ${botonSecundario}`}>+ Ingreso extra</a>
      </Tarjeta>

      <Tarjeta titulo="Pagos recurrentes">
        {d.recs.map((r) => <EditarRecurrente key={r.id} r={r} />)}
        <button type="button" onClick={agregar} className={`mt-2 ${botonSecundario}`}>+ Agregar</button>
        <p className="mt-2 text-xs text-suave">Sin día = presupuesto del mes (mercado, transporte): se reparte mitad y mitad entre quincenas. Desactiva en vez de borrar para no perder el historial.</p>
      </Tarjeta>

      {(porConfirmar.length > 0 || d.cfg.pendientes.length > 0) && (
        <Tarjeta titulo="Por confirmar">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {porConfirmar.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {d.cfg.pendientes.map((t) => (
            <label key={t} className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-5" onChange={() => guardarConfig({ pendientes: d.cfg.pendientes.filter((x) => x !== t) })} />
              {t}
            </label>
          ))}
          <p className="mt-2 text-xs text-suave">Los datos de deudas se completan en Deudas → Editar datos.</p>
        </Tarjeta>
      )}

      <Tarjeta titulo="Exportar y respaldo">
        <p className="text-sm text-suave">Tus datos viven solo en este teléfono. Guarda una copia en Archivos o iCloud de vez en cuando.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={async () => guardar(await exportar())} className="rounded-full bg-acento px-4 py-2 font-semibold text-white">Exportar respaldo</button>
          <label className={botonSecundario}>
            Restaurar
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => restaurar(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => guardar(new File([csv(d)], `mi-plata-${hoy()}.csv`, { type: 'text/csv' }))} className={botonSecundario}>Excel (CSV)</button>
        </div>
        {aviso && <p className="mt-2 text-sm">{aviso}</p>}
      </Tarjeta>

      <Tarjeta titulo="Instalar y usar como widget" className="text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-suave">
          <li>Abre {URL_APP} en Safari → Compartir → <b>Agregar a pantalla de inicio</b>.</li>
          <li>App <b>Atajos</b> → nuevo atajo → acción <b>Abrir URL</b> con <code className="break-all">{URL_APP}#/gasto</code>.</li>
          <li>Mantén presionada la pantalla de inicio → <b>+</b> → <b>Atajos</b> → elige el atajo. Un toque y anotas un gasto.</li>
          <li>Opcional: Atajos → Automatización → <b>Hora del día</b> (8:00 a. m.) → abrir {URL_APP}#/hoy para ver lo que vence.</li>
        </ol>
      </Tarjeta>
    </>
  )
}
