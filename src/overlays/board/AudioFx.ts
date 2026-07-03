/**
 * Lightweight WebAudio sound effects (no asset files needed). Peg ticks, slot landings,
 * and jackpot flourishes. Plays from the board overlay page so OBS captures it via
 * "Control audio via OBS". Custom uploaded sounds arrive in a later milestone.
 */
export class AudioFx {
  private ctx: AudioContext | null = null
  private lastPeg = 0

  arm(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) this.ctx = new Ctor()
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  private tone(freq: number, durationMs: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(gain, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000)
    osc.connect(g).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + durationMs / 1000)
  }

  peg(): void {
    // Rate-limit the ticks so a fast bounce chain doesn't machine-gun.
    const now = this.ctx?.currentTime ?? 0
    if (now - this.lastPeg < 0.02) return
    this.lastPeg = now
    this.tone(680 + Math.random() * 240, 40, 'triangle', 0.025)
  }

  land(): void {
    this.tone(330, 120, 'sine', 0.05)
    this.tone(494, 160, 'sine', 0.04)
  }

  jackpot(): void {
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 180, 'square', 0.05), i * 90))
  }
}
