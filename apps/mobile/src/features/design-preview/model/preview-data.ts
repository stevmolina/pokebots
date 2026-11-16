import type { AvatarHue } from "@openbot/contracts/ipc";

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
