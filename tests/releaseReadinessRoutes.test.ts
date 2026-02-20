import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const authenticatedRoot = path.join(repoRoot, "src", "app", "(authenticated)");

const navExposedRoutes = [
  "/calendar",
  "/preferences",
  "/trades",
  "/profile",
  "/admin",
  "/admin/calendar",
  "/admin/physicians",
  "/admin/rotations",
  "/admin/cfte",
  "/admin/requests",
  "/admin/reports",
  "/admin/audit",
  "/admin/settings",
] as const;

const forbiddenPlaceholderPatterns = [
  /coming\s+soon/i,
  /under\s+construction/i,
  /not\s+implemented/i,
];

function routeToPagePath(route: string): string {
  const normalized = route.replace(/^\/+/, "");
  return path.join(authenticatedRoot, normalized, "page.tsx");
}

function collectAuthenticatedPages(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectAuthenticatedPages(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === "page.tsx") {
      files.push(fullPath);
    }
  }

  return files;
}

describe("release readiness guardrails", () => {
  it("keeps all nav-exposed authenticated routes backed by real pages", () => {
    for (const route of navExposedRoutes) {
      const pagePath = routeToPagePath(route);
      expect(fs.existsSync(pagePath), `Missing page for nav route ${route}: ${pagePath}`).toBe(true);
    }
  });

  it("blocks placeholder copy in authenticated routed pages", () => {
    const pageFiles = collectAuthenticatedPages(authenticatedRoot);

    for (const pagePath of pageFiles) {
      const source = fs.readFileSync(pagePath, "utf8");
      for (const pattern of forbiddenPlaceholderPatterns) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
