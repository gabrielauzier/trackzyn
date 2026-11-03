import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { buildMenuTemplate, menuStrings } from './menu'
import { createSwitchServer } from './switch-server'

function fileMenu(template: MenuItemConstructorOptions[], label: string) {
  const file = template.find((item) => item.label === label)
  return (file?.submenu ?? []) as MenuItemConstructorOptions[]
}

describe('application menu', () => {
  it('File menu has Switch server', () => {
    const onSwitchServer = vi.fn()
    const strings = menuStrings('en')
    const template = buildMenuTemplate({ isMac: false, strings, onSwitchServer })
    const item = fileMenu(template, strings.file).find((entry) => entry.id === 'switch-server')
    expect(item?.label).toBe('Switch server')
    ;(item?.click as () => void)()
    expect(onSwitchServer).toHaveBeenCalledTimes(1)
  })

  it('labels Switch server in Portuguese', () => {
    const strings = menuStrings('pt-BR')
    const template = buildMenuTemplate({ isMac: false, strings, onSwitchServer: vi.fn() })
    const item = fileMenu(template, strings.file).find((entry) => entry.id === 'switch-server')
    expect(item?.label).toBe('Trocar de servidor')
    expect(strings.file).toBe('Arquivo')
  })

  it('falls back to English for an unknown locale', () => {
    expect(menuStrings('fr').switchServer).toBe('Switch server')
    expect(menuStrings('pt-PT').switchServer).toBe('Trocar de servidor')
  })

  it('keeps the edit menu so paste works in the url field', () => {
    const template = buildMenuTemplate({ isMac: true, strings: menuStrings('en'), onSwitchServer: vi.fn() })
    expect(template.some((item) => item.role === 'editMenu')).toBe(true)
  })

  it('menu top level labels in en and pt-BR', () => {
    const cases = [
      ['en', ['File', 'Edit', 'View', 'Window', 'Help']],
      ['pt-BR', ['Arquivo', 'Editar', 'Exibir', 'Janela', 'Ajuda']],
    ] as const
    for (const [locale, labels] of cases) {
      const template = buildMenuTemplate({ isMac: false, strings: menuStrings(locale), onSwitchServer: vi.fn() })
      expect(template.map((item) => item.label), locale).toEqual([...labels])
      const file = fileMenu(template, labels[0])
      expect(file.some((entry) => entry.id === 'switch-server'), locale).toBe(true)
    }
  })

  it('keeps every top level menu on macOS after the app menu', () => {
    const template = buildMenuTemplate({ isMac: true, strings: menuStrings('en'), onSwitchServer: vi.fn() })
    expect(template[0].role).toBe('appMenu')
    expect(template.slice(1).map((item) => item.label)).toEqual(['File', 'Edit', 'View', 'Window', 'Help'])
  })

  it('opens the documentation from Help', () => {
    const onOpenDocs = vi.fn()
    const strings = menuStrings('en')
    const template = buildMenuTemplate({ isMac: false, strings, onSwitchServer: vi.fn(), onOpenDocs })
    const help = (template.find((item) => item.label === 'Help')?.submenu ?? []) as MenuItemConstructorOptions[]
    ;(help[0].click as () => void)()
    expect(help[0].label).toBe('trackzyn on GitHub')
    expect(onOpenDocs).toHaveBeenCalledTimes(1)
  })

  it('switch server opens the mode choice in local mode and the connect screen in remote mode', async () => {
    const calls: string[] = []
    let mode: 'remote' | 'local' | null = 'local'
    const switchServer = createSwitchServer({
      getMode: () => mode,
      stopLocal: async () => {
        calls.push('stop')
      },
      setMode: (value) => {
        calls.push(`mode:${value}`)
        mode = value
      },
      navigate: (url) => calls.push(`go:${url}`),
    })
    const template = buildMenuTemplate({ isMac: false, strings: menuStrings('en'), onSwitchServer: () => void switchServer() })
    const item = fileMenu(template, 'File').find((entry) => entry.id === 'switch-server')

    ;(item?.click as () => void)()
    await vi.waitFor(() => expect(calls).toContain('go:app://trackzyn/mode'))
    // The backend stops (cleanly) before the choice opens; the data stays where it is.
    expect(calls).toEqual(['stop', 'mode:null', 'go:app://trackzyn/mode'])

    calls.length = 0
    mode = 'remote'
    ;(item?.click as () => void)()
    await vi.waitFor(() => expect(calls).toContain('go:app://trackzyn/connect'))
    expect(calls).toEqual(['go:app://trackzyn/connect'])
  })
})
