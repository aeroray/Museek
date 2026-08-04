import { useEffect, useRef, useState } from "react"
import { useT } from "@/lib/i18n"

type DayPeriod = "morning" | "noon" | "afternoon" | "evening" | "night"

const MESSAGE_KEYS: Record<DayPeriod, string[]> = {
  morning: [
    "search.welcome.morning1",
    "search.welcome.morning2",
    "search.welcome.morning3",
  ],
  noon: ["search.welcome.noon1", "search.welcome.noon2", "search.welcome.noon3"],
  afternoon: [
    "search.welcome.afternoon1",
    "search.welcome.afternoon2",
    "search.welcome.afternoon3",
  ],
  evening: [
    "search.welcome.evening1",
    "search.welcome.evening2",
    "search.welcome.evening3",
  ],
  night: ["search.welcome.night1", "search.welcome.night2", "search.welcome.night3"],
}

// Keep consecutive appearances from repeating a message, including after the
// welcome area is mounted again when playback ends or the route changes.
const lastMessageByPeriod: Partial<Record<DayPeriod, string>> = {}

function periodOf(hour: number): DayPeriod {
  if (hour >= 5 && hour < 11) return "morning"
  if (hour >= 11 && hour < 14) return "noon"
  if (hour >= 14 && hour < 18) return "afternoon"
  if (hour >= 18 && hour < 23) return "evening"
  return "night"
}

function randomMessage(period: DayPeriod, previous?: string): string {
  const excluded = new Set([previous, lastMessageByPeriod[period]])
  const options = MESSAGE_KEYS[period].filter((key) => !excluded.has(key))
  const selected = options[Math.floor(Math.random() * options.length)] ?? MESSAGE_KEYS[period][0]
  lastMessageByPeriod[period] = selected
  return selected
}

export function WarmWelcome({ refreshKey }: { refreshKey: string }) {
  const t = useT()
  const [now, setNow] = useState(() => new Date())
  const period = periodOf(now.getHours())
  const [messageKey, setMessageKey] = useState(() => randomMessage(period))
  const messageContext = useRef({ period, refreshKey })

  // Keep the time period current without making the welcome area feel live.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // A context change or a new time period gets a fresh, non-repeating message.
  useEffect(() => {
    if (messageContext.current.period === period && messageContext.current.refreshKey === refreshKey) return
    messageContext.current = { period, refreshKey }
    setMessageKey((previous) => randomMessage(period, previous))
  }, [period, refreshKey])

  return (
    <div className="pointer-events-none mx-2 min-w-0 flex-1 flex h-8 items-center justify-center rounded-md px-3">
      <span
        key={messageKey}
        title={t(messageKey)}
        className="min-w-0 truncate text-center text-sm font-medium tracking-tight text-foreground/80 animate-in fade-in duration-300 motion-reduce:animate-none"
        aria-live="polite"
      >
        {t(messageKey)}
      </span>
    </div>
  )
}
