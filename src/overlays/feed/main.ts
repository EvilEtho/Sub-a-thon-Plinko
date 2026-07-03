import { connectOverlay } from '../shared/connect'
import { ServerEvents, type AlertPayload, type OverlayConfigPayload } from '@shared/types/socket'
import { applyCommon, setVars } from '../shared/overlayTheme'

const feedEl = document.getElementById('feed')!
let maxItems = 6
let lifetimeMs = 9000

const socket = connectOverlay('feed')

socket.on(ServerEvents.alert, (a: AlertPayload) => addItem(a))

socket.on(ServerEvents.overlayConfig, ({ overlay }: OverlayConfigPayload) => {
  applyCommon(overlay)
  setVars({
    '--feed-size': `${overlay.feedFontSize}px`,
    '--k-sub': overlay.feedSubColor,
    '--k-bits': overlay.feedBitsColor,
    '--k-donation': overlay.feedDonationColor,
    '--k-cc': overlay.feedCcColor,
    '--k-jackpot': overlay.feedJackpotColor,
    '--k-prize': overlay.feedPrizeColor
  })
  maxItems = overlay.feedMaxItems
  lifetimeMs = overlay.feedLifetimeSec * 1000
  while (feedEl.children.length > maxItems) feedEl.lastElementChild?.remove()
})

function addItem(a: AlertPayload): void {
  const el = document.createElement('div')
  el.className = `item k-${a.kind}`
  const who = document.createElement('span')
  who.className = 'who'
  who.textContent = a.title
  const what = document.createElement('span')
  what.className = 'what'
  what.textContent = a.detail ?? ''
  el.append(who, what)
  feedEl.prepend(el)

  while (feedEl.children.length > maxItems) {
    feedEl.lastElementChild?.remove()
  }

  setTimeout(() => {
    el.classList.add('leaving')
    setTimeout(() => el.remove(), 420)
  }, lifetimeMs)
}
