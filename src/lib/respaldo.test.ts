import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../db'
import { exportar, importar } from './respaldo'

describe('respaldo', () => {
  it('exporta e importa todas las tablas sin perder datos', async () => {
    await db.movimientos.add({ fecha: '2026-01-01', tipo: 'gasto', valor: 1000, categoria: 'Mercado', medio: 'cuenta', creado: 1 })
    await db.deudas.add({ nombre: 'X', entidad: 'Y', cuota: 1, dia: 1, saldo: null, saldoFecha: '2026-01-01', tasaEA: null, cuotasRestantes: null, modoAbono: 'plazo', prioridad: 1 })
    const archivo = await exportar()
    await db.movimientos.clear()
    await db.deudas.clear()
    await importar(archivo)
    expect(await db.movimientos.toArray()).toMatchObject([{ fecha: '2026-01-01', valor: 1000 }])
    expect(await db.deudas.count()).toBe(1)
    expect(await db.ajustes.get('config')).toBeTruthy()
  })

  it('rechaza un archivo ajeno sin borrar lo que hay', async () => {
    const ajeno = new File([JSON.stringify({ app: 'otra', datos: {} })], 'x.json')
    await expect(importar(ajeno)).rejects.toThrow()
    expect(await db.movimientos.count()).toBe(1)
  })
})
