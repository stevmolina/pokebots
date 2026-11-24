import { disconnectedPasswordManager, type PasswordManagerStatus } from "@pokebots/contracts/ipc";
import { KeeperConnectorPanel } from "@pokebots/ui/features/settings/KeeperConnectorPanel";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { SettledArgs } from "./settled-args";

const meta = {
  title: "Settings/KeeperConnectorPanel",
  component: KeeperConnectorPanel,
  parameters: { layout: "padded", a11y: { test: "error" } },
  render: (args) => <SettledArgs>{() => <KeeperConnectorPanel {...args} />}</SettledArgs>,
} satisfies Meta<typeof KeeperConnectorPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = (status: Partial<PasswordManagerStatus>, hostName?: string) => ({
  status: { ...disconnectedPasswordManager("keeper", ["account"]), ...status },
  busy: false,
  onConnect: fn(),
  onSubmitCode: fn(),
  onCancel: fn(),
  onDisconnect: fn(),
  hostName,
});

const CONNECTED: Partial<PasswordManagerStatus> = {
  state: "connected",
  vaultNames: ["Shared with OpenBot"],
  loginCount: 12,
};

const SIGNING_IN: Partial<PasswordManagerStatus> = { state: "signing-in" };

/** The email and the master password. Connect opens the steps. */
export const Disconnected: Story = { args: args({}) };

/** The host gives the account to Keeper Commander. × closes the dialog, and the sign-in goes on. */
export const Setup: Story = { args: args({ ...SIGNING_IN, step: "setup" }) };

/** Keeper asks for a two-step code from an authenticator app or a text message. */
export const TwoFactor: Story = { args: args({ ...SIGNING_IN, step: "two-factor" }) };

/** The last code was wrong, and Keeper asks again. */
export const TwoFactorWrongCode: Story = {
  args: args({
    ...SIGNING_IN,
    step: "two-factor",
    errorCode: "code",
    error: "The code is not correct. Enter it again.",
  }),
};

/** Keeper sent an approval email and a push. Continue with an empty field checks the approval again. */
export const DeviceApproval: Story = { args: args({ ...SIGNING_IN, step: "device-approval" }) };

export const Connected: Story = { args: args(CONNECTED) };

/** The Keeper session ended: the form asks for the master password again. */
export const Expired: Story = { args: args({ ...CONNECTED, errorCode: "expired" }) };

/** The Keeper administrator blocked Keeper Commander for the account. */
export const PlanError: Story = { args: args({ state: "failed", errorCode: "plan" }) };

/** The sign-in stopped with the host's sentence. */
export const Failed: Story = {
  args: args({ state: "failed", error: "The email or the master password is not correct." }),
};

/** A joined server: only the text names the server. */
export const OnServer: Story = { args: args({}, "Studio") };

export const OnServerDeviceApproval: Story = {
  args: args({ ...SIGNING_IN, step: "device-approval" }, "Studio"),
};

export const OnServerConnected: Story = { args: args(CONNECTED, "Studio") };
