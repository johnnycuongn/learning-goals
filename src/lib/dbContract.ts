import type { ChatDb } from './applyChanges'
import * as api from './db'

/** Fails the type check if db.ts stops providing what applying a chat plan needs. */
export const chatDb: ChatDb = api
