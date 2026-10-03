-- Learning Goals keeps everything in this one SQLite file on your Mac.
-- Same shape as the hosted My Roadmaps schema, minus user_id and row-level
-- security: there is one person, and the file is theirs.

CREATE TABLE roadmaps (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- draft: produced by research, waiting for review. active: saved officially.
  state       TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('draft', 'active', 'archived')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE stages (
  id          TEXT PRIMARY KEY,
  roadmap_id  TEXT NOT NULL REFERENCES roadmaps (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  pace        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  milestone   TEXT,                       -- shown in the gap after this stage
  position    REAL NOT NULL DEFAULT 0
);

-- What to learn.
CREATE TABLE topics (
  id                TEXT PRIMARY KEY,
  roadmap_id        TEXT NOT NULL REFERENCES roadmaps (id) ON DELETE CASCADE,
  stage_id          TEXT NOT NULL REFERENCES stages (id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  importance        TEXT NOT NULL DEFAULT 'rec' CHECK (importance IN ('rec', 'alt', 'opt')),
  status            TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'skipped')),
  status_changed_at TEXT,
  archived_at       TEXT,                 -- hidden unless "show archived" is on
  notes_md          TEXT NOT NULL DEFAULT '',
  position          REAL NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Where to learn it: a course, doc, blog post, video, book or project.
CREATE TABLE resources (
  id                TEXT PRIMARY KEY,
  roadmap_id        TEXT NOT NULL REFERENCES roadmaps (id) ON DELETE CASCADE,
  stage_id          TEXT NOT NULL REFERENCES stages (id) ON DELETE CASCADE,
  kind              TEXT NOT NULL DEFAULT 'course' CHECK (kind IN ('course', 'doc', 'blog', 'video', 'book', 'project', 'other')),
  title             TEXT NOT NULL,
  provider          TEXT NOT NULL DEFAULT '',
  url               TEXT,
  cost              TEXT NOT NULL DEFAULT '',
  duration          TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  importance        TEXT NOT NULL DEFAULT 'rec' CHECK (importance IN ('rec', 'alt', 'opt')),
  status            TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'skipped')),
  status_changed_at TEXT,
  archived_at       TEXT,
  notes_md          TEXT NOT NULL DEFAULT '',
  position          REAL NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A resource covers topics. One link per topic may be primary ("the main course").
CREATE TABLE topic_resources (
  topic_id    TEXT NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (topic_id, resource_id)
);

-- Extra links a person adds to a topic or a resource.
CREATE TABLE item_links (
  id          TEXT PRIMARY KEY,
  topic_id    TEXT REFERENCES topics (id) ON DELETE CASCADE,
  resource_id TEXT REFERENCES resources (id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((topic_id IS NULL) <> (resource_id IS NULL))
);

-- Files a person attaches. The bytes live in the app's files/ folder at `path`.
CREATE TABLE item_files (
  id          TEXT PRIMARY KEY,
  topic_id    TEXT REFERENCES topics (id) ON DELETE CASCADE,
  resource_id TEXT REFERENCES resources (id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  name        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  mime        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((topic_id IS NULL) <> (resource_id IS NULL))
);

-- One row each: which AI to use and when the weekly focus refreshes, and the
-- latest "This week" briefing.
CREATE TABLE settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  ai_provider      TEXT NOT NULL DEFAULT 'claude' CHECK (ai_provider IN ('claude', 'codex')),
  ai_model         TEXT NOT NULL DEFAULT '',
  briefing_enabled INTEGER NOT NULL DEFAULT 1,
  briefing_time    TEXT NOT NULL DEFAULT '08:00',
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE briefings (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  content      TEXT NOT NULL,             -- JSON
  provider     TEXT NOT NULL DEFAULT 'claude',
  model        TEXT NOT NULL DEFAULT '',
  generated_at TEXT NOT NULL
);

CREATE INDEX stages_roadmap ON stages (roadmap_id);
CREATE INDEX topics_roadmap ON topics (roadmap_id);
CREATE INDEX topics_status ON topics (status, status_changed_at);
CREATE INDEX resources_roadmap ON resources (roadmap_id);
CREATE INDEX topic_resources_resource ON topic_resources (resource_id);
CREATE INDEX item_links_topic ON item_links (topic_id);
CREATE INDEX item_links_resource ON item_links (resource_id);
CREATE INDEX item_files_topic ON item_files (topic_id);
CREATE INDEX item_files_resource ON item_files (resource_id);
