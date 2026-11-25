import { describe, expect, it } from 'vitest'
import type { Config, Datos, Deuda, Movimiento, Recurrente } from '../db'
import {
  cop,
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
