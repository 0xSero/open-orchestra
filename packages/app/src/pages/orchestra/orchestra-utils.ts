import type { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { showToast } from "@opencode-ai/ui/toast";

export type OrchestraClient = ReturnType<typeof createOpencodeClient>;

const encodeBase64 = (value: string) => {
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return Buffer.from(value, "utf-8").toString("base64");
};

export async function readJsonFile<T>(client: OrchestraClient, directory: string, path: string, fallback: T): Promise<T> {
  try {
    const response = await client.file.read({ directory, path });
    if (response.data?.content) {
      return JSON.parse(response.data.content) as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export async function runNodeScript(client: OrchestraClient, directory: string, script: string) {
  const response = await client.pty.create({
    directory,
    command: "node",
    args: ["-e", script],
    cwd: directory || undefined,
    title: "Orchestra file edit",
  });

  const id = response.data?.id;
  if (!id) {
    throw new Error("Failed to start file edit process");
  }

  // Wait for the script to complete - increase timeout for larger files
  await new Promise((resolve) => setTimeout(resolve, 1500));

  await client.pty.remove({ ptyID: id, directory }).catch(() => undefined);
}

export async function writeJsonFile(client: OrchestraClient, directory: string, path: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const encoded = encodeBase64(json);
  const command = `require('fs').mkdirSync(require('path').dirname(${JSON.stringify(path)}), { recursive: true });` +
    `require('fs').writeFileSync(${JSON.stringify(path)}, Buffer.from(${JSON.stringify(encoded)}, 'base64'));`;
  await runNodeScript(client, directory, command);
}

export async function deleteFile(client: OrchestraClient, directory: string, path: string) {
  const command = `require('fs').rmSync(${JSON.stringify(path)}, { recursive: true, force: true });`;
  await runNodeScript(client, directory, command);
}

export async function copyToClipboard(value: string, title: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    showToast({
      title,
      description: "Copied to clipboard.",
      variant: "success",
    });
  } catch (err) {
    showToast({
      title: "Failed to copy",
      description: String(err),
      variant: "error",
    });
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function notifySaveSuccess(action: "create" | "update" | "delete", label: string) {
  showToast({
    title: action === "delete" ? `Deleted ${label}` : `Saved ${label}`,
    variant: "success",
  });
}

export function notifySaveError(label: string, err: unknown) {
  showToast({
    title: `Failed to save ${label}`,
    description: err ? String(err) : "Unknown error",
    variant: "error",
  });
}
