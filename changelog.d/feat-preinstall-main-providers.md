### Fixed

- New servers now also download missing Claude and ChatGPT (Codex) CLIs automatically at start,
  matching Cursor and Grok. Previously only providers reporting `not-installed` triggered the
  default server download, while missing Claude and Codex reported `error`.
