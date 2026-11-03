import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'
import { ChartsSection } from './charts'
import { ComposedSection } from './composed'
import { FormsSection } from './forms'
import { FoundationsSection } from './foundations'
import { PrimitivesSection } from './primitives'

const SECTIONS = ['foundations', 'primitives', 'forms', 'composed', 'charts'] as const

/**
 * Living catalogue of every component the template ships, rendered with the
 * real theme. Use it as a reference when building pages and as a visual
 * regression check after touching tokens or `components/ui`.
 */
export default function ComponentsShowcasePage() {
  const { t } = useTranslation()
  const [active, setActive] = useState<string>(SECTIONS[0])
  const navRef = useRef<HTMLElement>(null)

  // Highlight the last section whose heading has scrolled under the nav.
  useEffect(() => {
    const onScroll = () => {
      let current: string = SECTIONS[0]
      for (const id of SECTIONS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 160) current = id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // On narrow screens the tab row scrolls sideways; keep the active tab in it.
  useEffect(() => {
    const nav = navRef.current
    const link = nav?.querySelector<HTMLElement>(`a[href="#${active}"]`)
    if (!nav || !link) return
    const left = link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [active])

  // Scroll so the section heading lands just below the sticky nav.
  const jumpTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const navHeight = navRef.current?.getBoundingClientRect().height ?? 0
    const offset = window.innerWidth >= 1024 ? navHeight + 16 : navHeight + 72
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' })
  }

  return (
    <div>
      <PageHeader section={t('nav.groupDevelopers')} title={t('showcase.title')} />
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-muted-foreground">{t('showcase.intro')}</p>

      <nav ref={navRef} className="sticky top-14 z-30 -mx-4 mb-6 overflow-x-auto border-b border-border/60 bg-background/90 px-4 backdrop-blur lg:top-0 sm:-mx-6 sm:px-6">
        <ul className="flex gap-1 py-2">
          {SECTIONS.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault()
                  jumpTo(id)
                }}
                className={cn(
                  'block whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  active === id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(`showcase.${id}.title`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12 pb-16">
        <FoundationsSection />
        <PrimitivesSection />
        <FormsSection />
        <ComposedSection />
        <ChartsSection />
      </div>
    </div>
  )
}
