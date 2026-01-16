import { createMemo, createEffect, on, onCleanup, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useLayout } from "@/context/layout"
import { Icon } from "@opencode-ai/ui/icon"
import { Accordion } from "@opencode-ai/ui/accordion"
import { StickyAccordionHeader } from "@opencode-ai/ui/sticky-accordion-header"
import type { SessionStatus } from "@opencode-ai/sdk/v2/client"

interface SessionWorkersTabProps {
  sessionID: string
  view: () => ReturnType<ReturnType<typeof useLayout>["view"]>
}

export function SessionWorkersTab(props: SessionWorkersTabProps) {
  const params = useParams()
  const navigate = useNavigate()
  const sync = useSync()
  const idle = { type: "idle" as const }

  // Get all child sessions for the current session
  const childSessions = createMemo(() => {
    return sync.data.session
      .filter(s => s.parentID === props.sessionID)
      .sort((a, b) => (b.time?.created ?? 0) - (a.time?.created ?? 0))
  })

  // Get current session status
  const currentStatus = createMemo(() =>
    sync.data.session_status[props.sessionID] ?? idle
  )

  // Get status for a session
  const getSessionStatus = (sessionId: string): SessionStatus => {
    return sync.data.session_status[sessionId] ?? idle
  }

  // Navigate to session
  const navigateToSession = (sessionId: string) => {
    navigate(`/${params.dir}/session/${sessionId}`)
  }

  // Time formatting
  const time = (value: number | undefined) => {
    if (!value) return "—"
    return DateTime.fromMillis(value).toLocaleString(DateTime.DATETIME_MED)
  }

  const relativeTime = (value: number | undefined) => {
    if (!value) return "—"
    return DateTime.fromMillis(value).toRelative() ?? "—"
  }

  // Stat component (matching SessionContextTab)
  function Stat(statProps: { label: string; value: JSX.Element }) {
    return (
      <div class="flex flex-col gap-1">
        <div class="text-12-regular text-text-weak">{statProps.label}</div>
        <div class="text-12-medium text-text-strong">{statProps.value}</div>
      </div>
    )
  }

  // Status color
  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: "text-green-500",
      busy: "text-amber-500",
      error: "text-red-500",
      retry: "text-red-500",
    }
    return colors[status] ?? "text-gray-400"
  }

  // Stats
  const stats = createMemo(() => {
    const children = childSessions()
    const status = currentStatus()
    const busyCount = children.filter(s => getSessionStatus(s.id).type === "busy").length

    return [
      { label: "Session Status", value: status.type.charAt(0).toUpperCase() + status.type.slice(1) },
      { label: "Child Sessions", value: children.length.toString() },
      { label: "Active", value: busyCount.toString() },
    ]
  })

  // Scroll persistence (matching SessionContextTab pattern)
  let scroll: HTMLDivElement | undefined
  let frame: number | undefined
  let pending: { x: number; y: number } | undefined

  const restoreScroll = (retries = 0) => {
    const el = scroll
    if (!el) return

    const s = props.view()?.scroll("workers")
    if (!s) return

    if (el.scrollHeight <= el.clientHeight && retries < 10) {
      requestAnimationFrame(() => restoreScroll(retries + 1))
      return
    }

    if (el.scrollTop !== s.y) el.scrollTop = s.y
    if (el.scrollLeft !== s.x) el.scrollLeft = s.x
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    pending = {
      x: event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    }
    if (frame !== undefined) return

    frame = requestAnimationFrame(() => {
      frame = undefined
      const next = pending
      pending = undefined
      if (!next) return
      props.view().setScroll("workers", next)
    })
  }

  createEffect(
    on(
      () => childSessions().length,
      () => requestAnimationFrame(restoreScroll),
      { defer: true }
    )
  )

  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
  })

  return (
    <div
      class="@container h-full overflow-y-auto no-scrollbar pb-10"
      ref={(el) => {
        scroll = el
        restoreScroll()
      }}
      onScroll={handleScroll}
    >
      <div class="px-6 pt-4 flex flex-col gap-10">
        {/* Stats grid */}
        <div class="grid grid-cols-1 @[32rem]:grid-cols-3 gap-4">
          <For each={stats()}>{(stat) => <Stat label={stat.label} value={stat.value} />}</For>
        </div>

        {/* Child Sessions */}
        <Show when={childSessions().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-12-regular text-text-weak">Spawned Sessions</div>
            <Accordion multiple>
              <For each={childSessions()}>
                {(session) => (
                  <Accordion.Item value={session.id}>
                    <StickyAccordionHeader>
                      <Accordion.Trigger>
                        <div class="flex items-center justify-between gap-2 w-full">
                          <div class="min-w-0 truncate">
                            {session.title ?? session.id}{" "}
                            <span class={statusColor(getSessionStatus(session.id).type)}>
                              • {getSessionStatus(session.id).type}
                            </span>
                          </div>
                          <div class="flex items-center gap-3">
                            <div class="shrink-0 text-12-regular text-text-weak">
                              {relativeTime(session.time?.created)}
                            </div>
                            <Icon name="chevron-grabber-vertical" size="small" class="shrink-0 text-text-weak" />
                          </div>
                        </div>
                      </Accordion.Trigger>
                    </StickyAccordionHeader>
                    <Accordion.Content class="bg-background-base">
                      <div class="p-3 flex flex-col gap-2">
                        <div class="text-12-regular text-text-weak">
                          Created: {time(session.time?.created)}
                        </div>
                        <button
                          class="flex items-center gap-2 text-12-regular text-text-accent hover:underline"
                          onClick={() => navigateToSession(session.id)}
                        >
                          <span>Open session</span>
                          <Icon name="chevron-right" size="small" />
                        </button>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                )}
              </For>
            </Accordion>
          </div>
        </Show>

        {/* Empty state */}
        <Show when={childSessions().length === 0}>
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="task" size="large" class="text-text-weaker mb-3" />
            <div class="text-13-regular text-text-weak">No spawned sessions</div>
            <div class="text-12-regular text-text-weaker mt-1">
              Sessions spawned from this one will appear here
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
