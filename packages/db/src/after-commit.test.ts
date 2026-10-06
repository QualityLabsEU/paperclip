import { describe, expect, it } from "vitest";
import type { Db } from "./client.js";
import { afterCommit, installAfterCommitHooks } from "./after-commit.js";

// A transaction double preserves the native success/rollback promise boundary.
function database(): Db {
  return { transaction: async (callback: (tx: Db) => Promise<unknown>) => callback(database()) } as unknown as Db;
}

describe("afterCommit", () => {
  it("waits for the outermost commit and drops rolled-back nested effects", async () => {
    const db = database(); installAfterCommitHooks(db);
    const seen: string[] = [];
    await db.transaction(async outer => {
      afterCommit(outer, () => seen.push("outer"));
      await outer.transaction(async inner => { afterCommit(inner, () => seen.push("inner")); });
      await expect(outer.transaction(async inner => {
        afterCommit(inner, () => seen.push("rolled back")); throw new Error("rollback");
      })).rejects.toThrow("rollback");
      expect(seen).toEqual([]);
    });
    expect(seen).toEqual(["outer", "inner"]);
    await expect(db.transaction(async tx => {
      afterCommit(tx, () => seen.push("rolled back outer")); throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect(seen).toEqual(["outer", "inner"]);
  });
  it("publishes autocommitted hints immediately and isolates notification failures after commit", async () => {
    const db = database(); installAfterCommitHooks(db);
    const seen: string[] = [];
    afterCommit(db, () => seen.push("autocommit"));
    await expect(db.transaction(async tx => {
      afterCommit(tx, () => { throw new Error("delivery failed"); });
      afterCommit(tx, () => seen.push("next")); return "committed";
    })).resolves.toBe("committed");
    expect(seen).toEqual(["autocommit", "next"]);
  });
});
