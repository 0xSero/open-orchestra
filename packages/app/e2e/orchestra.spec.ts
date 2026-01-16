import type { APIRequestContext, Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";

const baseUrlCandidates = [
  process.env.PLAYWRIGHT_BASE_URL,
  process.env.ORCHESTRA_BASE_URL,
  "http://localhost:3000",
  "http://localhost:3005",
].filter(Boolean) as string[];

async function resolveBaseUrl(request: APIRequestContext): Promise<string | null> {
  for (const baseUrl of baseUrlCandidates) {
    try {
      const response = await request.get(`${baseUrl}/orchestra`);
      if (response.ok()) {
        return baseUrl;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function assertAnyVisible(locators: Locator[], fallback: Locator) {
  for (const locator of locators) {
    if ((await locator.count()) > 0) {
      await expect(locator.first()).toBeVisible();
      return;
    }
  }
  await expect(fallback).toBeVisible();
}

test.describe("Orchestra dashboard", () => {
  test("shows runtime tabs and data", async ({ page, request }) => {
    const baseUrl = await resolveBaseUrl(request);
    if (!baseUrl) {
      test.skip(true, "Orchestra app is not reachable on expected ports.");
      return;
    }

    await page.goto(`${baseUrl}/orchestra`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Orchestra Dashboard" })).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: "Workers" }).click();
    await expect(page.getByText(/worker(s)? configured/i)).toBeVisible();
    await assertAnyVisible(
      [
        page.getByRole("heading", { name: /Running Jobs/i }),
        page.getByRole("heading", { name: /Running Instances/i }),
        page.getByText(/No workers configured/i),
      ],
      page.locator("table").first(),
    );

    await page.getByRole("button", { name: "Workflows" }).click();
    await expect(page.getByText(/workflow(s)? configured/i)).toBeVisible();
    await assertAnyVisible(
      [page.getByRole("heading", { name: /Workflow Runs/i }), page.getByText(/No workflows configured/i)],
      page.locator("table").first(),
    );

    await page.getByRole("button", { name: "Servers" }).click();
    await expect(page.getByText(/integration(s)? configured/i)).toBeVisible();
    await assertAnyVisible(
      [page.getByRole("heading", { name: /Running Instances/i }), page.getByText(/No integrations configured/i)],
      page.locator("table").first(),
    );

    await page.getByRole("button", { name: "Memories" }).click();
    await assertAnyVisible(
      [page.locator("text=/memor(y|ies) recorded/i"), page.getByText(/No memories recorded/i)],
      page.locator("table").first(),
    );
  });
});
