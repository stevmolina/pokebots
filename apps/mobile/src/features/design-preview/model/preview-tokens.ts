import type { TextStyle } from "react-native";

/*
 * The one style file of the calm design preview (Grok Bot-style chat list and chat). Every preview
 * screen reads its colors, sizes and spacing from here, so a change of the look is a change of this
 * file. The values are points, measured on an iPhone 14 (390 x 844 pt) from the reference screens:
 * see `.openbot-build/grokbot-study/map.md` in the main checkout (not in git: it holds private chats).
 *
 * The preview is a mockup behind a switch. When Steven approves the look, these values move into
 * `packages/brand/src/tokens-native.css` and the real screens.
 */

/** Light colors. One flat background, one blue for unread, gray text in three steps. */
const LIGHT = {
  /** The list and the chat use the same flat background. */
  background: "#fcfcfc",
  title: "#000000",
  /** Chat preview line under a row title. */
  preview: "#78787a",
  /** Row time and centered chat time stamps. */
  time: "#bebdbf",
  /** Section labels and the last gray link of the list. */
  section: "#7e7e80",
  /** The count beside a section label, lighter than the label. */
  sectionCount: "#b4b4b6",
  /**
   * The one accent: unread dot, unread pill, links. The screenshots are Display P3: the raw #3e81f1
   * of the reference is #1983f9 in sRGB, which React Native takes.
   */
  accent: "#1983f9",
  onAccent: "#ffffff",
  /** Agent message bubble. */
  agentBubble: "#f1f1f2",
  agentText: "#000000",
  /** Gray circles inside the composer (+, mic). */
  composerButton: "#ececee",
  placeholder: "#8b8b8d",
  icon: "#000000",
  /** The solid stand-in for glass when Liquid Glass is off or Reduce Transparency is on. */
  glassFallback: "#ffffff",
  /** Star badge of the main agent: the brand sunny yellow. */
  heroBadge: "#f5b83d",
  /** Quiet lines for tasks and routine runs in a chat. */
  quietLine: "#8b8b8d",
};

export type PreviewColors = typeof LIGHT;

/** Dark colors, the same roles on the app's dark sheet palette. Not measured: the reference is light. */
const DARK: PreviewColors = {
  background: "#141414",
  title: "#ffffff",
  preview: "#96969b",
  time: "#5e5e62",
  section: "#8e8e93",
  sectionCount: "#5e5e62",
  accent: "#1983f9",
  onAccent: "#ffffff",
  agentBubble: "#262628",
  agentText: "#ffffff",
  composerButton: "#2c2c2e",
  placeholder: "#8e8e93",
  icon: "#ffffff",
  glassFallback: "#242426",
  heroBadge: "#f5b83d",
  quietLine: "#8e8e93",
};

export function previewColors(scheme: "light" | "dark"): PreviewColors {
  return scheme === "dark" ? DARK : LIGHT;
}

/** Sizes and positions, in points. */
export const previewSize = {
  /** Profile, +, back and ••• circles. Top at the safe-area top, 16 pt from the side. */
  headerButton: 44,
  headerInset: 16,
  /** The main agent at the top of the list. Its top is 90 pt under the header buttons. */
  heroAvatar: 88,
  heroTop: 90,
  heroBadge: 22,
  heroLabelGap: 10,
  /** Section labels: 20 pt from the side, 45 pt apart. */
  sectionInset: 20,
  sectionPitch: 45,
  /** Space between the hero label and the first section label. */
  sectionsTop: 26,
  /** A chat row: 80 pt high, 45 pt avatar 22 pt from the side, text 16 pt after the avatar. */
  rowHeight: 80,
  rowAvatar: 45,
  rowAvatarInset: 22,
  rowTextGap: 16,
  /** Time and unread dot: 22 pt from the right side. */
  rowTrailingInset: 22,
  rowTrailingGap: 12,
  unreadDot: 10,
  /** The floating unread pill: 38 pt high, its bottom 49 pt over the bottom bar. */
  unreadPillHeight: 38,
  unreadPillGap: 49,
  /** When the next unread chat is above, the pill sits 74 pt under the safe-area top instead. */
  unreadPillTopGap: 74,
  /** Bottom bar: 47 pt grid circle and 48 pt search capsule, 28 pt from the sides, 12 pt apart. */
  bottomBarInset: 28,
  bottomBarGap: 12,
  bottomBarBottom: 29,
  gridButton: 47,
  searchHeight: 48,
  /** Chat: bubbles 16 pt from the sides, an agent bubble leaves 60 pt on the right. */
  bubbleInset: 16,
  agentBubbleRightGap: 60,
  userBubbleLeftGap: 60,
  bubbleRadius: 20,
  bubblePaddingX: 15,
  bubblePaddingY: 8,
  /** Space between bubbles of one group, and around a centered time stamp. */
  bubbleGap: 8,
  groupGap: 13,
  stampGap: 20,
  /** Chat title pill: a 30 pt face and the name, 44 pt high like the circles, about 150 pt wide. */
  titlePillHeight: 44,
  titlePillAvatar: 30,
  titlePillPaddingLeft: 7,
  titlePillPaddingRight: 16,
  /** Composer: 48 pt capsule, 30 pt from the sides, 31 pt from the bottom edge, 34 pt circles. */
  composerHeight: 48,
  composerInset: 30,
  composerBottom: 31,
  composerButton: 34,
  composerButtonInset: 7,
} as const;

/** Type sizes. The preview keeps the app font (Inter); the reference uses the system font. */
export const previewType = {
  heroLabel: { fontSize: 14, lineHeight: 18 },
  section: { fontSize: 15, lineHeight: 20 },
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: "500" },
  rowPreview: { fontSize: 15, lineHeight: 20 },
  rowTime: { fontSize: 13, lineHeight: 18 },
  pill: { fontSize: 16, lineHeight: 20, fontWeight: "500" },
  search: { fontSize: 17, lineHeight: 22 },
  chatTitle: { fontSize: 17, lineHeight: 22, fontWeight: "500" },
  message: { fontSize: 17, lineHeight: 24 },
  stamp: { fontSize: 13, lineHeight: 18 },
  quietLine: { fontSize: 14, lineHeight: 19 },
  composer: { fontSize: 17, lineHeight: 22 },
} as const satisfies Record<string, TextStyle>;

/**
 * Your own bubbles take the color of the agent of the chat: its brand hue, a little deeper so white
 * text stays readable (the reference does the same with its green).
 */
export const PREVIEW_USER_BUBBLE: Readonly<Record<number, string>> = {
  215: "#2f7cf6",
  150: "#3a9f7a",
  30: "#e0691f",
  280: "#8466e0",
};

/** The soft shadow under floating circles and capsules when they draw solid. */
export const PREVIEW_FLOAT_SHADOW = "0 4px 14px rgba(0, 0, 0, 0.08)";
