### Fixed

- A new chat now waits up to 4.5 seconds for Second Brain context (it was 3 seconds), so a brain server that has been idle no longer makes a chat start without it. When a chat starts without context, the host log now says why: a timeout, a missing sign-in, an HTTP status or an empty answer. The log never holds your message or the brain's text. Update the server to this version to use it there.
