/**
 * Persistence adapter contract (planning/CONTRACTS.md §4). Web and native
 * each supply an implementation; the state layer never touches
 * IndexedDB/SQLite directly. String in, string out — callers own
 * JSON (de)serialization.
 */
export interface Persistence {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
