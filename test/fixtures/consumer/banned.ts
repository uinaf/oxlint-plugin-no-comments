// Loads users from disk.
import { readFile } from "node:fs/promises";

/** Not exported, so this is not API documentation. */
function parse(raw: string): string {
  // trim whitespace before returning
  return raw.trim();
}

export async function load(path: string): Promise<string> {
  const raw = await readFile(path, "utf8"); /* read once */
  // SAFETY: there is no assertion here.
  return parse(raw);
}

/*! A banner after the header is not a license header. */
export class Store {
  /** Private members are not API. */
  private cache = new Map<string, string>();
}
