import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { inbox as inboxApi } from '@/lib/api'
import { captureRefusal, MAX_CAPTURE_LENGTH } from '@/lib/inbox/errors'
import type { InboxItem } from '@/types'

/** Why the text stayed in the field: over 500 characters (CAP-03), or the capture failed (the network). */
export type CaptureProblem = 'tooLong' | 'failed'

/**
 * The text of a capture field and its Enter: an empty text sends nothing (CAP-02), more than 500 characters
 * keeps the text with the problem (CAP-03), and a kept item clears the field (CAP-01).
 */
export function useCapture(source: 'app' | 'desktop', onSaved?: (item: InboxItem) => void) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<CaptureProblem | null>(null)

  const capture = useMutation({
    mutationFn: (value: string) => inboxApi.capture({ text: value, source }),
    onSuccess: (item) => {
      setText('')
      setProblem(null)
      queryClient.invalidateQueries({ queryKey: ['inbox'] })
      onSaved?.(item)
    },
    onError: (error) => {
      const refusal = captureRefusal(error)
      if (refusal === 'text_empty') return
      setProblem(refusal === 'text_too_long' ? 'tooLong' : 'failed')
    },
  })

  const change = (value: string) => {
    setText(value)
    if (problem === 'tooLong' && value.trim().length <= MAX_CAPTURE_LENGTH) setProblem(null)
  }

  /** Sends the text; false when there was nothing to send, so the field keeps the focus. */
  const submit = (): boolean => {
    const value = text.trim()
    if (value === '' || capture.isPending) return false
    if (value.length > MAX_CAPTURE_LENGTH) {
      setProblem('tooLong')
      return false
    }
    capture.mutate(value)
    return true
  }

  return { text, change, submit, problem, pending: capture.isPending }
}
