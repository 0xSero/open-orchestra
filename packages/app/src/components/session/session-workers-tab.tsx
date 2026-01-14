import { createMemo, createEffect, on, onCleanup, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useLayout } from "@/context/layout"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { Accordion } from "@opencode-ai/ui/accordion"
import { StickyAccordionHeader } from "@opencode-ai/ui/sticky-accordion-header"
import { Spinner } from "@opencode-ai/ui/spinner"
import type { Session, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { base64Encode } from "@opencode-ai/util/encode"

interface SessionWorkersTabProps {
  sessionID: string
  view: () => ReturnType<ReturnType<typeof useLayout>["view"]>
}

type StatusType = SessionStatus["type"]

function StatusIndicator(props: { status: StatusType }) {
  const colors: Record<StatusType, string> = {
    idle: "bg-green-500",
    busy: "bg-amber-500 animate-pulse",
    retry: "bg-red-500",
  }

  return (
    <div class={`size-2 rounded-full ${colors[props.status] ?? "bg-gray-400"}`} />
  )
}

function formatDuration(startMs: number, endMs?: number): string {
  const end = endMs ?? Date.now()
  const durationMs = end - startMs

  if (durationMs < 1000) return "< 1s"
  if (durationMs < 60000) return `${Math.floor(durationMs / 1000)}s`
  if (durationMs < 3600000) return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
  return `${Math.floor(durationMs / 3600000)}h ${Math.floor((durationMs % 3600000) / 60000)}m`
}

function ChildSessionCard(props: {
  session: Session
  status: SessionStatus
  onNavigate: () => void
}) {
  const statusType = createMemo(() => props.status?.type ?? "idle")
  const isWorking = createMemo(() => statusType() !== "idle")

  const workerName = createMemo(() => {
    // Extract worker name from session title (e.g., "reader (subagent)" -> "reader")
    const title = props.session.title ?? ""
    const match = title.match(/^([^(]+)/)
    return match ? match[1].trim() : title
  })

  const workerType = createMemo(() => {
    const title = props.session.title ?? ""
    const match = title.match(/\(([^)]+)\)/)
    return match ? match[1] : "worker"
  })

  return (
    <div class="border border-border-base rounded-md bg-surface-base overflow-hidden">
      <div class="px-3 py-2.5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <StatusIndicator status={statusType()} />
          <div class="min-w-0">
            <div class="text-13-medium text-text-strong truncate">{workerName()}</div>
            <div class="text-11-regular text-text-weak">{workerType()}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={isWorking()}>
            <Spinner class="size-3.5" />
          </Show>
          <Show when={props.session.time?.created}>
            <span class="text-11-regular text-text-weaker">
              {formatDuration(props.session.time!.created)}
            </span>
          </Show>
          <Button variant="ghost" size="small" onClick={props.onNavigate}>
            <Icon name="chevron-right" size="small" />
          </Button>
        </div>
      </div>

      <Show when={props.status?.type === "retry"}>
        <div class="px-3 py-1.5 bg-red-500/10 border-t border-red-500/20">
          <div class="text-11-regular text-red-400">
            Retrying: {(props.status as { message: string }).message}
          </div>
        </div>
      </Show>
    </div>
  )
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

  // Get status for each child
  const getChildStatus = (sessionId: string): SessionStatus => {
    return sync.data.session_status[sessionId] ?? idle
  }

  // Count active workers
  const activeWorkerCount = createMemo(() => {
    return childSessions().filter(s => {
      const status = getChildStatus(s.id)
      return status.type !== "idle"
    }).length
  })

  // Navigate to child session
  const navigateToSession = (sessionId: string) => {
    navigate(`/${params.dir}/session/${sessionId}`)
  }

  // Scroll persistence
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
      <div class="px-6 pt-4 flex flex-col gap-6">
        {/* Summary stats */}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="flex flex-col">
              <span class="text-12-regular text-text-weak">Child Sessions</span>
              <span class="text-14-medium text-text-strong">{childSessions().length}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-12-regular text-text-weak">Active</span>
              <span class="text-14-medium text-text-strong flex items-center gap-1.5">
                <Show when={activeWorkerCount() > 0}>
                  <StatusIndicator status="busy" />
                </Show>
                {activeWorkerCount()}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <StatusIndicator status={currentStatus().type} />
            <span class="text-12-regular text-text-weak capitalize">
              {currentStatus().type}
            </span>
          </div>
        </div>

        {/* Child sessions list */}
        <Show
          when={childSessions().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <Icon name="task" size="large" class="text-text-weaker mb-3" />
              <div class="text-13-regular text-text-weak">No worker sessions</div>
              <div class="text-12-regular text-text-weaker mt-1">
                Workers will appear here when delegated tasks spawn child sessions
              </div>
            </div>
          }
        >
          <div class="flex flex-col gap-2">
            <div class="text-12-regular text-text-weak">Worker Sessions</div>
            <div class="flex flex-col gap-2">
              <For each={childSessions()}>
                {(session) => (
                  <ChildSessionCard
                    session={session}
                    status={getChildStatus(session.id)}
                    onNavigate={() => navigateToSession(session.id)}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Activity timeline placeholder */}
        <Show when={childSessions().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-12-regular text-text-weak">Timeline</div>
            <div class="border border-border-base rounded-md bg-surface-base p-3">
              <div class="flex flex-col gap-1.5">
                <For each={childSessions().slice(0, 10)}>
                  {(session) => {
                    const status = getChildStatus(session.id)
                    return (
                      <div class="flex items-center gap-2 text-11-regular">
                        <StatusIndicator status={status.type} />
                        <span class="text-text-weak truncate flex-1">
                          {session.title ?? session.id}
                        </span>
                        <span class="text-text-weaker shrink-0">
                          {session.time?.created
                            ? DateTime.fromMillis(session.time.created).toRelative()
                            : ""}
                        </span>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
