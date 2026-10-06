import type { Db } from "./client.js";

const effects = new WeakMap<object, Array<() => void>>();

/** Publish local hints only after the outermost transaction commits. */
export function afterCommit(database: object, effect: () => void): void {
  const pending = effects.get(database);
  if (pending) pending.push(effect);
  else {
    try { effect(); } catch { /* Durable consumers recover through reconciliation. */ }
  }
}

export function installAfterCommitHooks(database: Db, parent?: Array<() => void>): void {
  if (parent) effects.set(database, parent);
  const transaction = database.transaction.bind(database);
  database.transaction = async (callback, ...options) => {
    const pending: Array<() => void> = [];
    const result = await transaction(async tx => {
      installAfterCommitHooks(tx as unknown as Db, pending);
      return callback(tx);
    }, ...options);
    if (parent) parent.push(...pending);
    else for (const effect of pending) {
      // Notification failure cannot turn a committed write into a failed response.
      try { effect(); } catch { /* Durable consumers recover through reconciliation. */ }
    }
    return result;
  };
}
