"use client"

import { useState, useEffect } from "react"

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

/**
 * Returns a Date representing midnight today (local time).
 * Automatically refreshes at midnight so long-running sessions
 * (e.g. a calendar left open overnight) stay accurate.
 */
export function useToday(): Date {
  const [today, setToday] = useState(startOfToday)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    const schedule = () => {
      timeoutId = setTimeout(() => {
        setToday(startOfToday())
        schedule() // re-arm for the next midnight
      }, msUntilMidnight())
    }
    schedule()
    return () => clearTimeout(timeoutId)
  }, [])

  return today
}
