import { describe, expect, it } from 'vitest'
import type { Config, Datos, Deuda, Movimiento, Recurrente } from '../db'
import {
  PAGO_TARJETA,
  ahorroDebido,
  cop,
  fondoActual,
  ocurrencias,
  saldoTarjeta,
  csv,
  estadoDeuda,
  fechaDe,
  flujo,
  periodoDeIngreso,
  presupuesto,
  proximos,
  reembolso,
  simular,
  sumarMeses,
} from './plata'

// Datos de ejemplo, no reales.
const cfg: Config = {
  clave: 'config',
  quincenas: [
    { q: 1, nombre: 'Fin de mes', valor: 1_000_000 },
    { q: 2, nombre: 'Mitad de mes', valor: 1_200_000 },
  ],
  reserva: 500_000,
  inicio: '2026-01-01',
  metaEmergencia: null,
  pendientes: [],
}
const recs: Recurrente[] = [
  { id: 1, nombre: 'Arriendo', categoria: 'Vivienda', valor: 800_000, dia: 1, medio: 'cuenta', tipo: 'fijo', activo: true },
  { id: 2, nombre: 'Celular', categoria: 'Servicios', valor: 50_000, dia: 10, medio: 'nubank', tipo: 'fijo', activo: true },
  { id: 3, nombre: 'Gym', categoria: 'Salud', valor: 100_000, dia: 20, medio: 'nubank', tipo: 'fijo', activo: true },
  {
    id: 4, nombre: 'Nube', categoria: 'Suscripciones', valor: 20_000, miParte: 10_000, dia: 22, medio: 'nubank', tipo: 'fijo', activo: true,
    compartido: { con: 'Ana', cadaMeses: 2, proximo: '2026-03-22' },
  },
  { id: 5, nombre: 'Mercado', categoria: 'Mercado', valor: 200_000, dia: null, medio: 'cuenta', tipo: 'variable', activo: true },
  { id: 6, nombre: 'Cuota banco', categoria: 'Deudas', valor: 300_000, dia: 3, medio: 'cuenta', tipo: 'fijo', deudaId: 1, activo: true },
  { id: 7, nombre: 'Cancelada', categoria: 'Suscripciones', valor: 99_000, dia: 5, medio: 'nubank', tipo: 'fijo', activo: false },
]
let n = 0
const mov = (m: Partial<Movimiento>): Movimiento => ({ fecha: '2026-03-05', tipo: 'gasto', valor: 0, categoria: 'Otros', medio: 'cuenta', creado: ++n, ...m })
const datos = (movs: Movimiento[] = [], deudas: Deuda[] = []): Datos => ({ movs, recs, deudas, cfg })

describe('formato y fechas', () => {
  it('formatea pesos', () => {
    expect(cop(1234567)).toBe('$1.234.567')
    expect(cop(-5000)).toBe('−$5.000')
    expect(cop(0)).toBe('$0')
  })
  it('maneja fin de mes y cambio de año', () => {
    expect(fechaDe('2026-02', 31)).toBe('2026-02-28')
    expect(sumarMeses('2026-12', 1)).toBe('2027-01')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
  })
  it('asigna cada quincena al periodo que paga', () => {
    expect(periodoDeIngreso('2026-10-30')).toEqual({ mes: '2026-11', q: 1 })
    expect(periodoDeIngreso('2026-10-01')).toEqual({ mes: '2026-10', q: 1 })
    expect(periodoDeIngreso('2026-10-20')).toEqual({ mes: '2026-10', q: 2 })
    expect(periodoDeIngreso('2026-12-28')).toEqual({ mes: '2027-01', q: 1 })
  })
})

describe('flujo por quincena', () => {
  it('sin movimientos muestra el plan', () => {
    const q1 = flujo({ mes: '2026-03', q: 1 }, datos())
    expect(q1.porPagar).toBe(1_150_000) // arriendo + celular + cuota, sin la cancelada
    expect(q1.porGastar).toBe(100_000) // mitad del mercado
    expect(q1.libre).toBe(-250_000)
    const q2 = flujo({ mes: '2026-03', q: 2 }, datos())
    expect(q2.porPagar).toBe(120_000) // nube completa: sale de la cuenta aunque solo la mitad sea mía
    expect(q2.libre).toBe(1_200_000 - 120_000 - 100_000 - 500_000)
  })
  it('la reserva separada en la quincena 2 entra en la 1 del mes siguiente', () => {
    const r = mov({ tipo: 'reserva', valor: 500_000, fecha: '2026-02-18', vence: '2026-02-15', categoria: 'Pagos del 1' })
    expect(flujo({ mes: '2026-03', q: 1 }, datos([r])).libre).toBe(250_000)
    const feb = flujo({ mes: '2026-02', q: 2 }, datos([r]))
    expect(feb.reservaHecha).toBe(true)
    expect(feb.separar).toBe(500_000)
  })
  it('pagar o gastar dentro del presupuesto no cambia lo libre; pasarse sí', () => {
    const base = flujo({ mes: '2026-03', q: 1 }, datos()).libre
    const pago = mov({ valor: 800_000, recurrenteId: 1, vence: '2026-03-01', fecha: '2026-02-28', categoria: 'Vivienda' })
    const poco = mov({ valor: 30_000, categoria: 'Mercado' })
    expect(flujo({ mes: '2026-03', q: 1 }, datos([pago, poco])).libre).toBe(base)
    const mucho = mov({ valor: 150_000, categoria: 'Mercado' })
    const f = flujo({ mes: '2026-03', q: 1 }, datos([pago, mucho]))
    expect(f.porGastar).toBe(0)
    expect(f.libre).toBe(base - 50_000)
  })
  it('usa la quincena registrada en vez de la esperada', () => {
    const q = mov({ tipo: 'ingreso', valor: 950_000, fecha: '2026-02-27', categoria: 'Quincena' })
    const f = flujo({ mes: '2026-03', q: 1 }, datos([q]))
    expect(f.llego).toBe(true)
    expect(f.entra).toBe(950_000)
  })
})

describe('pagos y presupuesto', () => {
  it('avisa lo vencido y lo que vence en 7 días, también del mes siguiente', () => {
    const pagados = [1, 2, 3, 4, 6].map((id) => mov({ recurrenteId: id, vence: fechaDe('2026-03', recs[id - 1].dia!) }))
    pagados.push(mov({ recurrenteId: 1, vence: '2026-04-01' }))
    expect(proximos(datos(pagados), '2026-03-28').map((o) => [o.r.nombre, o.faltan])).toEqual([['Cuota banco', 6]])
    expect(proximos(datos(), '2026-03-21').map((o) => [o.r.nombre, o.faltan]).slice(-2)).toEqual([['Gym', -1], ['Nube', 1]])
    expect(proximos({ ...datos(), cfg: { ...cfg, inicio: '2026-03-21' } }, '2026-03-21').map((o) => o.r.nombre)).toEqual(['Nube'])
  })
  it('el reembolso del compartido se resta de su categoría', () => {
    const movs = [
      mov({ valor: 20_000, recurrenteId: 4, vence: '2026-03-22', categoria: 'Suscripciones' }),
      mov({ tipo: 'ingreso', valor: 20_000, recurrenteId: 4, fecha: '2026-03-22', categoria: 'Suscripciones' }),
    ]
    const sus = presupuesto('2026-03', datos(movs)).find((x) => x.categoria === 'Suscripciones')
    expect(sus).toEqual({ categoria: 'Suscripciones', plan: 10_000, real: 0 })
  })
  it('calcula cuánto debe la otra persona', () => {
    const pagos = [mov({ valor: 20_000, recurrenteId: 4 }), mov({ valor: 20_000, recurrenteId: 4 })]
    expect(reembolso(recs[3], pagos)).toBe(20_000)
    expect(reembolso(recs[3], [...pagos, mov({ tipo: 'ingreso', valor: 20_000, recurrenteId: 4 })])).toBe(0)
  })
})

describe('deudas', () => {
  const base: Deuda = { id: 1, nombre: 'Banco', entidad: 'X', cuota: 100_000, dia: 3, saldo: 1_000_000, saldoFecha: '2026-03-01', tasaEA: 1.01 ** 12 - 1, cuotasRestantes: null, modoAbono: 'plazo', prioridad: 1 }

  it('abono que reduce plazo: menos cuotas y ahorra intereses', () => {
    const e = estadoDeuda(base, [], '2026-03-02')
    expect(e.restantes).toBe(11)
    const s = simular(base, e, 200_000)
    expect(s).toMatchObject({ modo: 'plazo', cuotasAntes: 11, cuotasDespues: 9 })
    expect(s!.interesesAhorrados).toBeGreaterThan(0)
  })

  it('abono que reduce cuota: mismo plazo, cuota más baja', () => {
    const d: Deuda = { ...base, modoAbono: 'cuota', cuotasRestantes: 12, tasaEA: 0.12 }
    const e = estadoDeuda(d, [], '2026-03-02')
    const s = simular(d, e, 100_000)
    expect(s?.modo).toBe('cuota')
    if (s?.modo !== 'cuota') return
    expect(s.cuotaDespues).toBeLessThan(s.cuotaAntes)
    expect(s.interesesAhorrados).toBeGreaterThan(0)
    // pagar la cuota exacta deja la misma cuota con una cuota menos
    const pago = mov({ valor: s.cuotaAntes, deudaId: 1, vence: '2026-03-03', fecha: '2026-03-03' })
    const e2 = estadoDeuda(d, [pago], '2026-03-05')
    expect(e2.restantes).toBe(11)
    expect(Math.abs(e2.cuotaNueva! - s.cuotaAntes)).toBeLessThanOrEqual(1)
  })

  it('con cuotas del banco las respeta y un abono solo resta los meses que ahorra', () => {
    const d: Deuda = { ...base, cuotasRestantes: 15 }
    expect(estadoDeuda(d, [], '2026-03-02').restantes).toBe(15)
    const abono = mov({ valor: 200_000, deudaId: 1, abono: true, fecha: '2026-03-02' })
    expect(estadoDeuda(d, [abono], '2026-03-02').restantes).toBe(13) // 11 → 9 por la tasa
  })

  it('sin saldo ni tasa cuenta cuotas y estima la última', () => {
    const d: Deuda = { ...base, saldo: null, tasaEA: null, cuotasRestantes: 55, saldoFecha: '2026-11-24' }
    const e = estadoDeuda(d, [], '2026-11-24')
    expect(e.restantes).toBe(55)
    expect(e.ultima).toBe('2031-06') // la cuota de noviembre ya iba incluida en el saldo de referencia
    expect(simular(d, e, 100_000)).toBeNull()
  })
})

describe('csv', () => {
  it('usa ; y escapa notas', () => {
    const t = csv(datos([mov({ valor: 1000, nota: 'pan; leche "deslac"' })]))
    expect(t.startsWith('﻿Fecha;')).toBe(true)
    expect(t).toContain(';-1000;"pan; leche ""deslac""";')
  })
})

describe('pausas', () => {
  const pausados = recs.map((r) => (r.id === 3 ? { ...r, pausa: { desde: '2026-03', hasta: '2026-04' } } : r))
  const d = { ...datos(), recs: pausados }
  it('un pago pausado no se cobra, no se espera ni cuenta en el presupuesto, y vuelve solo', () => {
    expect(ocurrencias(pausados, '2026-03').map((o) => o.r.nombre)).not.toContain('Gym')
    expect(ocurrencias(pausados, '2026-04').map((o) => o.r.nombre)).toContain('Gym')
    expect(flujo({ mes: '2026-03', q: 2 }, d).porPagar).toBe(20_000)
    expect(presupuesto('2026-03', d).find((x) => x.categoria === 'Salud')).toBeUndefined()
    expect(presupuesto('2026-04', d).find((x) => x.categoria === 'Salud')?.plan).toBe(100_000)
  })
})

describe('tarjeta que acumula', () => {
  const tarjeta: Deuda = {
    id: 9, nombre: 'Tarjeta', entidad: 'N', cuota: 0, dia: 18, saldo: 300_000, saldoFecha: '2026-03-05', tasaEA: null,
    cuotasRestantes: null, modoAbono: 'plazo', prioridad: 0, tarjeta: { acumula: true, pagoFecha: '2026-03-20' },
  }
  it('suma cargos nuevos y resta pagos', () => {
    const movs = [
      mov({ valor: 99_000, medio: 'nubank', vence: '2026-03-01' }), // ya iba en el saldo
      mov({ valor: 50_000, medio: 'nubank', recurrenteId: 2, vence: '2026-03-10', fecha: '2026-03-10' }),
      mov({ valor: 100_000, deudaId: 9, fecha: '2026-03-21', categoria: PAGO_TARJETA }),
    ]
    expect(saldoTarjeta(tarjeta, movs)).toBe(250_000)
    expect(saldoTarjeta({ ...tarjeta, tarjeta: { acumula: false, pagoFecha: null } }, movs)).toBe(200_000)
  })
  it('los cargos no salen de la cuenta; el pago de la tarjeta sí, en su fecha', () => {
    const d = datos([mov({ valor: 40_000, medio: 'nubank', fecha: '2026-03-16', categoria: 'Salidas' })], [tarjeta])
    expect(flujo({ mes: '2026-03', q: 1 }, d).porPagar).toBe(1_100_000) // sin el celular de Nubank
    const q2 = flujo({ mes: '2026-03', q: 2 }, d)
    expect(q2.salio).toBe(0)
    expect(q2.porPagar).toBe(340_000) // solo la tarjeta: 300.000 + 40.000 de la salida
  })
  it('el pago de la tarjeta no cuenta como gasto en el presupuesto', () => {
    const pago = mov({ valor: 100_000, deudaId: 9, fecha: '2026-03-21', categoria: PAGO_TARJETA })
    expect(presupuesto('2026-03', datos([pago], [tarjeta])).map((x) => x.categoria)).not.toContain(PAGO_TARJETA)
  })
})

describe('cuadre con el saldo real', () => {
  const cuadre = { fecha: '2026-03-24', creado: 1000, saldo: 2_000_000, reserva: 500_000, fondo: 300_000 }
  const conCuadre = (movs: Movimiento[] = []): Datos => ({ ...datos(movs), cfg: { ...cfg, cuadre } })
  const hoyQ2 = '2026-03-24'
  const p = { mes: '2026-03', q: 2 as const }

  it('parte del saldo y aparta fondo, reserva, pagos y presupuesto', () => {
    const f = flujo(p, conCuadre(), hoyQ2)
    expect(f.cuadre?.saldo).toBe(2_000_000)
    expect(f.porPagar).toBe(120_000) // gym y nube siguen pendientes aunque vencieron
    expect(f.libre).toBe(2_000_000 - 300_000 - 500_000 - 120_000 - 100_000)
  })
  it('descuenta solo lo registrado después del cuadre y deja la quincena siguiente para su periodo', () => {
    const base = flujo(p, conCuadre(), hoyQ2).libre
    const movs = [
      mov({ valor: 70_000, fecha: '2026-03-23', creado: 500 }), // ya estaba reflejado en el saldo
      mov({ valor: 50_000, fecha: '2026-03-24', creado: 2000 }),
      mov({ tipo: 'ingreso', valor: 1_000_000, fecha: '2026-03-30', categoria: 'Quincena', creado: 2001 }),
    ]
    expect(flujo(p, conCuadre(movs), hoyQ2).libre).toBe(base - 50_000)
  })
  it('abonar al fondo no cambia el saldo pero sí lo libre', () => {
    const abono = mov({ valor: 100_000, fecha: '2026-03-24', creado: 2000, categoria: 'Fondo de emergencia' })
    const f = flujo(p, conCuadre([abono]), hoyQ2)
    expect(f.cuadre?.saldo).toBe(2_000_000)
    expect(fondoActual(conCuadre([abono]))).toBe(400_000)
    expect(f.libre).toBe(flujo(p, conCuadre(), hoyQ2).libre - 100_000)
  })
  it('en la quincena siguiente espera su quincena y usa la reserva', () => {
    const f = flujo({ mes: '2026-04', q: 1 }, conCuadre(), '2026-04-02')
    expect(f.cuadre?.esperada).toBe(1_000_000)
    expect(f.cuadre?.guardar).toBe(0)
    expect(flujo({ mes: '2026-04', q: 1 }, conCuadre(), '2026-03-24').cuadre).toBeNull() // otra quincena: plan
  })
})

describe('ahorro que te debes', () => {
  it('suma las cajitas que tocaban y resta lo aportado', () => {
    const cajita: Recurrente = { id: 8, nombre: 'Cajita', categoria: 'Ahorro', valor: 100_000, dia: 15, medio: 'cuenta', tipo: 'fijo', activo: true }
    const d: Datos = { ...datos([mov({ valor: 100_000, categoria: 'Ahorro', fecha: '2026-03-15' })]), recs: [cajita], cfg: { ...cfg, inicio: '2026-03-01' } }
    expect(ahorroDebido(d, '2026-04-20')).toBe(100_000)
    expect(ahorroDebido(d, '2026-04-10')).toBe(0)
  })
})
