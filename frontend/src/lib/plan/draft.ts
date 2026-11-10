import { DAY_MINUTES, scheduledMinutes } from '@/lib/agenda/layout'
import type { PlanBlock, PlanBlockInput, PlanListRef, PlanTaskRef } from '@/types'

/** The step of the grid: a drop, a move and a pull of the bottom edge snap to it (PLAN-04, PLAN-05). */
export const SNAP_MINUTES = 15

/** A task block lasts from 5 min to 24 h (PLAN-05). */
export const TASK_MINUTES = { min: 5, max: 1440 } as const
/** A break lasts from 5 to 120 min, the limit of the Intervalo (PLAN-17). */
export const BREAK_MINUTES = { min: 5, max: 120 } as const

/** A block of the draft; `start` is in minutes since midnight and `key` tells two blocks of one task apart. */
export type DraftBlock =
  | { key: string; kind: 'task'; start: number; minutes: number; task: PlanTaskRef }
  | { key: string; kind: 'break'; start: number; minutes: number; name: string; list: PlanListRef }

/** What is dropped on the grid: a task from the list, or a break (PLAN-04, PLAN-15). */
/** What the draft can hold: a task or a break. */
export type DraftItem = { kind: 'task'; task: PlanTaskRef } | { kind: 'break'; name: string; minutes: number; list: PlanListRef }

/** What the side list drops on the grid: a draft item, or a task to create first in `list` (PLAN-48). */
export type DropItem = DraftItem | { kind: 'new'; estimate: number | null; list: PlanListRef }

/** Why the last change was refused: a break out of 5 to 120 min (PLAN-17). */
export type DraftError = 'break_range'

export interface DraftState {
  /** The blocks as saved, to tell whether the draft changed (PLAN-07). */
  saved: DraftBlock[]
  blocks: DraftBlock[]
  error: DraftError | null
  /** The next key of a new block; the reducer stays pure. */
  next: number
}

export type DraftAction =
  | { type: 'add'; item: DraftItem; start: number }
  | { type: 'move'; key: string; start: number }
  | { type: 'resize'; key: string; minutes: number }
  | { type: 'edit'; key: string; start?: number; minutes?: number; list?: PlanListRef }
  | { type: 'remove'; key: string }
  | { type: 'reset'; saved: PlanBlock[] }

/** The body of a block for `PUT /api/plans/:day`. */
export type BlockInput = PlanBlockInput

export const emptyDraft: DraftState = { saved: [], blocks: [], error: null, next: 1 }

/** A task block from 5 min to 24 h (PLAN-05). */
export const clampTask = (minutes: number) => Math.min(TASK_MINUTES.max, Math.max(TASK_MINUTES.min, minutes))

/** A break from 5 to 120 min; anything else is refused, not clamped (PLAN-17). */
export function clampBreak(minutes: number): { ok: true; minutes: number } | { ok: false; error: DraftError } {
  if (minutes < BREAK_MINUTES.min || minutes > BREAK_MINUTES.max) return { ok: false, error: 'break_range' }
  return { ok: true, minutes }
}

const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const minuteOfClock = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

/** A start within the day: 00:00 to 23:59. */
const dayStart = (minute: number) => Math.min(DAY_MINUTES - 1, Math.max(0, minute))

/** The length a block takes, by its kind, or the error that refuses it. */
function lengthOf(block: DraftBlock, minutes: number): { minutes: number } | { error: DraftError } {
  if (block.kind === 'task') return { minutes: clampTask(minutes) }
  const checked = clampBreak(minutes)
  return checked.ok ? { minutes: checked.minutes } : { error: checked.error }
}

function change(state: DraftState, key: string, update: (block: DraftBlock) => DraftBlock | DraftError): DraftState {
  const index = state.blocks.findIndex((block) => block.key === key)
  if (index === -1) return state
  const updated = update(state.blocks[index]!)
  if (typeof updated === 'string') return { ...state, error: updated }
  const blocks = [...state.blocks]
  blocks[index] = updated
  return { ...state, blocks, error: null }
}

/** The draft of a day plan (PLAN-D1): nothing here is saved until the page sends the whole day. */
export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'add': {
      const start = Math.min(DAY_MINUTES - SNAP_MINUTES, Math.max(0, Math.floor(action.start / SNAP_MINUTES) * SNAP_MINUTES))
      const key = `new-${state.next}`
      let block: DraftBlock
      if (action.item.kind === 'task') {
        block = { key, kind: 'task', start, minutes: clampTask(scheduledMinutes(action.item.task.estimate_minutes)), task: action.item.task }
      } else {
        const checked = clampBreak(action.item.minutes)
        if (!checked.ok) return { ...state, error: checked.error }
        block = { key, kind: 'break', start, minutes: checked.minutes, name: action.item.name, list: action.item.list }
      }
      return { ...state, blocks: [...state.blocks, block], error: null, next: state.next + 1 }
    }
    case 'move':
      return change(state, action.key, (block) => ({
        ...block,
        start: Math.min(DAY_MINUTES - SNAP_MINUTES, Math.max(0, Math.round(action.start / SNAP_MINUTES) * SNAP_MINUTES)),
      }))
    case 'resize':
      return change(state, action.key, (block) => {
        // The bottom edge lands on a quarter, at least one quarter after the start.
        const earliestEnd = Math.floor(block.start / SNAP_MINUTES) * SNAP_MINUTES + SNAP_MINUTES
        const end = Math.max(earliestEnd, Math.round((block.start + action.minutes) / SNAP_MINUTES) * SNAP_MINUTES)
        const length = lengthOf(block, end - block.start)
        return 'error' in length ? length.error : { ...block, minutes: length.minutes }
      })
    case 'edit':
      return change(state, action.key, (block) => {
        let next: DraftBlock = action.start === undefined ? block : { ...block, start: dayStart(action.start) }
        if (action.minutes !== undefined) {
          const length = lengthOf(next, action.minutes)
          if ('error' in length) return length.error
          next = { ...next, minutes: length.minutes }
        }
        if (action.list !== undefined && next.kind === 'break') next = { ...next, list: action.list }
        return next
      })
    case 'remove':
      return { ...state, blocks: state.blocks.filter((block) => block.key !== action.key), error: null }
    case 'reset': {
      const blocks: DraftBlock[] = action.saved.map((block) =>
        block.kind === 'task'
          ? { key: block.id, kind: 'task', start: minuteOfClock(block.start), minutes: block.minutes, task: block.task }
          : { key: block.id, kind: 'break', start: minuteOfClock(block.start), minutes: block.minutes, name: block.name, list: block.list },
      )
      return { saved: blocks, blocks, error: null, next: state.next }
    }
  }
}

/** The blocks as `PUT /api/plans/:day` takes them (PLAN-08). */
export function toInput(blocks: DraftBlock[]): BlockInput[] {
  return blocks.map((block) =>
    block.kind === 'task'
      ? { kind: 'task', task_id: block.task.id, start: clockOf(block.start), minutes: block.minutes }
      : {
          kind: 'break',
          // A saved break goes back with its id, so the server keeps it started if its Intervalo began (PLAN-49).
          ...(block.key.startsWith('new-') ? {} : { id: block.key }),
          name: block.name,
          list_id: block.list.id,
          start: clockOf(block.start),
          minutes: block.minutes,
        },
  )
}

/** What the server keeps of the blocks, in a fixed order: the same plan reads the same. */
const signature = (blocks: DraftBlock[]) =>
  JSON.stringify(
    toInput(blocks)
      .map((block) => JSON.stringify(block))
      .sort(),
  )

/** The draft differs from the saved plan (PLAN-07, PLAN-11). */
export const isDirty = (state: DraftState) => signature(state.blocks) !== signature(state.saved)
