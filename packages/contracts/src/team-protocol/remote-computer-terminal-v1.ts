// Frozen optional remote-computer-terminal-v1 wire contract.
//
// What it grants, recorded here because freezing it makes it permanent: it adds no route and no event.
// It rides on `remote-computer-use-v1`. A host that advertises it will give the agents of a member two
// more tools for that member's computer, beside the Computer Use tools: one that runs a shell command
// on that computer, and one that copies one file from it to the disk of the host. The desktop app of
// the member lists the command and file tools in its answer to `list-tools`, and runs them itself,
// only for a server that the user turned on for terminal use in the app, which starts off, and only
// when that host advertises this capability. A server without the capability never sees the tools. The
// host gives them only to the agents that `remote-computer-use-v1` already allows. The file tool is
// made on the host from the app's file-chunk tool, so a computer that does not list that tool gets no
// file tool. Widening any of it needs a second capability string.

export const REMOTE_COMPUTER_TERMINAL_CAPABILITY = "remote-computer-terminal-v1";

/** Runs one shell command on the member's computer. Answered by the desktop app. */
export const REMOTE_TERMINAL_RUN_TOOL = "openbot_run_command";
/** Reads one chunk of one file on the member's computer. Answered by the desktop app. */
export const REMOTE_TERMINAL_READ_TOOL = "openbot_read_file_chunk";
/** Copies one file of the member's computer to the host. Made by the host from the chunk tool. */
export const REMOTE_TERMINAL_FETCH_TOOL = "openbot_fetch_file";

/** The most raw bytes that one chunk carries. Its base64 text stays inside the reply limit. */
export const REMOTE_TERMINAL_CHUNK_BYTES = 393_216;
/** The longest command, in UTF-16 units. */
export const REMOTE_TERMINAL_COMMAND_MAX_LENGTH = 30_000;
/** The longest time a command may run, in seconds. */
export const REMOTE_TERMINAL_MAX_TIMEOUT_SECONDS = 600;
/** The default time a command may run, in seconds. */
export const REMOTE_TERMINAL_DEFAULT_TIMEOUT_SECONDS = 60;
/** The largest file that the host copies, in bytes. */
export const REMOTE_TERMINAL_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
