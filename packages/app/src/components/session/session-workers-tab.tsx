import { createMemo, createEffect, createResource, on, onCleanup, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useLayout } from "@/context/layout"
import { useGlobalSDK } from "@/context/global-sdk"
import { Icon } from "@opencode-ai/ui/icon"
import { Accordion } from "@opencode-ai/ui/accordion"
import { StickyAccordionHeader } from "@opencode-ai/ui/sticky-accordion-header"
import { Spinner } from "@opencode-ai/ui/spinner"
import type { Session, SessionStatus } from "@opencode-ai/sdk/v2/client"

// Types matching plugin/src/types.ts
type WorkerRuntime = "subagent" | "agent" | "server"
type WorkerStatus = "available" | "busy" | "off" | "error"

type Worker = {
  id: string
  name: string
  description?: string
  runtime: WorkerRuntime
  model?: string
}

interface SessionWorkersTabProps {
  sessionID: string
  view: () => ReturnType<ReturnType<typeof useLayout>["view"]>
}

export function SessionWorkersTab(props: SessionWorkersTabProps) {
  const params = useParams()
  const navigate = useNavigate()
  const sync = useSync()
  const globalSDK = useGlobalSDK()
  const layout = useLayout()
  const idle = { type: "idle" as const }

  // Load worker templates from files (like orchestra.tsx does)
  const [workerTemplates] = createResource(async () => {
    try {
      const projects = layout.projects.list()
      if (!projects.length) return []

      const directory = projects[0].worktree
      const response = await globalSDK.client.file.read({
        directory,
        path: ".opencode/workforce/workers.json"
      })
      if (response.data?.content) {
        return JSON.parse(response.data.content) as Worker[]
      }
      return []
    } catch {
      return []
    }
  })

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

  // Find sessions for a worker (by matching title pattern "workerName (runtime)")
  const getWorkerSessions = (worker: Worker) => {
    return sync.data.session.filter(s => {
      const title = s.title ?? ""
      return title.startsWith(worker.name + " (") || title === worker.name
    })
  }

  // Get worker status based on its sessions
  const getWorkerStatus = (worker: Worker): WorkerStatus => {
    const sessions = getWorkerSessions(worker)
    for (const session of sessions) {
      const status = getSessionStatus(session.id)
      if (status.type === "busy") return "busy"
      if (status.type === "retry") return "error"
    }
    if (sessions.length > 0) return "available"
    return "off"
  }

  // Count active workers
  const activeWorkerCount = createMemo(() => {
    const workers = workerTemplates() ?? []
    return workers.filter(w => getWorkerStatus(w) === "busy").length
  })

  // Navigate to session
  const navigateToSession = (sessionId: string) => {
    navigate(`/${params.dir}/session/${sessionId}`)
  }

  // Time formatting
  const time = (value: number | undefined) => {
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

  // Status indicator
  function StatusDot(dotProps: { status: WorkerStatus | SessionStatus["type"] }) {
    const status = typeof dotProps.status === "string" ? dotProps.status : dotProps.status
    const colors: Record<string, string> = {
      available: "bg-green-500",
      idle: "bg-green-500",
      busy: "bg-amber-500",
      off: "bg-gray-400",
      error: "bg-red-500",
      retry: "bg-red-500",
    }
    const isAnimated = status === "busy"
    return (
      <div class={`size-2 rounded-full shrink-0 ${colors[status] ?? "bg-gray-400"} ${isAnimated ? "animate-pulse" : ""}`} />
    )
  }

  // Stats for the header
  const stats = createMemo(() => {
    const workers = workerTemplates() ?? []
    const children = childSessions()
    const active = activeWorkerCount()
    const statusType = currentStatus().type

    return [
      { label: "Worker Templates", value: workers.length.toString() },
      { label: "Child Sessions", value: children.length.toString() },
      { label: "Active Workers", value: active.toString() },
      { label: "Session Status", value: statusType.charAt(0).toUpperCase() + statusType.slice(1) },
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
        {/* Stats grid (matching SessionContextTab) */}
        <div class="grid grid-cols-2 @[32rem]:grid-cols-4 gap-4">
          <For each={stats()}>{(stat) => <Stat label={stat.label} value={stat.value} />}</For>
        </div>

        {/* Worker Templates with Sessions */}
        <Show when={(workerTemplates() ?? []).length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-12-regular text-text-weak">Workers</div>
            <Accordion multiple>
              <For each={workerTemplates() ?? []}>
                {(worker) => {
                  const sessions = createMemo(() => getWorkerSessions(worker))
                  const status = createMemo(() => getWorkerStatus(worker))

                  return (
                    <Accordion.Item value={worker.id}>
                      <StickyAccordionHeader>
                        <Accordion.Trigger>
                          <div class="flex items-center justify-between gap-2 w-full">
                            <div class="flex items-center gap-2 min-w-0">
                              <StatusDot status={status()} />
                              <div class="min-w-0 truncate">
                                {worker.name}{" "}
                                <span class="text-text-base">• {worker.runtime}</span>
                              </div>
                            </div>
                            <div class="flex items-center gap-3">
                              <Show when={status() === "busy"}>
                                <Spinner class="size-3" />
                              </Show>
                              <div class="shrink-0 text-12-regular text-text-weak">
                                {sessions().length} session{sessions().length !== 1 ? "s" : ""}
                              </div>
                              <Icon name="chevron-grabber-vertical" size="small" class="shrink-0 text-text-weak" />
                            </div>
                          </div>
                        </Accordion.Trigger>
                      </StickyAccordionHeader>
                      <Accordion.Content class="bg-background-base">
                        <div class="p-3 flex flex-col gap-2">
                          <Show when={worker.description}>
                            <div class="text-12-regular text-text-weak">{worker.description}</div>
                          </Show>
                          <Show
                            when={sessions().length > 0}
                            fallback={
                              <div class="text-12-regular text-text-weaker py-2">
                                No active sessions
                              </div>
                            }
                          >
                            <div class="flex flex-col gap-1">
                              <For each={sessions()}>
                                {(session) => {
                                  const sessionStatus = createMemo(() => getSessionStatus(session.id))
                                  return (
                                    <button
                                      class="flex items-center justify-between gap-2 p-2 rounded hover:bg-surface-base text-left w-full transition-colors"
                                      onClick={() => navigateToSession(session.id)}
                                    >
                                      <div class="flex items-center gap-2 min-w-0">
                                        <StatusDot status={sessionStatus().type} />
                                        <span class="text-12-regular text-text-base truncate">
                                          {session.title ?? session.id}
                                        </span>
                                      </div>
                                      <div class="flex items-center gap-2 shrink-0">
                                        <span class="text-11-regular text-text-weaker">
                                          {time(session.time?.created)}
                                        </span>
                                        <Icon name="chevron-right" size="small" class="text-text-weak" />
                                      </div>
                                    </button>
                                  )
                                }}
                              </For>
                            </div>
                          </Show>
                        </div>
                      </Accordion.Content>
                    </Accordion.Item>
                  )
                }}
              </For>
            </Accordion>
          </div>
        </Show>

        {/* Child Sessions (direct children of this session) */}
        <Show when={childSessions().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-12-regular text-text-weak">Child Sessions (spawned from this session)</div>
            <Accordion multiple>
              <For each={childSessions()}>
                {(session) => {
                  const sessionStatus = createMemo(() => getSessionStatus(session.id))
                  return (
                    <Accordion.Item value={session.id}>
                      <StickyAccordionHeader>
                        <Accordion.Trigger>
                          <div class="flex items-center justify-between gap-2 w-full">
                            <div class="flex items-center gap-2 min-w-0">
                              <StatusDot status={sessionStatus().type} />
                              <div class="min-w-0 truncate">
                                {session.title ?? session.id}
                              </div>
                            </div>
                            <div class="flex items-center gap-3">
                              <Show when={sessionStatus().type === "busy"}>
                                <Spinner class="size-3" />
                              </Show>
                              <div class="shrink-0 text-12-regular text-text-weak">
                                {time(session.time?.created)}
                              </div>
                              <Icon name="chevron-grabber-vertical" size="small" class="shrink-0 text-text-weak" />
                            </div>
                          </div>
                        </Accordion.Trigger>
                      </StickyAccordionHeader>
                      <Accordion.Content class="bg-background-base">
                        <div class="p-3">
                          <button
                            class="flex items-center gap-2 text-12-regular text-text-base hover:text-text-strong transition-colors"
                            onClick={() => navigateToSession(session.id)}
                          >
                            <span>View session</span>
                            <Icon name="chevron-right" size="small" />
                          </button>
                        </div>
                      </Accordion.Content>
                    </Accordion.Item>
                  )
                }}
              </For>
            </Accordion>
          </div>
        </Show>

        {/* Empty state */}
        <Show when={(workerTemplates() ?? []).length === 0 && childSessions().length === 0}>
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="task" size="large" class="text-text-weaker mb-3" />
            <div class="text-13-regular text-text-weak">No workers configured</div>
            <div class="text-12-regular text-text-weaker mt-1">
              Add workers to .opencode/workforce/workers.json to see them here
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
