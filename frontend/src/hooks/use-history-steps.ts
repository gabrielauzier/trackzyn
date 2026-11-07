import { useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

/**
 * Back and forward through the pages seen in this window, as a browser's buttons do. The router does
 * not say whether there is a page ahead, so the entries are kept here by location key: a new page drops
 * what was ahead, a step back or forward moves the position, a replaced page takes the current slot.
 */
export function useHistorySteps() {
  const location = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  const [seen, setSeen] = useState<{ keys: string[]; at: number; key: string | null }>({ keys: [location.key], at: 0, key: location.key })

  // Adjusted while rendering, once per location (React's pattern for state derived from a change).
  if (seen.key !== location.key) {
    const known = seen.keys.indexOf(location.key)
    if (type === 'POP' && known !== -1) {
      setSeen({ ...seen, at: known, key: location.key })
    } else if (type === 'REPLACE') {
      const keys = [...seen.keys]
      keys[seen.at] = location.key
      setSeen({ keys, at: seen.at, key: location.key })
    } else {
      const keys = [...seen.keys.slice(0, seen.at + 1), location.key]
      setSeen({ keys, at: keys.length - 1, key: location.key })
    }
  }

  return {
    canGoBack: seen.at > 0,
    canGoForward: seen.at < seen.keys.length - 1,
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
  }
}
