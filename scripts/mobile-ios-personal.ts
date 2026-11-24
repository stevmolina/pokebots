// Builds the iOS app with a free Apple Account and installs it on one's own iPhone.
//
// A free account ("Personal Team") signs for 7 days, so run this again each week. It needs:
// - Xcode, signed in to the Apple Account (Xcode > Settings > Accounts).
// - The iPhone plugged in once (later on the same Wi-Fi), with Developer Mode on.
// After the first install, trust the developer on the phone: Settings > General >
// VPN & Device Management.
//
// The build is the personal configuration of `apps/mobile/app.config.js`: no push notifications,
// widgets, share extension or shortcuts, and no over-the-air updates. Sign in with the QR code of
// the desktop app; the code names its account service.
//
//   bun scripts/mobile-ios-personal.ts [--device <name or id>] [--team <team id>] [--skip-prebuild]
//
// Environment: OPENBOT_IOS_PERSONAL_BUNDLE_ID (default xyz.pokebots.personal),
// OPENBOT_IOS_PERSONAL_NAME (default Pokebots), OPENBOT_BRAND_NAME (default Pokebots), OPENBOT_IOS_TEAM_ID.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = fileURLToPath(new URL("../apps/mobile", import.meta.url));
const XCODE_DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";

const argv = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.platform !== "darwin") throw new Error("An iOS build requires macOS.");
if (!existsSync(join(mobileRoot, "../../node_modules/expo"))) {
  throw new Error("Dependencies are not installed in this worktree. Run `bun install --frozen-lockfile` first.");
}
if (!existsSync(XCODE_DEVELOPER_DIR)) throw new Error("Install Xcode from the App Store first.");

const env: NodeJS.ProcessEnv = {
  ...process.env,
  DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? XCODE_DEVELOPER_DIR,
  OPENBOT_IOS_PERSONAL: "1",
  OPENBOT_IOS_PERSONAL_NAME: process.env.OPENBOT_IOS_PERSONAL_NAME ?? "Pokebots",
  // The Pokebots look: the app icon, the splash and the colors (`apps/mobile/app.config.js`). Set it to an
  // empty value for the OpenBot look. The text says Pokebots in the source.
  OPENBOT_BRAND_NAME: process.env.OPENBOT_BRAND_NAME ?? "Pokebots",
  EXPO_PUBLIC_APP_ENV: "production",
};
const bundleId = env.OPENBOT_IOS_PERSONAL_BUNDLE_ID ?? "xyz.pokebots.personal";

function run(command: string, args: string[], cwd = mobileRoot): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function read(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8", env });
  return result.status === 0 ? result.stdout : "";
}

/** The team of the free account: the option, the setting, or the account signed in to Xcode. */
function teamId(): string {
  const given = option("--team") ?? env.OPENBOT_IOS_TEAM_ID;
  if (given) return given;
  const certificates = read("security", ["find-certificate", "-a", "-c", "Apple Development", "-p"]);
  const subjects = certificates
    .split(/(?=-----BEGIN CERTIFICATE-----)/)
    .filter((pem) => pem.includes("BEGIN CERTIFICATE"))
    .map((pem) => spawnSync("openssl", ["x509", "-noout", "-subject"], { input: pem, encoding: "utf8" }).stdout);
  const fromCertificate = subjects.map((subject) => /OU\s*=\s*([A-Z0-9]{10})/.exec(subject)?.[1]).find(Boolean);
  if (fromCertificate) return fromCertificate;
  const xcodeTeams = read("defaults", ["read", "com.apple.dt.Xcode", "IDEProvisioningTeamByIdentifier"]);
  const fromXcode = /teamID\s*=\s*"?([A-Z0-9]{10})"?/.exec(xcodeTeams)?.[1];
  if (fromXcode) return fromXcode;
  throw new Error(
    "No Apple team found. Sign in to Xcode > Settings > Accounts with your Apple Account, or pass --team.",
  );
}

interface ListedDevice {
  readonly identifier?: string;
  readonly deviceProperties?: { readonly name?: string };
  readonly hardwareProperties?: { readonly platform?: string; readonly udid?: string; readonly deviceType?: string };
}

interface Device {
  readonly identifier: string;
  readonly udid: string;
  readonly name: string;
  readonly isPhone: boolean;
}

/** The connected device: the one named by --device, the only one, or the only iPhone among several. */
function device(): Device {
  const directory = mkdtempSync(join(tmpdir(), "openbot-devices-"));
  const output = join(directory, "devices.json");
  try {
    read("xcrun", ["devicectl", "list", "devices", "--json-output", output]);
    if (!existsSync(output))
      throw new Error("`xcrun devicectl list devices` failed. Is Xcode installed and opened once?");
    const listed: readonly ListedDevice[] = JSON.parse(readFileSync(output, "utf8")).result?.devices ?? [];
    const devices: Device[] = listed.flatMap((entry) => {
      const udid = entry.hardwareProperties?.udid;
      if (entry.hardwareProperties?.platform !== "iOS" || !udid || !entry.identifier) return [];
      const name = entry.deviceProperties?.name ?? udid;
      return [{ identifier: entry.identifier, udid, name, isPhone: entry.hardwareProperties?.deviceType === "iPhone" }];
    });
    const wanted = option("--device");
    const matches = wanted ? devices.filter((d) => [d.name, d.udid, d.identifier].includes(wanted)) : devices;
    const phones = matches.filter((d) => d.isPhone);
    const [only, ...others] = matches.length > 1 && phones.length === 1 ? phones : matches;
    if (only && others.length === 0) return only;
    if (!only) throw new Error("No iPhone found. Plug it in, unlock it, and tap Trust.");
    throw new Error(`Several devices found: ${matches.map((d) => d.name).join(", ")}. Pass --device <name>.`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const team = teamId();
const target = device();
process.stdout.write(`Building ${bundleId} for ${target.name} with team ${team}.\n`);

const require = createRequire(join(mobileRoot, "package.json"));
const expo = require.resolve("expo/bin/cli");
if (!argv.includes("--skip-prebuild")) run("node", [expo, "prebuild", "--platform", "ios", "--clean"]);

const derivedData = join(mobileRoot, "ios/DerivedData-personal");
run("xcodebuild", [
  "-workspace",
  join(mobileRoot, `ios/${env.OPENBOT_IOS_PERSONAL_NAME}.xcworkspace`),
  "-scheme",
  env.OPENBOT_IOS_PERSONAL_NAME ?? "Pokebots",
  "-configuration",
  "Release",
  "-destination",
  `id=${target.udid}`,
  "-derivedDataPath",
  derivedData,
  "-allowProvisioningUpdates",
  "-allowProvisioningDeviceRegistration",
  `DEVELOPMENT_TEAM=${team}`,
  "CODE_SIGN_STYLE=Automatic",
  "build",
]);

const app = join(derivedData, `Build/Products/Release-iphoneos/${env.OPENBOT_IOS_PERSONAL_NAME}.app`);
run("xcrun", ["devicectl", "device", "install", "app", "--device", target.identifier, app]);
run("xcrun", ["devicectl", "device", "process", "launch", "--device", target.identifier, bundleId]);
process.stdout.write(`Installed on ${target.name}. The signature lasts 7 days; run this again before then.\n`);
