import { useEffect, useState } from 'react'

/** `value` once it has stayed the same for `delayMs`; the first value is taken at once. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return settled
}
