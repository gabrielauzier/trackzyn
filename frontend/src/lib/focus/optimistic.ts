import { uuid } from '@/lib/focus/uuid'
import type { FocusSession, FocusState } from '@/types'

/** A focus action as the client sends it (AD-002): the route after `/api/focus/` and its payload. */
export type FocusActionPayload =
  | { type: 'start'; task_id: string; takeover?: boolean }
  | { type: 'pause' }
  | { type: 'skip'; task_id: string }
  | { type: 'complete'; task_id: string }
  | { type: 'extend'; task_id: string }
  | { type: 'break'; minutes: number; list_id: string }
  | { type: 'break/end' }
  | { type: 'heartbeat' }
  | { type: 'recover'; decision: 'keep' | 'cut' }

/**
 * The payload plus what every action carries, and the list whose focus screen sent it (where a new
 * session opens). `heartbeat` has no `occurred_at` on the wire.
 */
export type FocusAction = FocusActionPayload & { occurred_at: string; device_id: string; list_id: string }

/** The answer the server would give instead of a state: 409 or 422 with its `code`. */
export class FocusRefusal extends Error {
  readonly status: 409 | 422
  readonly code: 'invalid_transition' | 'focus_elsewhere' | 'invalid_time' | undefined

  constructor(status: 409 | 422, code?: FocusRefusal['code']) {
    super(code ?? `focus action refused with ${status}`)
    this.status = status
    this.code = code
  }
}

const STALE_AFTER_MS = 120_000

type TaskView = FocusState['today']['tasks'][number]
interface ModelTask extends Omit<TaskView, 'spent_seconds'> {
  spentMs: number
}
interface ModelSession extends FocusSession {
  /** Known only for a session this transition opened or refreshed, or one the server reported stale. */
  lastSeenMs: number | null
}
interface Model {
  session: ModelSession | null
  /** The pending tasks of Today in board order. */
  today: ModelTask[]
  /** The task in focus when it is not in Today of this list (a session on another list). */
  outside: ModelTask | null
  done: number
}

const refuse = () => new FocusRefusal(409, 'invalid_transition')

function toModel(state: FocusState): Model {
  const today = state.today.tasks.map(({ spent_seconds, ...task }) => ({ ...task, spentMs: spent_seconds * 1000 }))
  const focused = state.task
  const outside =
    focused && !today.some((task) => task.id === focused.id)
      ? { ...focused, position: 0, spentMs: focused.spent_seconds * 1000 }
      : null
  const session = state.session && {
    ...state.session,
    lastSeenMs: state.stale?.session_id === state.session.id ? Date.parse(state.stale.last_seen_at) : null,
  }
  return { session, today, outside, done: state.today.done }
}

function findTask(model: Model, id: string | null): ModelTask | undefined {
  return model.today.find((task) => task.id === id) ?? (model.outside?.id === id ? model.outside : undefined)
}

/**
 * Lets time pass from `fromMs` to `toMs` as the server's settlement does (AD-001): the open task
 * session adds to its task's time, and a session whose deadline is reached closes exactly there; a
 * task closed by its estimate awaits `Estender` (FOCUS-10, FOCUS-11, BREAK-03, BREAK-05).
 */
function advance(model: Model, fromMs: number, toMs: number): void {
  const session = model.session
  if (!session || toMs <= fromMs) return
  const deadline = session.deadline_at === null ? null : Date.parse(session.deadline_at)
  const until = deadline !== null && deadline <= toMs ? deadline : toMs
  const task = session.kind === 'task' ? findTask(model, session.task_id) : undefined
  if (task) task.spentMs += Math.max(0, until - fromMs)
  if (deadline !== null && deadline <= toMs) {
    if (task) task.awaiting_extend = true
    model.session = null
  }
}

/** Ends the open session at the action; only the estimate leaves its task awaiting `Estender`. */
function endSession(model: Model): void {
  const task = model.session?.kind === 'task' ? findTask(model, model.session.task_id) : undefined
  if (task) task.awaiting_extend = false
  model.session = null
}

/** The same rule as the server's `openTaskSession`: the deadline is what is left of the estimate. */
function openTaskSession(model: Model, task: ModelTask, atMs: number, deviceId: string, listId: string): void {
  let deadline: number | null = null
  if (task.estimate_minutes !== null) {
    const leftMs = task.estimate_minutes * 60_000 - task.spentMs
    if (leftMs > 0) deadline = atMs + leftMs
    else if (task.awaiting_extend) return
  }
  openSession(model, { kind: 'task', task_id: task.id, list_id: listId, deadline, planned: null }, atMs, deviceId)
  task.awaiting_extend = false
}

function openSession(
  model: Model,
  opened: { kind: FocusSession['kind']; task_id: string | null; list_id: string; deadline: number | null; planned: number | null },
  atMs: number,
  deviceId: string,
): void {
  model.session = {
    id: uuid(),
    kind: opened.kind,
    task_id: opened.task_id,
    list_id: opened.list_id,
    device_id: deviceId,
    started_at: new Date(atMs).toISOString(),
    deadline_at: opened.deadline === null ? null : new Date(opened.deadline).toISOString(),
    planned_seconds: opened.planned,
    lastSeenMs: atMs,
  }
}

/** The task of Today the action is about; the open session must be on it or absent (FOCUS-18). */
function focusedTask(model: Model, taskId: string): ModelTask {
  const task = model.today.find((candidate) => candidate.id === taskId)
  if (!task) throw refuse()
  const open = model.session
  if (open && (open.kind !== 'task' || open.task_id !== task.id)) throw refuse()
  return task
}

function startNext(model: Model, atMs: number, deviceId: string, listId: string): void {
  const [next] = model.today
  if (next) openTaskSession(model, next, atMs, deviceId, listId)
}

function renumber(model: Model): void {
  model.today.forEach((task, position) => {
    task.position = position
  })
}

function apply(model: Model, action: FocusAction, atMs: number, nowMs: number, listId: string): void {
  const device = action.device_id
  const open = model.session
  switch (action.type) {
    case 'start': {
      const task = model.today.find((candidate) => candidate.id === action.task_id)
      if (!task) throw refuse()
      if (open) {
        // A stale session waits for `recover` (SYNC-11).
        if (open.lastSeenMs !== null && nowMs - open.lastSeenMs > STALE_AFTER_MS) throw refuse()
        const here = open.device_id === device
        if (!here && !action.takeover) throw new FocusRefusal(409, 'focus_elsewhere')
        if (open.kind === 'task' && open.task_id === task.id) {
          if (!here) model.session = { ...open, device_id: device, lastSeenMs: atMs }
          return
        }
        if (open.kind === 'break' && here) throw refuse()
        endSession(model)
      }
      openTaskSession(model, task, atMs, device, listId)
      return
    }
    case 'pause':
      if (open?.kind !== 'task') throw refuse()
      endSession(model)
      return
    case 'skip': {
      const task = focusedTask(model, action.task_id)
      if (model.today.length <= 1) throw refuse()
      if (open) endSession(model)
      model.today = [...model.today.filter((candidate) => candidate !== task), task]
      renumber(model)
      startNext(model, atMs, device, listId)
      return
    }
    case 'complete': {
      const task = focusedTask(model, action.task_id)
      if (open) endSession(model)
      model.today = model.today.filter((candidate) => candidate !== task)
      model.done += 1
      renumber(model)
      startNext(model, atMs, device, listId)
      return
    }
    case 'extend': {
      const task = focusedTask(model, action.task_id)
      if (open || !task.awaiting_extend) throw refuse()
      openSession(model, { kind: 'task', task_id: task.id, list_id: listId, deadline: null, planned: null }, atMs, device)
      task.awaiting_extend = false
      return
    }
    case 'break':
      if (open?.kind === 'break') throw refuse()
      if (open) endSession(model)
      openSession(
        model,
        { kind: 'break', task_id: null, list_id: action.list_id, deadline: atMs + action.minutes * 60_000, planned: action.minutes * 60 },
        atMs,
        device,
      )
      return
    case 'break/end':
      if (open?.kind !== 'break') throw refuse()
      endSession(model)
      return
    case 'heartbeat':
      if (!open || open.device_id !== device) throw refuse()
      // A session left without signal waits for the user's decision (SYNC-11).
      if (open.lastSeenMs !== null && nowMs - open.lastSeenMs > STALE_AFTER_MS) throw refuse()
      model.session = { ...open, lastSeenMs: nowMs }
      return
    case 'recover': {
      if (!open || open.lastSeenMs === null || nowMs - open.lastSeenMs <= STALE_AFTER_MS) throw refuse()
      if (action.decision === 'keep') {
        model.session = { ...open, lastSeenMs: nowMs }
        return
      }
      // Cut at the last signal: the time counted after it is given back.
      const task = open.kind === 'task' ? findTask(model, open.task_id) : undefined
      if (task) task.spentMs -= Math.max(0, atMs - open.lastSeenMs)
      endSession(model)
      return
    }
  }
}

function toView(task: ModelTask): TaskView {
  const { spentMs, ...rest } = task
  return { ...rest, spent_seconds: Math.floor(spentMs / 1000) }
}

function toState(model: Model, nowMs: number): FocusState {
  const session = model.session
  const today = model.today.map(toView)
  const focused = session?.kind === 'task' ? findTask(model, session.task_id) : model.today[0]
  const view = focused && toView(focused)
  const task: FocusState['task'] = view
    ? { id: view.id, title: view.title, estimate_minutes: view.estimate_minutes, spent_seconds: view.spent_seconds, awaiting_extend: view.awaiting_extend }
    : null
  let sessionView: FocusSession | null = null
  let stale: FocusState['stale'] = null
  if (session) {
    const { lastSeenMs, ...rest } = session
    sessionView = rest
    if (lastSeenMs !== null && nowMs - lastSeenMs > STALE_AFTER_MS) {
      stale = { session_id: session.id, last_seen_at: new Date(lastSeenMs).toISOString(), seconds: Math.floor((nowMs - lastSeenMs) / 1000) }
    }
  }
  return {
    server_now: new Date(nowMs).toISOString(),
    session: sessionView,
    task,
    today: {
      pending: today.length,
      done: model.done,
      estimate_minutes: today.reduce((sum, item) => sum + (item.estimate_minutes ?? 0), 0),
      tasks: today,
    },
    stale,
  }
}

/**
 * The same transition the server applies (design, "Transições"), to show an action at once without
 * a connection (SYNC-05): time passes from the state's `server_now` to the action's `occurred_at`,
 * the action applies there, and the state is answered at `nowMs`, as the server answers at its `now`.
 * A refused action throws `FocusRefusal` with the server's status and code. The server's answer
 * always replaces this state.
 */
export function applyOptimistic(state: FocusState, action: FocusAction, nowMs: number): FocusState {
  if (action.type === 'break' && (!Number.isInteger(action.minutes) || action.minutes < 1 || action.minutes > 120)) {
    throw new FocusRefusal(422)
  }
  const model = toModel(state)
  const listId = action.list_id
  const atMs = action.type === 'heartbeat' ? nowMs : Date.parse(action.occurred_at)
  const fromMs = Date.parse(state.server_now)
  advance(model, fromMs, atMs)
  apply(model, action, atMs, nowMs, listId)
  advance(model, atMs, nowMs)
  return toState(model, nowMs)
}
