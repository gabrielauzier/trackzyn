import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SoundKind } from '@/lib/sounds/synth'

interface Note {
  type: OscillatorType
  frequency: number
  start: number
  stop: number
}

/** An AudioContext that records the oscillators it is asked to schedule. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state: AudioContextState = 'running'
  currentTime = 2
  destination = {}
  notes: Note[] = []
  resume = vi.fn(async () => {
    this.state = 'running'
  })

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createOscillator() {
    const note: Note = { type: 'sine', frequency: 0, start: -1, stop: -1 }
    const oscillator = {
      set type(value: OscillatorType) {
        note.type = value
      },
      frequency: { setValueAtTime: (value: number) => (note.frequency = value) },
      connect: () => undefined,
      start: (at: number) => {
        note.start = at
        this.notes.push(note)
      },
      stop: (at: number) => (note.stop = at),
    }
    return oscillator
  }

  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: () => undefined,
    }
  }
}

const KINDS: SoundKind[] = ['complete', 'progress', 'estimate', 'break_end']

async function loadSynth() {
  vi.resetModules()
  return import('@/lib/sounds/synth')
}

/** The notes one sound schedules, with times relative to when it was played. */
async function notesOf(kind: SoundKind) {
  const { play } = await loadSynth()
  play(kind)
  const context = FakeAudioContext.instances.at(-1)!
  return context.notes.map((note) => ({ ...note, start: note.start - 2, stop: note.stop - 2 }))
}

beforeEach(() => {
  FakeAudioContext.instances = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('play (SOUND-05)', () => {
  it('plays complete as an ascending arpeggio of 3 notes', async () => {
    const notes = await notesOf('complete')

    expect(notes).toHaveLength(3)
    expect(notes[0].frequency).toBeLessThan(notes[1].frequency)
    expect(notes[1].frequency).toBeLessThan(notes[2].frequency)
    expect(notes[0].start).toBeLessThan(notes[1].start)
    expect(notes[1].start).toBeLessThan(notes[2].start)
  })

  it('plays progress as one short note', async () => {
    const notes = await notesOf('progress')

    expect(notes).toHaveLength(1)
    expect(notes[0].stop - notes[0].start).toBeLessThanOrEqual(0.15)
  })

  it('plays estimate as 2 descending notes', async () => {
    const notes = await notesOf('estimate')

    expect(notes).toHaveLength(2)
    expect(notes[0].frequency).toBeGreaterThan(notes[1].frequency)
    expect(notes[0].start).toBeLessThan(notes[1].start)
  })

  it('plays break_end as 3 equal beats, evenly spaced', async () => {
    const notes = await notesOf('break_end')

    expect(notes).toHaveLength(3)
    expect(new Set(notes.map((note) => note.frequency)).size).toBe(1)
    expect(notes[1].start - notes[0].start).toBeCloseTo(notes[2].start - notes[1].start, 6)
    expect(new Set(notes.map((note) => (note.stop - note.start).toFixed(6))).size).toBe(1)
  })

  it('schedules for each sound a sequence of frequencies different from the other 3', async () => {
    const sequences: string[] = []
    for (const kind of KINDS) {
      const notes = await notesOf(kind)
      for (const note of notes) {
        expect(note.start).toBeGreaterThanOrEqual(0)
        expect(note.stop).toBeGreaterThan(note.start)
      }
      sequences.push(JSON.stringify(notes.map((note) => note.frequency)))
    }

    expect(new Set(sequences).size).toBe(4)
  })

  it('schedules from the context clock, so a sound starts when it is played', async () => {
    const { play } = await loadSynth()
    play('progress')
    const context = FakeAudioContext.instances[0]
    context.currentTime = 40

    play('progress')

    expect(context.notes.map((note) => note.start)).toEqual([2, 40])
    expect(FakeAudioContext.instances).toHaveLength(1)
  })
})

describe('play before the first interaction (Edge Case: the browser blocks the first sound)', () => {
  it('does not queue a sound while the context is suspended and plays the next ones after the first pointerdown', async () => {
    class SuspendedContext extends FakeAudioContext {
      state: AudioContextState = 'suspended'
    }
    vi.stubGlobal('AudioContext', SuspendedContext)
    const { play } = await loadSynth()

    play('complete')
    const context = FakeAudioContext.instances[0]

    expect(context.notes).toHaveLength(0)

    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()

    expect(context.resume).toHaveBeenCalledTimes(1)
    play('estimate')
    expect(context.notes).toHaveLength(2)
  })
})
