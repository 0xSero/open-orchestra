import { z } from "zod";
import type { OrchestratorConfig } from "../types";

const ticketsSchema = z
  .object({
    enabled: z.boolean().optional(),
    storePath: z.string().optional(),
    autoFromMemoryTodos: z.boolean().optional(),
    linear: z
      .object({
        enabled: z.boolean().optional(),
        teamId: z.string().optional(),
      })
      .optional(),
  })
  .optional();

const orchestratorSchema = z.object({
  tickets: ticketsSchema,
});

export function parseOrchestratorConfig(input: unknown): OrchestratorConfig {
  const parsed = orchestratorSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      tickets: {
        enabled: false,
        autoFromMemoryTodos: false,
        linear: {
          enabled: false,
        },
      },
    };
  }

  const tickets = parsed.data.tickets;

  return {
    tickets: {
      enabled: tickets?.enabled ?? false,
      storePath: tickets?.storePath,
      autoFromMemoryTodos: tickets?.autoFromMemoryTodos ?? false,
      linear: {
        enabled: tickets?.linear?.enabled ?? false,
        teamId: tickets?.linear?.teamId,
      },
    },
  };
}
