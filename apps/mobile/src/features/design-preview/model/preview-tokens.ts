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
   * The one accent: unread dot, unread pill, links, checks. It is the Pokebots brand blue
   * (`POKEBOTS_HUE_COLORS[215]`), not the reference's blue: the preview keeps the reference's layout
   * and calm, and Pokebots' own colors.
   */
  accent: "#2f7cf6",
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
  /** Quiet lines for tasks and routine runs in a chat. */
  quietLine: "#8b8b8d",
  /** Profile and its pages: a light gray page with white groups. */
  pageBackground: "#f7f7f7",
  groupBackground: "#ffffff",
  groupSeparator: "#e5e5e7",
  /** A value beside a row label, such as "Idle" or "1 active". */
  rowValue: "#7e7e81",
  /** Group captions and the help text under a group. */
  groupCaption: "#a9a9ab",
  /** The gray Edit pill and the inactive filter chips. */
  softFill: "#e7e7e9",
  /** The active filter chip and the Done pill. */
  strongFill: "#060606",
  /** The Library list sits in one gray group. */
  libraryGroup: "#ededed",
  /** Settings and the grid sheet: a light gray sheet with white groups. */
  sheetBackground: "#f8f8f8",
  /** Sign out and other destructive rows. The reference's raw P3 red #b80505 is #c90000 in sRGB. */
  danger: "#c90000",
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
  accent: "#2f7cf6",
  onAccent: "#ffffff",
  agentBubble: "#262628",
  agentText: "#ffffff",
  composerButton: "#2c2c2e",
  placeholder: "#8e8e93",
  icon: "#ffffff",
  glassFallback: "#242426",
  quietLine: "#8e8e93",
  pageBackground: "#000000",
  groupBackground: "#1c1c1e",
  groupSeparator: "#38383a",
  rowValue: "#8e8e93",
  groupCaption: "#6e6e73",
  softFill: "#2c2c2e",
  strongFill: "#ffffff",
  libraryGroup: "#1c1c1e",
  sheetBackground: "#141414",
  danger: "#ff453a",
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

/** Sheets and menus: the app's grouped sheet, with the reference's emoji circles. */
export const previewSheet = {
  emojiCircle: 44,
  emojiRowGap: 12,
  iconSize: 21,
  /** The long-press card of a chat row. */
  rowPreviewHeaderHeight: 60,
  rowPreviewHeight: 150,
} as const;

/** Settings, search and the grid sheet (batch 4), measured from the reference. */
export const previewBatch4 = {
  /** The close circle: 44 pt, 16 pt from the left, 17 pt under the sheet top. */
  closeTop: 17,
  /** Settings: the first group 97 pt under the sheet top; groups 16 pt from the sides, rows 52 pt. */
  settingsTop: 97,
  rowHeight: 52,
  /** A row with a gray line under its label. */
  detailRowHeight: 62,
  groupGap: 26,
  /** The account row: a 36 pt photo, the row 71 pt high. */
  accountAvatar: 36,
  accountRowHeight: 71,
  /** The footer: a 54 pt logo, the name and the version, centered. */
  footerTop: 60,
  footerLogo: 54,
  /** Search: chips 35 pt high at the safe-area top + 4; result rows 80 pt with a 44 pt face. */
  searchChipsTop: 4,
  searchChipHeight: 35,
  /** The first result row starts 8 pt under the chips. */
  searchFirstRowTop: 8,
  searchRowHeight: 80,
  searchAvatar: 44,
  /** The close circle beside the field: 47 pt like the grid button, 12 pt after the field. */
  searchCloseButton: 47,
  searchFieldGap: 12,
  /** Grid sheet: the title row centered on the close circle, chips 34 pt high 34 pt under it, rows 68 pt with a 30 pt icon. */
  gridChipsTop: 33,
  gridChipHeight: 34,
  gridCaptionTop: 19,
  gridFirstRowGap: 16,
  gridRowHeight: 68,
  gridIcon: 30,
  gridIconRadius: 7,
  gridConnectHeight: 33,
  gridConnectPaddingX: 8,
  /** Search and grid chips are tighter than the Library's. */
  tightChipPaddingX: 10,
  gridHeaderPillPaddingX: 20,
  gridHeaderPillHeight: 48,
} as const;

/** The agent profile and its pages, measured from the reference. */
export const previewProfile = {
  /** Face top 72 pt under the header buttons; 88 pt face. */
  faceTop: 72,
  face: 88,
  nameGap: 9,
  editPillHeight: 38,
  editPillPaddingX: 10,
  editPillGap: 10,
  /** First group 25 pt under the Edit pill; groups 16 pt from the sides, rows 52 pt. */
  groupsTop: 25,
  groupInset: 16,
  groupRadius: 16,
  groupGap: 26,
  rowHeight: 52,
  rowIconInset: 20,
  rowIconSize: 20,
  rowLabelInset: 52,
  /** A row with no icon, such as Notifications, starts its label here. */
  rowPlainInset: 18,
  /** Caption over a group, and help text under one. */
  captionGap: 8,
  helpGap: 9,
  toggleRowHeight: 56,
  /** A page header: the title centered on the back circle; chips 33 pt high, 8 pt apart. */
  chipHeight: 33,
  chipGap: 8,
  chipPaddingX: 18,
  libraryRowHeight: 72,
  /** Right padding of a row: the chevron ends 23 pt from the group edge, 16 pt after a value. */
  rowPaddingRight: 17,
  chevronGap: 9,
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
  profileName: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  pageTitle: { fontSize: 17, lineHeight: 22, fontWeight: "500" },
  rowLabel: { fontSize: 17, lineHeight: 22 },
  rowValue: { fontSize: 17, lineHeight: 22 },
  groupCaption: { fontSize: 14, lineHeight: 18 },
  help: { fontSize: 14, lineHeight: 19 },
  chip: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  rowDetail: { fontSize: 14, lineHeight: 18 },
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
