import { describe, expect, it } from "vitest";
import { paginateByOffset } from "../convex/lib/auditLog";

describe("audit log pagination", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("returns first page with next cursor", () => {
    const result = paginateByOffset(items, undefined, 2);
    expect(result.page).toEqual(["a", "b"]);
    expect(result.nextCursor).toBe("2");
  });

  it("returns terminal page with null next cursor", () => {
    const result = paginateByOffset(items, "4", 2);
    expect(result.page).toEqual(["e"]);
    expect(result.nextCursor).toBe(null);
  });

  it("falls back to offset 0 for invalid cursor", () => {
    const result = paginateByOffset(items, "bad", 3);
    expect(result.page).toEqual(["a", "b", "c"]);
    expect(result.nextCursor).toBe("3");
  });
});
