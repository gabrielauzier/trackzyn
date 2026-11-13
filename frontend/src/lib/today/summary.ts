import type { TFunction } from 'i18next'

import { formatDuration } from '@/components/board/format-duration'
import type { TodayDoneTask } from '@/types'

export type CloseDestination = 'tomorrow' | 'this_week' | 'backlog'

/** What the summary of the day reads (HOJE-63); durations in seconds. */
export interface SummaryInput {
  workspace: string
  /** Today, `YYYY-MM-DD`. */
  day: string
  focusedSeconds: number
  /** The tasks done today. */
  doneCount: number
  /** The tasks of today's plan; null without a saved plan. */
  plannedCount: number | null
  /** Percent; null without task blocks so far. */
  adherence: number | null
  done: (Pick<TodayDoneTask, 'title' | 'spent_seconds' | 'verdict' | 'diff_seconds'> & { list: string })[]
  later: { title: string; to: CloseDestination }[]
  note: string
}

/**
 * The summary of the day in Markdown (HOJE-63): a title with the workspace and the date, the numbers, `### Feito` with
 * the time, the deviation past or under the estimate and the list of each task, `### Ficou para depois` with the
 * destination of each pending task, and the note of the day at the end when there is one.
 */
export function summaryMarkdown(input: SummaryInput, t: TFunction, language: string): string {
  const duration = (seconds: number) => formatDuration(seconds, language)
  const date = new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${input.day}T12:00:00Z`))
  const numbers = [
    t('today.summary.focused', { duration: duration(input.focusedSeconds) }),
    input.plannedCount === null
      ? t('today.summary.doneCount', { count: input.doneCount })
      : t('today.summary.doneOfPlanned', { done: input.doneCount, planned: input.plannedCount }),
    ...(input.adherence === null ? [] : [t('today.summary.adherence', { percent: input.adherence })]),
  ].join(' · ')

  const done = input.done.map((task) => {
    // The deviation only past or under the estimate: on time and without an estimate say none.
    const deviation =
      task.verdict === 'late' ? [`+${duration(task.diff_seconds)}`] : task.verdict === 'early' ? [`-${duration(-task.diff_seconds)}`] : []
    return `- [x] ${task.title} (${[duration(task.spent_seconds), ...deviation, task.list].join(', ')})`
  })
  const later = input.later.map((task) => `- ${task.title} → ${t(`today.summary.to.${task.to}`)}`)
  const note = input.note.trim()

  return [
    t('today.summary.title', { workspace: input.workspace, date }),
    numbers,
    '',
    t('today.summary.done'),
    ...(done.length > 0 ? done : [t('today.summary.nothingDone')]),
    '',
    t('today.summary.later'),
    ...(later.length > 0 ? later : [t('today.summary.nothingLeft')]),
    ...(note === '' ? [] : ['', note]),
  ].join('\n')
}
