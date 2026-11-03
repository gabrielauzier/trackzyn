import { useQuery } from '@tanstack/react-query'
import { tasks as tasksApi } from '@/lib/api'

/**
 * One task with its notes and subtasks. The key starts with `lists`, so every
 * list or task mutation, which invalidates `['lists']`, refreshes it too.
 */
export const taskKey = (taskId: string) => ['lists', 'tasks', taskId] as const

export function useTask(taskId: string) {
  return useQuery({ queryKey: taskKey(taskId), queryFn: () => tasksApi.get(taskId) })
}
