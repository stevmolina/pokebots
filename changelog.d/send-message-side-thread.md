### Added

- `send_message` can open a new side thread per recipient (with an optional title) and return each recipient's `taskId`, or continue an existing open side thread of a single recipient. Default main-chat routing and reply-to-caller-thread routing stay unchanged. Update the host to use this feature on a joined server.
