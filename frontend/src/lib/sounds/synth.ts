/** The 4 focus sounds (SOUND-05). */
export type SoundKind = 'complete' | 'progress' | 'estimate' | 'break_end'

interface Note {
  frequency: number
  /** Seconds after the sound is played. */
  at: number
  duration: number
}

interface Recipe {
  type: OscillatorType
  notes: Note[]
}

// C5, E5, G5.
const C5 = 523.25
const E5 = 659.25
const G5 = 783.99

/** Each sound has its own waveform and its own notes, so none sounds like another (SOUND-05). */
const RECIPES: Record<SoundKind, Recipe> = {
  // An ascending arpeggio of 3 notes, short.
  complete: {
    type: 'triangle',
    notes: [
      { frequency: C5, at: 0, duration: 0.16 },
      { frequency: E5, at: 0.1, duration: 0.16 },
      { frequency: G5, at: 0.2, duration: 0.28 },
    ],
  },
  // A soft tick of 1 note.
  progress: { type: 'sine', notes: [{ frequency: 1046.5, at: 0, duration: 0.08 }] },
  // 2 descending notes.
  estimate: {
    type: 'sine',
    notes: [
      { frequency: G5, at: 0, duration: 0.3 },
      { frequency: C5, at: 0.28, duration: 0.45 },
    ],
  },
  // 3 equal beats.
  break_end: {
    type: 'square',
    notes: [
      { frequency: 440, at: 0, duration: 0.09 },
      { frequency: 440, at: 0.22, duration: 0.09 },
      { frequency: 440, at: 0.44, duration: 0.09 },
    ],
  },
}

const PEAK_GAIN = 0.2

let context: AudioContext | null = null

/**
 * The page's AudioContext, created on first use. A browser that blocks audio before the first
 * interaction creates it suspended; it is resumed on the first `pointerdown` (Edge Case of the spec).
 */
function audioContext(): AudioContext | null {
  if (context) return context
  if (typeof AudioContext === 'undefined') return null
  context = new AudioContext()
  if (context.state === 'suspended') {
    const resume = () => void context?.resume()
    window.addEventListener('pointerdown', resume, { once: true, capture: true })
  }
  return context
}

/**
 * Plays one of the 4 sounds, synthesized with oscillators and short envelopes, with no audio file
 * (SOUND-05). While the browser keeps the audio blocked, the sound is dropped instead of piling up
 * to play late.
 */
export function play(kind: SoundKind): void {
  const ctx = audioContext()
  if (!ctx || ctx.state !== 'running') return
  const { type, notes } = RECIPES[kind]
  const start = ctx.currentTime
  for (const note of notes) {
    const at = start + note.at
    const end = at + note.duration
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(note.frequency, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(at)
    oscillator.stop(end)
  }
}
