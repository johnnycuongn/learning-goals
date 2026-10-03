-- The roadmap chat: one conversation per roadmap, as a JSON list of messages.
-- Only change summaries are stored, never the operations.
CREATE TABLE roadmap_chats (
  roadmap_id TEXT PRIMARY KEY REFERENCES roadmaps (id) ON DELETE CASCADE,
  messages   TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
