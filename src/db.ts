import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'

/** Toda la información vive en el teléfono (IndexedDB). Montos en pesos, enteros. Fechas YYYY-MM-DD. */
export type Medio = 'cuenta' | 'nubank'

export interface Movimiento {
  id?: number
  fecha: string // cuándo pasó
  tipo: 'gasto' | 'ingreso' | 'reserva'
  valor: number
  categoria: string
  medio: Medio
  nota?: string
  recurrenteId?: number
  vence?: string // pagos recurrentes y reserva: la fecha a la que corresponden (define mes y quincena)
  deudaId?: number
  abono?: boolean // abono extra a capital
  creado: number
}

export interface Recurrente {
  id?: number
  nombre: string
  categoria: string
  valor: number // lo que se cobra
  miParte?: number // si es compartido, lo que cuenta en el presupuesto
  dia: number | null // null = sin día fijo: es un presupuesto (mercado, transporte)
  medio: Medio
  tipo: 'fijo' | 'variable'
  estimado?: boolean
  enRevision?: boolean
  deudaId?: number
  compartido?: { con: string; cadaMeses: number; proximo: string }
  pausa?: { desde: string; hasta: string } // meses YYYY-MM: no se cobra desde `desde` y vuelve en `hasta`
  activo: boolean
}

export interface Deuda {
  id?: number
  nombre: string
  entidad: string
  cuota: number
  dia: number
  saldo: number | null // saldo en saldoFecha
  saldoFecha: string
  tasaEA: number | null // 0.071 = 7,1 % E.A.
  cuotasRestantes: number | null // en saldoFecha
  modoAbono: 'plazo' | 'cuota' // qué reduce un abono extra
  prioridad: number
  notas?: string
  enlace?: string
  // Tarjeta que se paga de una vez (Nubank). acumula: los cargos nuevos con ese medio suman al saldo
  // y salen de la cuenta solo cuando se paga la tarjeta.
  tarjeta?: { acumula: boolean; pagoFecha: string | null }
}

export interface Config {
  clave: 'config'
  quincenas: { q: 1 | 2; nombre: string; valor: number }[] // q1 paga del 1 al 14, q2 del 15 al fin de mes
  reserva: number // "Pagos del 1"
  inicio: string // pagos anteriores a esta fecha no salen como pendientes
  metaEmergencia: number | null
  pendientes: string[]
  // Saldo real de la cuenta en un momento: desde ahí la quincena actual se calcula con plata real.
  cuadre?: { fecha: string; creado: number; saldo: number; reserva: number; fondo: number }
}

class Base extends Dexie {
  movimientos!: Table<Movimiento, number>
  recurrentes!: Table<Recurrente, number>
  deudas!: Table<Deuda, number>
  ajustes!: Table<Config, string>
  constructor() {
    super('mi-plata')
    // Para cambiar el esquema, agrega this.version(2)… sin borrar la versión 1: así no se pierden datos.
    this.version(1).stores({ movimientos: '++id, fecha, tipo, recurrenteId, deudaId', recurrentes: '++id', deudas: '++id', ajustes: 'clave' })
    this.on('populate', (tx) => {
      tx.table('ajustes').add({
        clave: 'config',
        quincenas: [
          { q: 1, nombre: 'Quincena de fin de mes', valor: 0 },
          { q: 2, nombre: 'Quincena de mitad de mes', valor: 0 },
        ],
        reserva: 0,
        inicio: hoy(),
        metaEmergencia: null,
        pendientes: [],
      } satisfies Config)
    })
  }
}

export const db = new Base()

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })
/** Fecha de hoy en Colombia, YYYY-MM-DD. */
export const hoy = (d = new Date()) => fmtDia.format(d)

export interface Datos {
  movs: Movimiento[]
  recs: Recurrente[]
  deudas: Deuda[]
  cfg: Config
}

/** Todo junto: son pocos cientos de filas, no vale la pena consultar por partes. */
export const useDatos = () =>
  useLiveQuery(async (): Promise<Datos | null> => {
    const cfg = await db.ajustes.get('config')
    if (!cfg) return null
    return { movs: await db.movimientos.toArray(), recs: await db.recurrentes.toArray(), deudas: await db.deudas.orderBy('id').toArray(), cfg }
  }, [])

export const guardarConfig = (cambio: Partial<Config>) => db.ajustes.update('config', cambio)

export const pagar = (r: Recurrente, vence: string, valor = r.valor) =>
  db.movimientos.add({
    fecha: hoy(),
    tipo: 'gasto',
    valor,
    categoria: r.categoria,
    medio: r.medio,
    nota: r.nombre,
    recurrenteId: r.id,
    vence,
    deudaId: r.deudaId,
    creado: Date.now(),
  })
