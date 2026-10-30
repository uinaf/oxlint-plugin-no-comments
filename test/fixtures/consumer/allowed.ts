#!/usr/bin/env node
/*! (c) uinaf, MIT */
// SPDX-License-Identifier: MIT
/// <reference types="node" />
// @ts-nocheck

import { readFile } from "node:fs/promises";

type UserId = string & { readonly brand: unique symbol };

/** Settings a caller passes to {@link load}. */
export interface Options {
  /** Path to read. */
  path: string;
}

/** Read a user id from disk. */
export async function load(options: Options): Promise<UserId> {
  const raw = await readFile(options.path, "utf8");
  // eslint-disable-next-line no-console -- the CLI reports progress
  console.log(raw.length);
  // SAFETY: the file holds one validated user id.
  return raw.trim() as UserId;
}

/** Client for the user store. */
export class Store {
  /** Look up a user. */
  get(id: UserId): UserId {
    return id;
  }
}

const cache = /* @__PURE__ */ new Map<UserId, UserId>();

/* c8 ignore next */
export const size = () => cache.size;

/** Bundled defaults. */
const defaults = { path: "user.txt" };

export { defaults };
