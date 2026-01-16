import type { Ticket, TicketStatus, TicketAssignment } from "@/pages/orchestra/orchestra-types";

export type TicketRow = Ticket & {
  statusLabel: string;
  statusColor: string;
  assignmentLabel: string;
  updatedAtFormatted: string;
  linearLabel?: string;
};

export function formatTicketStatus(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    open: "Open",
    in_progress: "In Progress",
    blocked: "Blocked",
    done: "Done",
    canceled: "Canceled",
  };
  return labels[status] ?? status;
}

export function getStatusColor(status: TicketStatus): string {
  const colors: Record<TicketStatus, string> = {
    open: "text-icon-success-base",
    in_progress: "text-amber-500",
    blocked: "text-icon-critical-base",
    done: "text-text-weak",
    canceled: "text-text-weaker",
  };
  return colors[status] ?? "text-text-weak";
}

export function formatAssignment(assignment: TicketAssignment | undefined): string {
  if (!assignment) return "—";
  if (assignment.kind === "worker") return `worker:${assignment.workerId}`;
  if (assignment.kind === "workflow") return `workflow:${assignment.workflowId}`;
  return "—";
}

export function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sortTicketsByUpdated(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function buildTicketRows(tickets: Ticket[]): TicketRow[] {
  return sortTicketsByUpdated(tickets).map((ticket) => ({
    ...ticket,
    statusLabel: formatTicketStatus(ticket.status),
    statusColor: getStatusColor(ticket.status),
    assignmentLabel: formatAssignment(ticket.assignment),
    updatedAtFormatted: formatTimestamp(ticket.updatedAt),
    linearLabel: ticket.linear?.identifier ?? ticket.linear?.issueId,
  }));
}

export function generateTicketId(): string {
  return `tkt_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
