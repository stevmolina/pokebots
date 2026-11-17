import type { AgentProviderId, AvatarHue } from "@openbot/contracts/ipc";

/*
 * Made-up data for the design preview. No real agent, chat or person: these are fixtures, so their
 * text is literal and not translated. The screens read only this file, never a server.
 */

export interface PreviewAgent {
  id: string;
  name: string;
  /** The face: one of the four Pokebots portraits, picked by hue. */
  hue: AvatarHue;
}

export interface PreviewChat {
  agent: PreviewAgent;
  preview: string;
  /** Minutes before now of the last message. */
  minutesAgo: number;
  unread: boolean;
  /** The preview starts with a small task icon, as a task update does. */
  task?: boolean;
}

export interface PreviewSection {
  id: string;
  name: string;
  chats: PreviewChat[];
}

type PreviewMessageBody =
  | { kind: "stamp"; minutesAgo: number }
  | { kind: "agent"; text: string }
  | { kind: "list"; intro: string; items: string[] }
  | { kind: "user"; text: string }
  | { kind: "tasks"; done: number; total: number }
  | { kind: "routine"; name: string; duration: string };

export type PreviewMessage = PreviewMessageBody & { id: string };

const BLUE: AvatarHue = 215;
const MINT: AvatarHue = 150;
const ORANGE: AvatarHue = 30;
const PURPLE: AvatarHue = 280;

const agent = (id: string, name: string, hue: AvatarHue): PreviewAgent => ({ id, name, hue });

export const PREVIEW_MAIN_AGENT = agent("poke", "Poke", BLUE);

const HOUR = 60;
const DAY = 24 * HOUR;

/** Sections with a label, a count and rows. `Work` starts open, the others closed. */
export const PREVIEW_SECTIONS: PreviewSection[] = [
  {
    id: "work",
    name: "Work",
    chats: [
      {
        agent: agent("deck", "Pitch Deck", PURPLE),
        preview: "Slide 7 now shows the new numbers",
        minutesAgo: 35,
        unread: true,
      },
      {
        agent: agent("hiring", "Hiring", ORANGE),
        preview: "Two candidates said yes to Thursday",
        minutesAgo: 3 * HOUR,
        unread: false,
      },
      {
        agent: agent("standup", "Standup", MINT),
        preview: "Daily notes are in the shared folder",
        minutesAgo: DAY + 2 * HOUR,
        unread: false,
        task: true,
      },
      {
        agent: agent("invoices", "Invoices", BLUE),
        preview: "October is paid, November goes out Friday",
        minutesAgo: 2 * DAY,
        unread: false,
      },
    ],
  },
  {
    id: "travel",
    name: "Travel",
    chats: [
      {
        agent: agent("lima", "Lima Trip", ORANGE),
        preview: "Hotel moved to the 14th",
        minutesAgo: 4 * DAY,
        unread: false,
      },
      {
        agent: agent("visa", "Visa", PURPLE),
        preview: "The form is ready to sign",
        minutesAgo: 6 * DAY,
        unread: false,
      },
      { agent: agent("miles", "Miles", MINT), preview: "You have 12,400 points", minutesAgo: 9 * DAY, unread: false },
    ],
  },
  {
    id: "learning",
    name: "Learning",
    chats: [
      { agent: agent("spanish", "Spanish", BLUE), preview: "Lesson 12 is ready", minutesAgo: 2 * DAY, unread: false },
      {
        agent: agent("math", "Math", PURPLE),
        preview: "Proof sketch for exercise 3",
        minutesAgo: 3 * DAY,
        unread: false,
      },
      {
        agent: agent("piano", "Piano", ORANGE),
        preview: "Practice plan for this week",
        minutesAgo: 5 * DAY,
        unread: false,
      },
      {
        agent: agent("design", "Design", MINT),
        preview: "Five calm apps to study",
        minutesAgo: 8 * DAY,
        unread: false,
      },
      {
        agent: agent("writing", "Writing", BLUE),
        preview: "Your draft reads well, two notes",
        minutesAgo: 10 * DAY,
        unread: false,
      },
    ],
  },
  {
    id: "home",
    name: "Home",
    chats: [
      { agent: agent("garden", "Garden", MINT), preview: "Water the tomatoes tonight", minutesAgo: DAY, unread: false },
      {
        agent: agent("groceries", "Groceries", ORANGE),
        preview: "List for Saturday: 14 items",
        minutesAgo: 3 * DAY,
        unread: false,
      },
    ],
  },
];

/** Chats in no section, newest first. */
export const PREVIEW_LOOSE_CHATS: PreviewChat[] = [
  {
    agent: agent("flights", "Flights", MINT),
    preview: "Booked the 7:40 flight to Lima, seat 14C",
    minutesAgo: 6,
    unread: true,
    task: true,
  },
  {
    agent: agent("papers", "Papers", ORANGE),
    preview: "Monday paper: attention sinks in long context",
    minutesAgo: 5 * HOUR,
    unread: true,
  },
  {
    agent: agent("events", "Events", PURPLE),
    preview: "The shortlist for this week is ready",
    minutesAgo: 6 * HOUR,
    unread: true,
  },
  {
    agent: agent("going-out", "Going Out", BLUE),
    preview: "My picks for the next few days:",
    minutesAgo: 7 * HOUR,
    unread: true,
  },
  {
    agent: agent("space-apps", "Space Apps", MINT),
    preview: "What do we do now?",
    minutesAgo: DAY + HOUR,
    unread: false,
  },
  {
    agent: agent("motion", "Motion", ORANGE),
    preview: "The video with the new name is up",
    minutesAgo: DAY + 3 * HOUR,
    unread: true,
  },
  {
    agent: agent("inbox", "Inbox", PURPLE),
    preview: "Open loops triage now runs once a day",
    minutesAgo: 2 * DAY,
    unread: false,
  },
  {
    agent: agent("reading", "Reading", BLUE),
    preview: "Chapter 4 was today's goal",
    minutesAgo: 4 * DAY,
    unread: true,
  },
  {
    agent: agent("fitness", "Fitness", MINT),
    preview: "Three runs this week, 21 km",
    minutesAgo: 13 * DAY,
    unread: false,
  },
  {
    agent: agent("budget", "Budget", ORANGE),
    preview: "You spent less than last month",
    minutesAgo: 15 * DAY,
    unread: false,
  },
];

/** How many chats the Done group at the end of the list holds. */
export const PREVIEW_DONE_COUNT = 12;

export const PREVIEW_OPEN_SECTION = "work";

/** All agents of the preview, to open a chat by id. */
export function previewAgent(id: string): PreviewAgent {
  if (id === PREVIEW_MAIN_AGENT.id) return PREVIEW_MAIN_AGENT;
  const all = [...PREVIEW_LOOSE_CHATS, ...PREVIEW_SECTIONS.flatMap((section) => section.chats)];
  return all.find((chat) => chat.agent.id === id)?.agent ?? PREVIEW_MAIN_AGENT;
}

/**
 * One conversation for every agent: a long reply, a list, a tasks line, a routine line, your own
 * messages, and time stamps between the groups.
 */
const MESSAGES: PreviewMessageBody[] = [
  { kind: "stamp", minutesAgo: DAY + 5 * HOUR },
  { kind: "user", text: "Can you find me a flight to Lima next Friday? Morning if possible." },
  {
    kind: "agent",
    text: "Found three morning flights. The 7:40 one is direct and lands at 11:05, so you are in the city before lunch. The 6:15 one is cheaper but stops in Santiago for two hours.",
  },
  { kind: "tasks", done: 3, total: 3 },
  {
    kind: "list",
    intro: "Here is what I did:",
    items: ["Compared 14 fares on three airlines", "Kept your aisle seat preference", "Held the 7:40 fare until 6 PM"],
  },
  { kind: "stamp", minutesAgo: DAY + HOUR },
  { kind: "user", text: "Book the 7:40 one" },
  {
    kind: "agent",
    text: "Done. The 7:40 flight is booked, seat 14C, one cabin bag. The receipt is in your mail and the trip is in your calendar.",
  },
  { kind: "routine", name: "Morning check-in", duration: "2 min 44 s" },
  { kind: "stamp", minutesAgo: 6 },
  { kind: "agent", text: "Check-in opens tomorrow at 7:40. I will do it for you and send the boarding pass here." },
  { kind: "user", text: "Perfect, thanks!" },
];

export const PREVIEW_MESSAGES: PreviewMessage[] = MESSAGES.map((message, index) => ({ ...message, id: `m${index}` }));

/** The sessions of a chat in the ••• sheet: the main chat first, then side sessions. */
export const PREVIEW_SESSIONS: { id: string; name: string | null; minutesAgo: number; current: boolean }[] = [
  { id: "main", name: null, minutesAgo: 6, current: true },
  { id: "lima-plan", name: "Lima trip plan", minutesAgo: DAY + 2 * HOUR, current: false },
  { id: "hotels", name: "Hotel options", minutesAgo: 4 * DAY, current: false },
];

export const PREVIEW_PINNED_COUNT = 2;

/** Made-up models, grouped by provider, for the model picker of the preview. */
/**
 * The model picker's list: real provider ids and model ids that the repo already knows, newest first,
 * with the desktop picker's names and descriptions. Providers follow `pickerOrder` and `displayName`
 * in `packages/contracts/src/agent-providers.ts`: Claude, ChatGPT, Grok, then Gemini. Model names and
 * descriptions come from the desktop catalog (`src/backend/agent/provider-models.ts`) and the host
 * models fixtures; a model the catalog does not describe has no second line.
 *
 * In the real-data step this list comes live from the host's models response, so the phone always
 * shows what its server has. `mark` is the provider whose logo the buttons show.
 */
export const PREVIEW_MODEL_GROUPS: {
  provider: string;
  mark: AgentProviderId;
  models: { id: string; name: string; note?: string }[];
}[] = [
  {
    provider: "Claude",
    mark: "claude",
    models: [
      { id: "claude-fable-5-2", name: "Claude Fable 5.2", note: "Fast Claude model for everyday agent work." },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "Most capable Claude model for complex work." },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "Balanced Claude model for general agent work." },
      { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
    ],
  },
  {
    provider: "ChatGPT",
    mark: "codex",
    models: [
      { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", note: "Most capable for complex, long-running work." },
      { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", note: "Balanced speed and capability for involved tasks." },
      { id: "gpt-6-luna", name: "GPT-6 Luna", note: "Fast and efficient for everyday agent work." },
    ],
  },
  {
    provider: "Grok",
    mark: "grok",
    models: [
      { id: "grok-4.7", name: "Grok 4.7" },
      { id: "grok-4.6", name: "Grok 4.6" },
    ],
  },
  {
    provider: "Gemini",
    mark: "antigravity",
    models: [
      { id: "gemini-4-argon", name: "Gemini 4 Argon" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
    ],
  },
];

/** The current model of the preview agents: the app's default for a new agent (`DEFAULT_AGENT_MODEL`). */
export const PREVIEW_DEFAULT_MODEL = "gpt-6-luna";

/** The one routine of the profile's Routines page. */
export const PREVIEW_ROUTINE = {
  name: "Morning check-in",
  schedule: "Every weekday at 8:00",
  timezone: "America/Argentina/Salta",
};

/** Made-up rows of the Library page: a link, two images, a file. */
export const PREVIEW_LIBRARY: { id: string; kind: "link" | "image" | "file"; title: string; detail: string }[] = [
  { id: "l1", kind: "link", title: "latam-airlines.com/booking/LA2471", detail: "latam-airlines.com" },
  { id: "l2", kind: "image", title: "boarding-pass-lima.png", detail: "1 d" },
  { id: "l3", kind: "file", title: "Lima trip budget.pdf", detail: "PDF · 2 d" },
  { id: "l4", kind: "link", title: "booking.com/hotel/pe/miraflores-park", detail: "booking.com" },
  { id: "l5", kind: "image", title: "hotel-room.jpg", detail: "3 d" },
  { id: "l6", kind: "link", title: "maps.google.com/?q=Miraflores", detail: "maps.google.com" },
];

/** The made-up account and servers of the preview Settings sheet. */
export const PREVIEW_ACCOUNT = { name: "Alex Rivera", email: "alex@example.com", usage: 42, plan: "Pro" };

export const PREVIEW_SERVERS: { id: string; name: string; detail: string; current: boolean }[] = [
  { id: "home", name: "Home server", detail: "This Mac", current: true },
  { id: "work", name: "Work server", detail: "Remote · 4 members", current: false },
  { id: "cloud", name: "Cloud server", detail: "Remote", current: false },
];

export const PREVIEW_APP_VERSION = { from: "1.4.10", to: "1.5.0", build: "1.4.10 (1)" };

/** Rows of the grid sheet: apps, agents and skills from the marketplace, with a reason line. */
export type PreviewCatalogKind = "app" | "agent" | "skill";

export interface PreviewCatalogItem {
  id: string;
  kind: PreviewCatalogKind;
  name: string;
  reason: string;
  /** The icon tile color; the glyph is the kind's icon. */
  tint: string;
  connected: boolean;
}

export const PREVIEW_CATALOG: PreviewCatalogItem[] = [
  { id: "mail", kind: "app", name: "Mail", reason: "Because you use Calendar", tint: "#2f7cf6", connected: false },
  { id: "notes", kind: "app", name: "Notes", reason: "Because you use Drive", tint: "#f5b83d", connected: false },
  { id: "tasks", kind: "app", name: "Tasks", reason: "Because you use Mail", tint: "#5cc79e", connected: false },
  { id: "sheets", kind: "app", name: "Sheets", reason: "Because you use Notes", tint: "#3a9f7a", connected: false },
  {
    id: "travel",
    kind: "agent",
    name: "Travel Planner",
    reason: "Plans trips and books flights",
    tint: "#9b82f0",
    connected: false,
  },
  {
    id: "inbox",
    kind: "agent",
    name: "Inbox Helper",
    reason: "Sorts mail and drafts replies",
    tint: "#f2843c",
    connected: false,
  },
  {
    id: "deck",
    kind: "skill",
    name: "Slide decks",
    reason: "Builds a deck from notes",
    tint: "#ef77ad",
    connected: false,
  },
  { id: "pdf", kind: "skill", name: "PDF reader", reason: "Reads and sums up PDFs", tint: "#3dbfd1", connected: false },
];

export const PREVIEW_CONNECTED_COUNT = 12;

/** Made-up search results for a typed query: agents and messages, with the matched words. */
export interface PreviewSearchMessage {
  id: string;
  agentId: string;
  title: string;
  /** The context line; `match` is the part shown in bold. */
  before: string;
  match: string;
  after: string;
}

export const PREVIEW_SEARCH_MESSAGES: PreviewSearchMessage[] = [
  {
    id: "s1",
    agentId: "papers",
    title: "Papers to you",
    before: "Monday ",
    match: "paper",
    after: ": attention sinks in long context",
  },
  {
    id: "s2",
    agentId: "deck",
    title: "Pitch Deck to you",
    before: "The deck now cites the ",
    match: "paper",
    after: " in the appendix",
  },
  {
    id: "s3",
    agentId: "reading",
    title: "Reading to you",
    before: "Chapter 4 and the ",
    match: "paper",
    after: " on memory are next",
  },
  {
    id: "s4",
    agentId: "poke",
    title: "You to Poke",
    before: "Weekly AI models ",
    match: "paper",
    after: " review every Friday",
  },
  {
    id: "s5",
    agentId: "papers",
    title: "Papers to you",
    before: "Saved the ",
    match: "paper",
    after: " to your library",
  },
];
