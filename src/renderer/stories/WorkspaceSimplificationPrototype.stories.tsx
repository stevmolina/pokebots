import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  BotSidebarCompareVariant,
  LeftSidebarBottomVariant,
  ResponsiveWorkspaceVariant,
  UnifiedSettingsVariant,
} from "./workspace-simplification-prototype";

const meta = {
  title: "Prototypes/Workspace Simplification",
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 1A. Left sidebar bottom simplified to 3 buttons in a compact capsule pill, with Profile/Machines modal open. */
export const LeftSidebarPillTrio: Story = {
  name: "1A. Left Sidebar — Compact Pill Trio (3 Buttons)",
  render: () => <LeftSidebarBottomVariant look="pill-trio" initialProfileOpen />,
};

/** 1B. Grok-inspired borderless split footer: Profile & active machine chip on the left, Providers + Connect Apps on the right. */
export const LeftSidebarSplitFooter: Story = {
  name: "1B. Left Sidebar — Grok Split Footer (3 Buttons)",
  render: () => <LeftSidebarBottomVariant look="split-footer" />,
};

/** 1C. Equal 3-button dock bar: Account, Providers, and Apps aligned cleanly at the bottom of the sidebar. */
export const LeftSidebarDockTrio: Story = {
  name: "1C. Left Sidebar — Equal Dock Trio (3 Buttons)",
  render: () => <LeftSidebarBottomVariant look="dock-trio" />,
};

/** 2A. Standalone full-window Settings (no bot sidebar), Grok-minimal 6-item nav + inline machine switcher pill. */
export const UnifiedSettingsGrokFlat: Story = {
  name: "2A. Settings — Minimal Full Page + Machine Pill",
  render: () => <UnifiedSettingsVariant variant="grok-flat" initialSection="machines" />,
};

/** 2A2. Minimal Updates view inside standalone Settings, matching the Grok Bot Updates screen. */
export const UnifiedSettingsUpdatesView: Story = {
  name: "2A2. Settings — Minimal Updates View",
  render: () => <UnifiedSettingsVariant variant="grok-flat" initialSection="updates" />,
};

/** 2B. Standalone full-window Settings with two quiet nav groups (Overall + Machines) and 4-tab machine editor. */
export const UnifiedSettingsTwoTier: Story = {
  name: "2B. Settings — Overall + Per-Machine Nav",
  render: () => <UnifiedSettingsVariant variant="two-tier" initialSection="machine:vps" />,
};

/** 2C. Standalone Settings with card hub for connected machines and drill-down detail view. */
export const UnifiedSettingsHubDrill: Story = {
  name: "2C. Settings — Machines Hub + Drill-Down",
  render: () => <UnifiedSettingsVariant variant="hub-drill" initialSection="machines" />,
};

/** 3A. Interactive side-by-side switcher inside the real chat: compare Current OpenBot vs Grok Minimalist vs Hybrid Focus. */
export const BotSidebarComparison: Story = {
  name: "3A. Bot Sidebar — Live Comparison (OpenBot vs Grok vs Hybrid)",
  render: () => <BotSidebarCompareVariant initialMode="grok" showSwitcher />,
};

/** 3B. Grok-minimalist bot drawer inside the real conversation: centered avatar, Activity/Library tabs, Computer & Voice cards. */
export const BotSidebarGrokMinimal: Story = {
  name: "3B. Bot Sidebar — Grok Minimalist",
  render: () => <BotSidebarCompareVariant initialMode="grok" />,
};

/** 3C. Hybrid minimalist bot drawer: keeps single-scroll OpenBot capabilities without exposed text input walls. */
export const BotSidebarHybridFocus: Story = {
  name: "3C. Bot Sidebar — Hybrid Focus",
  render: () => <BotSidebarCompareVariant initialMode="hybrid" />,
};

/** 4A. Interactive responsive tester across Laptop, iPad (820px), and iPhone (390px) for Chat, Settings, and Bot Sidebar. */
export const ResponsiveShowcase: Story = {
  name: "4A. Responsive — Laptop / iPad / iPhone Switcher",
  render: () => <ResponsiveWorkspaceVariant initialDevice="ipad" initialScreen="workspace" />,
};

/** 4B. iPhone (390px) mobile workspace & simplified 3-button dock + full-screen unified settings. */
export const ResponsiveIphonePreview: Story = {
  name: "4B. Responsive — iPhone (390px)",
  render: () => <ResponsiveWorkspaceVariant initialDevice="iphone" initialScreen="workspace" />,
};
