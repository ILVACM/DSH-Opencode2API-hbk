import { OpencodeLocalCard } from './OpencodeLocalCard.tsx'
import { ThinkingLevelSelect } from './ThinkingLevelSelect.tsx'
import { zh, en } from './locales.ts'
import { CARD_CSS } from './styles.ts'

export const name = 'opencode-local-client'
export const inject = ['slots', 'locale']

export function apply(ctx: any): void {
  try {
    if (typeof document !== 'undefined') {
      const id = 'opencode-local/css'
      let tag = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
      if (!tag) { tag = document.createElement('style'); tag.dataset.pluginCss = id; document.head.appendChild(tag) }
      tag.textContent = CARD_CSS
    }
    const ns = 'settings.opencode-local'
    ctx.effect?.(() => ctx.locale.register(ns, { zh, en }))
    const t = ctx.locale.bind(ns)
    const forms = ctx.get?.('configForms')
    let scope: any = undefined
    let cardDisposer: any = undefined
    let composerDisposer: any = undefined
    const registerCard = () => {
      if (cardDisposer) { try { cardDisposer() } catch { /* ignore */ } }
      cardDisposer = ctx.slots.register({
        name: 'settings.section', id: 'opencode-local', order: 50,
        label: () => t('nav.panel'), locale: ns, inject: () => ({ t, scope, surface: 'settings' }),
      }, OpencodeLocalCard)
    }
    const registerComposer = () => {
      if (composerDisposer) { try { composerDisposer() } catch { /* ignore */ } }
      composerDisposer = ctx.slots.register({
        name: 'conversation.input.right', id: 'opencode-local-thinking', order: 5, locale: ns,
        inject: () => ({ t, scope }),
      }, ThinkingLevelSelect)
    }
    ctx.slots.inject('settings.section', () => {
      registerCard()
      if (forms?.whileServed) {
        ctx.effect?.(() => forms.whileServed(
          ['opencode-local', ns, 'include:opencode-local'],
          (served: Set<string>) => {
            const found = [...served].find((x: string) => /opencode-local/.test(x))
            scope = found ? forms.get(found) : undefined
            registerCard()
            registerComposer()
            return () => { /* disposers cleaned below */ }
          },
        ))
      } else if (forms?.get) {
        scope = forms.get('opencode-local')
        registerCard()
        registerComposer()
      }
      return () => {
        try { cardDisposer?.() } catch { /* ignore */ }
        try { composerDisposer?.() } catch { /* ignore */ }
      }
    })
    ctx.slots.inject('conversation.input.right', () => {
      registerComposer()
      return () => { try { composerDisposer?.() } catch { /* ignore */ } }
    })
  } catch (e) {
    console.error('[opencode-local] client card failed to load:', e)
  }
}