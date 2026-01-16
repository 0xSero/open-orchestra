import type { IntegrationInstance } from "@/pages/orchestra/orchestra-types";

export type IntegrationInstanceRow = {
  integrationId: string;
  pidLabel: string;
  urlLabel: string;
  status: IntegrationInstance["status"];
};

export function mapIntegrationInstances(instances: IntegrationInstance[]): IntegrationInstanceRow[] {
  return instances.map((instance) => ({
    integrationId: instance.integrationId,
    pidLabel: typeof instance.pid === "number" ? String(instance.pid) : "—",
    urlLabel: instance.url || "—",
    status: instance.status,
  }));
}
