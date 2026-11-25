import { Deudas } from './pages/Deudas'
import { Gasto } from './pages/Gasto'
import { Hoy } from './pages/Hoy'
import { Mas } from './pages/Mas'
import { Pagos } from './pages/Pagos'
import { useRuta } from './lib/ruta'

// Máximo 3–4 pestañas. Cada una es una pantalla de src/pages.
const TABS = [
  { ruta: '/hoy', label: 'Hoy', emoji: '☀️', Pantalla: Hoy },
  { ruta: '/pagos', label: 'Pagos', emoji: '✅', Pantalla: Pagos },
  { ruta: '/deudas', label: 'Deudas', emoji: '📉', Pantalla: Deudas },
  { ruta: '/mas', label: 'Más', emoji: '⋯', Pantalla: Mas },
]

export default function App() {
  const { ruta, params } = useRuta()
  const esGasto = ruta.startsWith('/gasto') // registro rápido: el Atajo abre #/gasto
  const actual = TABS.find((t) => ruta.startsWith(t.ruta)) ?? TABS[0]
  const Pantalla = esGasto ? Gasto : actual.Pantalla
  return (
    <>
      <main className="mx-auto max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-28">
        <Pantalla key={ruta + params} />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-linea bg-papel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <a
              key={t.ruta}
              href={`#${t.ruta}`}
              aria-current={!esGasto && t === actual ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${!esGasto && t === actual ? 'text-acento' : 'text-suave'}`}
            >
              <span className="text-xl leading-6">{t.emoji}</span>
              {t.label}
            </a>
          ))}
        </div>
      </nav>
    </>
  )
}
