import type { PluginGuide } from "./plugin-guide";

// Second Brain runs on the Agent Brain service. Every statement about it here is taken from brain.mcpbox.dev and from the README and
// AGENTS.md of the brain-mcp repository. Each page used is in `sources`. Check the sources again,
// and move `checkedAt`, whenever this file changes.

export const SECOND_BRAIN_PLUGIN_GUIDE: PluginGuide = {
  uses: [
    {
      title: "Answer from the brain, with sources",
      text: "The search tool finds claims in a brain. Each claim has its page, and its authority and verification date when they are set, so the agent can cite them. The get_claim tool opens one claim with the lines around it. The explain_claim tool shows its commit, its evidence and what it replaced. The list_brains tool shows the brains that you can read.",
    },
    {
      title: "Keep client files with the project",
      text: "Each brain has a private file space for files that are not markdown, such as spreadsheets and exports. The list_files and get_file tools read them. The get_file tool gives a download link that works for 15 minutes. The add_file tool adds a file. It never replaces a file, and there is no delete tool.",
    },
    {
      title: "Record decisions",
      text: "The remember tool records a new decision or fact. The update_fact tool changes a claim that is out of date, and the forget tool removes a claim that is no longer true. Each one opens a pull request on the brain repo. When the brain owner turned on direct writes, it commits to the default branch. The result says which one happened.",
    },
    {
      title: "Find earlier chats",
      text: "The search_sessions and show_session tools read your own past agent chats from Claude Code, Codex, Cursor and T3, and imported ChatGPT, Claude.ai and Grok chats. The save_to_brain tool records a decision from a chat as a claim that cites the chat. The share_session tool shares one chat with one email address.",
    },
  ],
  faq: [
    {
      question: "Does Second Brain need an API key?",
      answer:
        "No. You sign in through the browser with WorkOS AuthKit, which tells the brain service who you are. Pokebots keeps the tokens in encrypted storage.",
    },
    {
      question: "Which brains can an agent read?",
      answer:
        "GitHub decides. You can read a brain when you can read its git repo, and you can add files when you can push to it. The brain service keeps no other permission list. It checks repo access again after one minute, so a removal takes effect quickly.",
    },
    {
      question: "Where do my notes live?",
      answer:
        "In your own git repo, as plain markdown. The repo is the truth. The brain service keeps a search copy in a database that it can rebuild from git at any time. Private files are in a Cloudflare R2 bucket, not in the repo. Your Pokebots workspaces and conversations stay on the computer that runs Pokebots. A file or note that an agent sends with a Second Brain tool goes to the brain service.",
    },
    {
      question: "Who can see my agent chats?",
      answer:
        "Only you. A chat goes only to its owner, or to a person with a share for that chat. A share is for one email address and lasts 30 days by default. The person must sign in with that email, and WorkOS must have verified it.",
    },
    {
      question: "Does Second Brain cost anything?",
      answer:
        "The Free plan is $0 and gives your notes, any agent, a source on every answer, and your git repo. The Team plan is USD 10 a month and adds shared team memory and a record of who changed what.",
    },
  ],
  sources: [
    { label: "Brain service", url: "https://brain.mcpbox.dev/" },
    { label: "Brain service: summary for agents", url: "https://brain.mcpbox.dev/llms.txt" },
    { label: "brain-mcp: README", url: "https://github.com/stevmolina/brain-mcp#readme" },
    { label: "brain-mcp: AGENTS.md", url: "https://github.com/stevmolina/brain-mcp/blob/main/AGENTS.md" },
  ],
  checkedAt: "2026-11-16",
};
