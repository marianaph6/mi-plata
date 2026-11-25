import type { Datos, Deuda, Movimiento, Recurrente } from '../db'

// ---------- Formato ----------
const miles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
/** $1.234.567 */
export const cop = (n: number) => (n < 0 ? '−$' : '$') + miles.format(Math.abs(Math.round(n)))
export const sinSigno = (n: number | null | undefined) => (n == null ? '' : miles.format(n))
/** "1.234.567" o "$1.234.567" → 1234567 */
export const leerValor = (s: string) => Number(s.replace(/\D/g, '')) || 0
export const suma = (xs: { valor: number }[]) => xs.reduce((t, x) => t + x.valor, 0)

// ---------- Fechas (todas YYYY-MM-DD, sin horas) ----------
const aUTC = (f: string) => new Date(f + 'T12:00:00Z')
export const sumarDias = (f: string, n: number) => {
  const d = aUTC(f)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const sumarMeses = (mes: string, n: number) => {
  const t = +mes.slice(0, 4) * 12 + +mes.slice(5, 7) - 1 + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const diasDelMes = (mes: string) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()
/** El día 31 en un mes de 30 días cae el 30. */
export const fechaDe = (mes: string, dia: number) => `${mes}-${String(Math.min(dia, diasDelMes(mes))).padStart(2, '0')}`
export const diasEntre = (a: string, b: string) => Math.round((aUTC(b).getTime() - aUTC(a).getTime()) / 864e5)

const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const fmtMesCorto = new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const fmtCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
export const nombreMes = (mes: string) => fmtMes.format(aUTC(mes + '-01'))
export const mesCorto = (mes: string) => fmtMesCorto.format(aUTC(mes + '-01'))
export const fechaCorta = (f: string) => fmtCorta.format(aUTC(f))
export const fechaLarga = (f: string) => fmtLarga.format(aUTC(f))

// ---------- Quincenas ----------
export type Periodo = { mes: string; q: 1 | 2 }
export const igual = (a: Periodo, b: Periodo) => a.mes === b.mes && a.q === b.q
const orden = (p: Periodo) => `${p.mes}-${p.q}` // se compara como texto: 2026-11-2 < 2026-12-1
export const siguiente = (p: Periodo): Periodo => (p.q === 1 ? { mes: p.mes, q: 2 } : { mes: sumarMeses(p.mes, 1), q: 1 })
/** Del 1 al 14 es la quincena 1; del 15 al fin de mes, la 2. */
export const periodoDeFecha = (f: string): Periodo => ({ mes: f.slice(0, 7), q: +f.slice(8) < 15 ? 1 : 2 })
/** La quincena que llega del 25 en adelante paga la primera mitad del mes siguiente. */
export const periodoDeIngreso = (f: string): Periodo => {
  const d = +f.slice(8)
  return d >= 25 ? { mes: sumarMeses(f.slice(0, 7), 1), q: 1 } : { mes: f.slice(0, 7), q: d < 10 ? 1 : 2 }
}
/** Un pago recurrente cuenta en la fecha en que vence, no en la que se pagó. */
export const periodoDeGasto = (m: Movimiento) => periodoDeFecha(m.vence ?? m.fecha)

// ---------- Pagos recurrentes ----------
export const pausado = (r: Recurrente, mes: string) => !!r.pausa && r.pausa.desde <= mes && mes < r.pausa.hasta
export const activoEn = (r: Recurrente, mes: string) => r.activo && !pausado(r, mes)

export const ocurrencias = (recs: Recurrente[], mes: string) =>
  recs.filter((r) => r.dia && activoEn(r, mes)).map((r) => ({ r, vence: fechaDe(mes, r.dia!) }))

export const pagoDe = (movs: Movimiento[], r: Recurrente, mes: string) =>
  movs.find((m) => m.tipo === 'gasto' && m.recurrenteId === r.id && m.vence?.startsWith(mes))

/** Pagos sin marcar de este mes y el siguiente que vencen en los próximos `dias` (o ya vencieron). */
export function proximos(d: Datos, hoyF: string, dias = 7) {
  const mes = hoyF.slice(0, 7)
  const tope = sumarDias(hoyF, dias)
  return [mes, sumarMeses(mes, 1)]
    .flatMap((m) => ocurrencias(d.recs, m).map((o) => ({ ...o, mes: m })))
    .filter((o) => o.vence >= d.cfg.inicio && o.vence <= tope && !pagoDe(d.movs, o.r, o.mes))
    .map((o) => ({ ...o, faltan: diasEntre(hoyF, o.vence) }))
    .sort((a, b) => a.vence.localeCompare(b.vence))
}

// ---------- Tarjeta (Nubank) ----------
export const PAGO_TARJETA = 'Pago tarjeta'
// shortcut: una sola tarjeta (todo lo que se paga con medio 'nubank'); si llega otra, agregar el medio a la deuda.
export const acumulaTarjeta = (d: Datos) => d.deudas.some((t) => t.tarjeta?.acumula)

/** Saldo al final del día `saldoFecha` + cargos nuevos (si acumula) − pagos a la tarjeta. */
export function saldoTarjeta(t: Deuda, movs: Movimiento[]) {
  let s = t.saldo ?? 0
  for (const m of movs) {
    if (m.tipo !== 'gasto') continue
    if (m.deudaId === t.id) s -= m.fecha > t.saldoFecha ? m.valor : 0
    else if (t.tarjeta?.acumula && m.medio === 'nubank' && (m.vence ?? m.fecha) > t.saldoFecha) s += m.valor
  }
  return Math.max(0, s)
}

/** Fondo de emergencia: lo que dijiste en el último cuadre + lo que entró o salió después. */
export function fondoActual(d: Datos) {
  const c = d.cfg.cuadre
  const neto = (m: Movimiento) => (m.tipo === 'gasto' ? m.valor : -m.valor)
  return d.movs.reduce(
    (t, m) => (m.categoria === 'Fondo de emergencia' && m.tipo !== 'reserva' && (!c || despuesDe(c, m)) ? t + neto(m) : t),
    c?.fondo ?? 0,
  )
}
const despuesDe = (c: NonNullable<Datos['cfg']['cuadre']>, m: Movimiento) => m.creado > c.creado && m.fecha >= c.fecha

// ---------- Flujo de una quincena ----------
/**
 * Plan de una quincena. Si es la quincena de hoy (`hoyF`) y hay un cuadre, parte del saldo real de la cuenta
 * en vez de la quincena esperada.
 */
export function flujo(p: Periodo, d: Datos, hoyF?: string) {
  const { movs, recs, cfg } = d
  const acumula = acumulaTarjeta(d)
  const deCuenta = (m: Movimiento) => !(acumula && m.medio === 'nubank')
  const ingresos = movs.filter((m) => m.tipo === 'ingreso' && igual(periodoDeIngreso(m.fecha), p))
  const llego = ingresos.some((m) => m.categoria === 'Quincena')
  const quincena = cfg.quincenas.find((x) => x.q === p.q)!
  const entra = suma(ingresos) + (llego ? 0 : quincena.valor)
  const reservaPrevia = p.q === 1 ? movs.find((m) => m.tipo === 'reserva' && m.vence?.startsWith(sumarMeses(p.mes, -1))) : undefined
  const reservaHecha = p.q === 2 ? movs.find((m) => m.tipo === 'reserva' && m.vence?.startsWith(p.mes)) : undefined
  const gastos = movs.filter((m) => m.tipo === 'gasto' && igual(periodoDeGasto(m), p))
  const pendientes = ocurrencias(recs, p.mes).filter(
    (o) => periodoDeFecha(o.vence).q === p.q && o.vence >= cfg.inicio && !pagoDe(movs, o.r, p.mes) && !(acumula && o.r.medio === 'nubank'),
  )
  const tarjetas = d.deudas
    .filter((t) => t.tarjeta?.pagoFecha && igual(periodoDeFecha(t.tarjeta.pagoFecha), p))
    .map((t) => ({ t, valor: saldoTarjeta(t, movs) }))
    .filter((x) => x.valor > 0)
  // Mercado, transporte…: la mitad del presupuesto en cada quincena; lo ya gastado se descuenta.
  const variables = recs
    .filter((r) => !r.dia && activoEn(r, p.mes))
    .map((r) => ({ r, queda: Math.max(0, Math.round(r.valor / 2) - suma(gastos.filter((g) => g.categoria === r.categoria && !g.recurrenteId))) }))
  const entraReserva = reservaPrevia?.valor ?? 0
  const separar = p.q === 2 ? (reservaHecha?.valor ?? cfg.reserva) : 0
  const salio = suma(gastos.filter(deCuenta))
  const porPagar = pendientes.reduce((t, o) => t + o.r.valor, 0) + suma(tarjetas)
  const porGastar = variables.reduce((t, v) => t + v.queda, 0)
  const base = { p, nombre: quincena.nombre, entra, llego, entraReserva, salio, pendientes, tarjetas, porPagar, variables, porGastar, separar, reservaHecha: !!reservaHecha }

  const c = cfg.cuadre
  if (!c || !hoyF || !igual(p, periodoDeFecha(hoyF)) || orden(periodoDeFecha(c.fecha)) > orden(p))
    return { ...base, cuadre: null, libre: entra + entraReserva - salio - porPagar - porGastar - separar }

  // Con cuadre: saldo real + lo que entró − lo que salió de la cuenta después. El fondo y la reserva viven en la cuenta
  // pero no se tocan; la quincena que paga el periodo siguiente todavía no se cuenta.
  const interno = (m: Movimiento) => m.categoria === 'Fondo de emergencia' || m.tipo === 'reserva'
  const entradas = movs.filter((m) => m.tipo === 'ingreso' && despuesDe(c, m) && !interno(m) && orden(periodoDeIngreso(m.fecha)) <= orden(p))
  const salidas = movs.filter((m) => m.tipo === 'gasto' && despuesDe(c, m) && !interno(m) && deCuenta(m))
  const saldo = c.saldo + suma(entradas) - suma(salidas)
  // Si el cuadre fue antes de que empezara esta quincena y la quincena no se ha registrado, se espera.
  const esperada = !llego && orden(periodoDeFecha(c.fecha)) < orden(p) ? quincena.valor : 0
  const fondo = fondoActual(d)
  const guardar = p.q === 2 ? cfg.reserva : 0 // en la quincena 1 la reserva se usa para los pagos del 1
  return {
    ...base,
    cuadre: { fecha: c.fecha, saldo, esperada, fondo, guardar },
    libre: saldo + esperada - fondo - guardar - porPagar - porGastar,
  }
}

// ---------- Presupuesto vs. real ----------
export const INGRESOS = ['Quincena', 'Prima', 'Freelance', 'Cesantías', 'Otro ingreso']
export const GASTOS = ['Mercado', 'Transporte', 'Comida fuera', 'Cuidado personal', 'Salidas', 'Regalos', 'Imprevistos', 'Otros']

/** Un ingreso en una categoría de gasto (reembolso de iCloud, retiro del fondo) se resta de esa categoría. */
export function presupuesto(mes: string, d: Datos) {
  const plan = new Map<string, number>()
  for (const r of d.recs) if (activoEn(r, mes)) plan.set(r.categoria, (plan.get(r.categoria) ?? 0) + (r.miParte ?? r.valor))
  const real = new Map<string, number>()
  for (const m of d.movs) {
    // el pago de la tarjeta es un traslado: los gastos ya se contaron cuando se hizo cada cargo
    if (m.tipo === 'reserva' || m.categoria === PAGO_TARJETA || INGRESOS.includes(m.categoria) || (m.vence ?? m.fecha).slice(0, 7) !== mes) continue
    real.set(m.categoria, (real.get(m.categoria) ?? 0) + (m.tipo === 'gasto' ? m.valor : -m.valor))
  }
  return [...new Set([...plan.keys(), ...real.keys()])]
    .map((categoria) => ({ categoria, plan: plan.get(categoria) ?? 0, real: real.get(categoria) ?? 0 }))
    .filter((x) => x.plan || x.real)
    .sort((a, b) => b.plan - a.plan || b.real - a.real)
}

/** Total neto de una categoría desde siempre (cajitas, fondo de emergencia). */
export const acumulado = (movs: Movimiento[], categoria: string) =>
  movs.reduce((t, m) => (m.categoria !== categoria || m.tipo === 'reserva' ? t : t + (m.tipo === 'gasto' ? m.valor : -m.valor)), 0)

/** Ahorro que te debes: cajitas que tocaban desde que usas la app hasta hoy menos lo que de verdad aportaste. */
export function ahorroDebido(d: Datos, hoyF: string) {
  let esperado = 0
  for (let mes = d.cfg.inicio.slice(0, 7); mes <= hoyF.slice(0, 7); mes = sumarMeses(mes, 1))
    for (const o of ocurrencias(d.recs, mes)) if (o.r.categoria === 'Ahorro' && o.vence >= d.cfg.inicio && o.vence <= hoyF) esperado += o.r.valor
  const aportado = d.movs.reduce(
    (t, m) => (m.categoria === 'Ahorro' && m.tipo !== 'reserva' && (m.vence ?? m.fecha) >= d.cfg.inicio ? t + (m.tipo === 'gasto' ? m.valor : -m.valor) : t),
    0,
  )
  return Math.max(0, esperado - aportado)
}

/** Lo que la otra persona debe de un gasto compartido: su parte de cada cobro pagado menos lo que ya devolvió. */
export function reembolso(r: Recurrente, movs: Movimiento[]) {
  const suParte = r.valor - (r.miParte ?? r.valor)
  const mios = movs.filter((m) => m.recurrenteId === r.id)
  return mios.filter((m) => m.tipo === 'gasto').length * suParte - suma(mios.filter((m) => m.tipo === 'ingreso'))
}

// ---------- Deudas ----------
export const tasaMes = (ea: number) => (1 + ea) ** (1 / 12) - 1
export const cuotaPara = (saldo: number, i: number, n: number) => (i ? (saldo * i) / (1 - (1 + i) ** -n) : saldo / n)
/** Cuántas cuotas faltan pagando `cuota`. Infinity si la cuota no cubre los intereses. */
export const plazoPara = (saldo: number, i: number, cuota: number) =>
  saldo <= 0 ? 0 : !i ? saldo / cuota : cuota <= saldo * i ? Infinity : -Math.log(1 - (saldo * i) / cuota) / Math.log(1 + i)

export function estadoDeuda(dd: Deuda, movs: Movimiento[], hoyF: string) {
  const ms = movs
    .filter((m) => m.deudaId === dd.id && m.tipo === 'gasto' && (m.vence ?? m.fecha) >= dd.saldoFecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado - b.creado)
  const i = dd.tasaEA == null ? null : tasaMes(dd.tasaEA)
  const cuotasPagadas = ms.filter((m) => !m.abono).length
  let saldo = dd.saldo
  // shortcut: intereses de un mes por cada cuota pagada, sin contar días exactos; se corrige al actualizar el saldo con el extracto.
  if (saldo != null && i != null) for (const m of ms) saldo = m.abono ? saldo - m.valor : saldo * (1 + i) - m.valor
  if (saldo != null) saldo = Math.max(0, Math.round(saldo))
  let restantes = dd.cuotasRestantes == null ? null : Math.max(0, dd.cuotasRestantes - cuotasPagadas)
  if (dd.modoAbono === 'plazo' && saldo != null && i != null) restantes = Math.ceil(plazoPara(saldo, i, dd.cuota) - 1e-9)
  const cuotaNueva = dd.modoAbono === 'cuota' && saldo != null && i != null && restantes ? Math.round(cuotaPara(saldo, i, restantes)) : null
  const mes = hoyF.slice(0, 7)
  // La cuota de este mes ya está contada si vencía antes de la fecha del saldo de referencia.
  const cuotaDelMes = fechaDe(mes, dd.dia) < dd.saldoFecha || ms.some((m) => !m.abono && (m.vence ?? m.fecha).startsWith(mes))
  const ultima = restantes == null || !isFinite(restantes) || restantes === 0 ? null : sumarMeses(mes, restantes - (cuotaDelMes ? 0 : 1))
  return { saldo, i, cuotasPagadas, restantes, cuotaNueva, ultima, cuotaDelMes, movs: ms }
}

export type Simulacion =
  | { modo: 'plazo'; cuotasAntes: number; cuotasDespues: number; interesesAhorrados: number }
  | { modo: 'cuota'; cuotaAntes: number; cuotaDespues: number; interesesAhorrados: number }

/** null si faltan saldo, tasa o plazo para calcular. */
export function simular(dd: Deuda, e: ReturnType<typeof estadoDeuda>, abono: number): Simulacion | null {
  if (e.saldo == null || e.i == null || abono <= 0) return null
  const s0 = e.saldo
  const s1 = Math.max(0, s0 - abono)
  if (dd.modoAbono === 'plazo') {
    const n0 = plazoPara(s0, e.i, dd.cuota)
    const n1 = plazoPara(s1, e.i, dd.cuota)
    if (!isFinite(n0)) return null
    return { modo: 'plazo', cuotasAntes: Math.ceil(n0 - 1e-9), cuotasDespues: Math.ceil(n1 - 1e-9), interesesAhorrados: Math.round((n0 - n1) * dd.cuota - (s0 - s1)) }
  }
  const n = e.restantes
  if (!n) return null
  const c0 = cuotaPara(s0, e.i, n)
  const c1 = cuotaPara(s1, e.i, n)
  return { modo: 'cuota', cuotaAntes: Math.round(c0), cuotaDespues: Math.round(c1), interesesAhorrados: Math.round((c0 - c1) * n - (s0 - s1)) }
}

// ---------- Exportar ----------
/** CSV con ; (Excel en español) y BOM para que abra bien las tildes. */
export function csv(d: Datos) {
  const nombre = <T extends { id?: number; nombre: string }>(xs: T[], id?: number) => xs.find((x) => x.id === id)?.nombre ?? ''
  const filas: (string | number)[][] = [
    ['Fecha', 'Corresponde a', 'Tipo', 'Categoría', 'Medio', 'Valor', 'Nota', 'Pago recurrente', 'Deuda'],
    ...[...d.movs]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((m) => [
        m.fecha,
        m.vence ?? '',
        m.abono ? 'abono' : m.tipo,
        m.categoria,
        m.medio === 'nubank' ? 'Nubank' : 'Cuenta',
        m.tipo === 'ingreso' ? m.valor : -m.valor,
        m.nota ?? '',
        nombre(d.recs, m.recurrenteId),
        nombre(d.deudas, m.deudaId),
      ]),
  ]
  const celda = (c: string | number) => (typeof c === 'string' && /[;"\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
}
