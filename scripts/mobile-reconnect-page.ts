// The page of `scripts/mobile-reconnect-e2e.ts`. It runs in Chrome with the real phone peer code: the
// `createRemoteTeamPeer` call of `apps/mobile/src/features/workspace/components/remote-team-bridge.dom.tsx`,
// with or without the hint store of `peer-hints.ts`. Signal and the host are small fakes in the same
// page, and the WebRTC connection between the phone and the host is a real one on this computer.
//
// The far path is a model, in round trips (RT) of `rt` milliseconds:
// - Account service: each ticket request takes 1 RT (the session request runs while the page loads).
// - Signal: a new socket opens after 3 RT (TCP, TLS and the upgrade). Each message takes RT/2.
// - TURN: the candidates of a new gathering come 2 RT after it starts (the relay allocation). Until
//   then, the offer has no candidates.
// - The host uses a candidate of the phone 3 RT after it arrives for a new connection (ICE check,
//   DTLS and SCTP), and 1 RT after it arrives for an ICE restart. The host sends no candidates of its own.
// - Data channels: each frame takes RT/2 in each direction.
// - After more than 30 s away, the host holds the frames of the old path until the ICE restart is
//   done, as a host that stopped the path after its consent checks failed.
import { isDynamicRecord, isString } from "@pokebots/contracts/runtime-values";
import type { SignalServerMessage } from "@pokebots/contracts/signal-protocol/messages";
import { TEAM_API_ROUTES } from "@pokebots/contracts/team-api-routes";
import {
  decodeTeamProtocolV2AuthFrame,
  decodeTeamProtocolV2RpcFrame,
  encodeTeamProtocolV2Frame,
  TEAM_PROTOCOL_V2_CHANNELS,
  teamProtocolV2AuthenticationTranscript,
} from "@pokebots/contracts/team-protocol";
import { readTeamHostCompatibility, TEAM_WEB_CLIENT_PROTOCOL } from "@pokebots/contracts/team-protocol/current";
import type { TeamProtocolV2Json } from "@pokebots/contracts/team-protocol/v2";
import { bytesToBase64Url } from "@pokebots/team-client/base64";
import { createEd25519Identity, type Ed25519Identity, signEd25519 } from "@pokebots/team-client/ed25519";
import {
  createRemoteTeamPeer,
  type RemoteTeamCommand,
  type RemoteTeamCommandResult,
  type RemoteTeamPeerActions,
} from "@pokebots/team-client/remote-peer";
import { encodeTeamWebRtcPayload, TeamWebRtcPayloadDecoder } from "@pokebots/team-client/webrtc-framing";
import { Effect } from "effect";
import {
  createPeerHintStore,
  decodePeerHints,
  type PeerHints,
} from "../apps/mobile/src/features/workspace/model/peer-hints";

export type Mode = "before" | "after";
export type Scenario = "cold-start" | "return-60s" | "return-15m" | "return-15m-reload" | "three-servers-return";

/** The steps of one connection, in milliseconds after the start of the measured part. */
export interface StepTimes {
  ticket: number | null;
  signalOpen: number | null;
  ready: number | null;
  channels: number | null;
  auth: number | null;
  connect: number | null;
  compatibility: number | null;
  firstRead: number | null;
}

export interface RunResult {
  scenario: Scenario;
  mode: Mode;
  /** One entry for each server, the selected one first. */
  servers: StepTimes[];
  /** The last server whose first read came. */
  allServersMs: number;
  errors: string[];
}

const SIGNAL_URL = "wss://signal.mobile-reconnect.test/v1/signal";
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:127.0.0.1:9" }];
const RECONNECT_GRACE_MS = 10 * 60_000;
/** The phone holds the other servers this long at most on a return (`OTHER_SERVERS_RETURN_DELAY_MS` before this change). */
const OLD_RETURN_HOLD_MS = 3_000;

let rt = 260;
const NativeWebSocket = WebSocket;
const NativePeerConnection = RTCPeerConnection;
const realNow = Date.now.bind(Date);
/** The page clock jumps forward to model time away from the app. Timers keep the real time. */
let clockSkew = 0;
Date.now = () => realNow() + clockSkew;

const later = (ms: number, run: () => void) => {
  setTimeout(run, Math.max(0, ms));
};
const sleep = (ms: number) => new Promise<void>((resolve) => later(ms, resolve));
const randomId = () => bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12)));

function candidateLines(sdp: string): string[] {
  return sdp.split(/\r\n/u).filter((line) => line.startsWith("a=candidate:"));
}

function withoutCandidates(sdp: string): string {
  return sdp
    .split(/\r\n/u)
    .filter((line) => !line.startsWith("a=candidate:") && line !== "a=end-of-candidates")
    .join("\r\n");
}

const iceUfrag = (sdp: string | undefined) => sdp?.match(/^a=ice-ufrag:(\S+)$/mu)?.[1] ?? null;

// ---------------------------------------------------------------------------------------------
// The phone's network: the Signal socket and the TURN gathering.

interface SignalLink {
  receive(data: string): void;
  closed(): void;
}

/** A Signal socket over the far path. It reaches the fake Signal of this page. */
class FarWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly url: string;
  readyState = FarWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  #link: SignalLink | null = null;

  constructor(url: string) {
    this.url = url;
    later(3 * rt, () => {
      if (this.readyState !== FarWebSocket.CONNECTING) return;
      this.readyState = FarWebSocket.OPEN;
      this.#link = signal.accept(this);
      this.onopen?.(new Event("open"));
    });
  }

  send(data: string): void {
    if (this.readyState !== FarWebSocket.OPEN) throw new Error("The socket is not open.");
    const link = this.#link;
    later(rt / 2, () => link?.receive(data));
  }

  close(code = 1000): void {
    if (this.readyState === FarWebSocket.CLOSED) return;
    this.readyState = FarWebSocket.CLOSED;
    const link = this.#link;
    this.#link = null;
    if (link) later(rt / 2, () => link.closed());
    queueMicrotask(() => this.onclose?.(new CloseEvent("close", { code })));
  }

  /** A frame from Signal. */
  deliver(data: string): void {
    later(rt / 2, () => {
      if (this.readyState === FarWebSocket.OPEN) this.onmessage?.(new MessageEvent("message", { data }));
    });
  }
}

const nativeLocalDescription = Object.getOwnPropertyDescriptor(NativePeerConnection.prototype, "localDescription");

/** The phone's connection. Its candidates come 2 RT after its gathering starts, as relay candidates do. */
class FarPeerConnection extends NativePeerConnection {
  gatherAt = performance.now();
  ufrag: string | null = null;
  iceHandler: ((event: RTCPeerConnectionIceEvent) => unknown) | null = null;

  constructor(configuration?: RTCConfiguration) {
    super(configuration);
    const deliver = (event: RTCPeerConnectionIceEvent) => {
      const wait = this.gatherAt + 2 * rt - performance.now();
      later(wait, () => this.iceHandler?.call(this, event));
    };
    Object.defineProperty(this, "onicecandidate", {
      get: () => this.iceHandler,
      set: (handler: ((event: RTCPeerConnectionIceEvent) => unknown) | null) => {
        this.iceHandler = handler;
      },
    });
    this.addEventListener("icecandidate", deliver);
  }

  override setLocalDescription(description?: RTCLocalSessionDescriptionInit): Promise<void> {
    const ufrag = iceUfrag(description?.sdp);
    if (description?.type === "offer" && ufrag !== this.ufrag) {
      this.ufrag = ufrag;
      this.gatherAt = performance.now();
    }
    return super.setLocalDescription(description);
  }
}

Object.defineProperty(FarPeerConnection.prototype, "localDescription", {
  get(this: FarPeerConnection) {
    const description = nativeLocalDescription?.get?.call(this) as RTCSessionDescription | null;
    if (!description || performance.now() >= this.gatherAt + 2 * rt) return description;
    const sdp = withoutCandidates(description.sdp);
    return { type: description.type, sdp, toJSON: () => ({ type: description.type, sdp }) };
  },
});

// ---------------------------------------------------------------------------------------------
// Signal and the host.

interface HostServer {
  hostId: string;
  identity: Ed25519Identity;
}

const hosts = new Map<string, HostServer>();

class HostConnection {
  readonly connectionId: string;
  readonly host: HostServer;
  readonly sessionId: string;
  client: FarWebSocket | null;
  connection: RTCPeerConnection | null = null;
  /** The delay before the host uses a candidate of the phone. */
  candidateDelayMs = 3 * rt;
  /** Set when the phone was away for more than 30 s: the frames wait for the ICE restart. */
  held: (() => void)[] | null = null;
  restarting = false;
  hostNonce: string | null = null;
  authComplete = false;
  capabilityLists = new Map<string, string[]>();
  readonly decoders = new Map<string, TeamWebRtcPayloadDecoder>();
  readonly channels = new Map<string, RTCDataChannel>();

  constructor(connectionId: string, host: HostServer, sessionId: string, client: FarWebSocket) {
    this.connectionId = connectionId;
    this.host = host;
    this.sessionId = sessionId;
    this.client = client;
  }

  toClient(message: SignalServerMessage): void {
    this.client?.deliver(JSON.stringify(message));
  }

  async offer(sdp: string): Promise<void> {
    const restart = this.connection !== null;
    if (!this.connection) this.connection = this.createConnection();
    const connection = this.connection;
    this.candidateDelayMs = restart ? rt : 3 * rt;
    this.restarting = restart;
    await connection.setRemoteDescription({ type: "offer", sdp: withoutCandidates(sdp) });
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    this.toClient({
      type: "answer",
      version: 1,
      connectionId: this.connectionId,
      channel: "team",
      sdp: withoutCandidates(answer.sdp ?? ""),
    });
    const mid = sdp.match(/^a=mid:(\S+)$/mu)?.[1] ?? "0";
    for (const line of candidateLines(sdp)) this.candidate(line.slice(2), mid);
  }

  candidate(candidate: string, sdpMid: string | null): void {
    const connection = this.connection;
    if (!connection) return;
    later(this.candidateDelayMs, () => {
      void connection.addIceCandidate({ candidate, sdpMid, sdpMLineIndex: 0 }).catch(() => undefined);
      if (!this.restarting) return;
      this.restarting = false;
      const held = this.held;
      this.held = null;
      for (const run of held ?? []) run();
    });
  }

  createConnection(): RTCPeerConnection {
    const connection = new NativePeerConnection({ bundlePolicy: "max-bundle" });
    connection.ondatachannel = ({ channel }) => {
      channel.binaryType = "arraybuffer";
      this.channels.set(channel.label, channel);
      this.decoders.set(channel.label, new TeamWebRtcPayloadDecoder());
      channel.onmessage = ({ data }) =>
        later(rt / 2, () => {
          const run = () => void this.receive(channel.label, data).catch((error) => report(String(error)));
          if (this.held) this.held.push(run);
          else run();
        });
    };
    return connection;
  }

  send(label: string, data: string): void {
    later(rt / 2, () => {
      const channel = this.channels.get(label);
      if (channel?.readyState !== "open") return;
      const size = this.connection?.sctp?.maxMessageSize ?? 65_536;
      for (const frame of encodeTeamWebRtcPayload(data, size)) {
        if (isString(frame)) channel.send(frame);
        else channel.send(frame);
      }
    });
  }

  async receive(label: string, data: unknown): Promise<void> {
    if (!isString(data) && !(data instanceof ArrayBuffer)) return;
    const decoded = this.decoders.get(label)?.push(data);
    if (!isString(decoded) || label !== TEAM_PROTOCOL_V2_CHANNELS.rpc) return;
    // Until `auth-complete`, each frame is an authentication frame. With compact-rpc-v1 the first
    // requests follow it at once.
    if (!this.authComplete) {
      const frame = decodeTeamProtocolV2AuthFrame(decoded);
      if (frame.type === "auth-complete") this.authComplete = true;
      if (frame.type === "auth-init") await this.authInit(frame);
      else if (frame.type === "auth-complete")
        this.send(
          label,
          encodeTeamProtocolV2Frame({
            version: 2,
            type: "auth-confirmed",
            clientNonce: frame.clientNonce,
            hostNonce: frame.hostNonce,
          }),
        );
      return;
    }
    const frame = decodeTeamProtocolV2RpcFrame(decoded);
    if (frame.type !== "request" || !isDynamicRecord(frame.payload)) return;
    const { method, path, capabilities, capabilitiesKey } = frame.payload;
    let list = Array.isArray(capabilities) ? capabilities.filter(isString) : null;
    if (isString(capabilitiesKey)) {
      if (list) this.capabilityLists.set(capabilitiesKey, list);
      else list = this.capabilityLists.get(capabilitiesKey) ?? [];
    }
    const body =
      method === "GET" && path === TEAM_API_ROUTES.compatibility
        ? compatibilityBody((list ?? []).includes("capability-baseline-v1"))
        : FIRST_READ_BODY;
    this.send(
      label,
      encodeTeamProtocolV2Frame({
        version: 2,
        type: "response",
        requestId: frame.requestId,
        result: { status: 200, body },
      }),
    );
  }

  async authInit(frame: { ticket: string; clientPublicKey: string; clientNonce: string }): Promise<void> {
    const local = this.connection?.localDescription?.sdp ?? "";
    const remote = this.connection?.remoteDescription?.sdp ?? "";
    const fingerprint = (sdp: string) =>
      sdp
        .match(/^a=fingerprint:sha-256\s+([^\r\n]+)$/imu)?.[1]
        ?.trim()
        .toUpperCase() ?? "";
    const hostNonce = randomId();
    this.hostNonce = hostNonce;
    const transcript = teamProtocolV2AuthenticationTranscript({
      hostId: this.host.hostId,
      sessionId: this.sessionId,
      ticket: frame.ticket,
      clientPublicKey: frame.clientPublicKey,
      clientNonce: frame.clientNonce,
      hostNonce,
      clientFingerprint: fingerprint(remote),
      hostFingerprint: fingerprint(local),
    });
    const signature = await Effect.runPromise(
      signEd25519(new TextEncoder().encode(transcript), this.host.identity.secretKey),
    );
    this.send(
      TEAM_PROTOCOL_V2_CHANNELS.rpc,
      encodeTeamProtocolV2Frame({
        version: 2,
        type: "auth-ready",
        clientNonce: frame.clientNonce,
        hostNonce,
        signature: bytesToBase64Url(signature),
      }),
    );
  }
}

/** A host of protocol 10 with compact-rpc-v1. The first read of a connection gets the protocol 9 shape. */
function compatibilityBody(protocol10: boolean): TeamProtocolV2Json {
  return protocol10
    ? {
        appVersion: "0.80.0",
        protocol: { minimum: 1, maximum: 10 },
        capabilities: ["long-capability-lists-v1", "capability-baseline-v1", "compact-rpc-v1"],
        absent: [],
      }
    : {
        appVersion: "0.80.0",
        protocol: { minimum: 1, maximum: 10 },
        capabilities: ["long-capability-lists-v1", "compact-rpc-v1"],
      };
}

/** `GET /v1/agents` of a host with no agents. */
const FIRST_READ_BODY: TeamProtocolV2Json = [];

const signal = {
  connections: new Map<string, HostConnection>(),
  accept(socket: FarWebSocket): SignalLink {
    let connection: HostConnection | null = null;
    return {
      receive: (data) => {
        const message = JSON.parse(data);
        if (!isDynamicRecord(message) || !isString(message.type)) return;
        if (message.type === "hello" && isString(message.token)) {
          const [kind, first, second] = message.token.split("|");
          if (kind === "ticket" && first && second) {
            const host = hosts.get(first);
            if (!host) return;
            connection = new HostConnection(randomId(), host, second, socket);
            signal.connections.set(connection.connectionId, connection);
          } else if (kind === "resume" && first) {
            connection = signal.connections.get(first) ?? null;
            if (connection) connection.client = socket;
          }
          if (!connection) {
            socket.deliver(JSON.stringify({ type: "error", version: 1, code: "authentication_required", message: "" }));
            return;
          }
          connection.toClient({
            type: "ready",
            version: 1,
            connectionId: connection.connectionId,
            resumeToken: `resume|${connection.connectionId}`,
            iceServers: ICE_SERVERS,
            reconnectGraceMs: RECONNECT_GRACE_MS,
          });
          return;
        }
        if (!connection || message.connectionId === undefined) return;
        if (message.type === "turn-refresh")
          connection.toClient({
            type: "ready",
            version: 1,
            connectionId: null,
            resumeToken: `resume|${connection.connectionId}`,
            iceServers: ICE_SERVERS,
          });
        else if (message.type === "offer" && isString(message.sdp)) {
          void connection.offer(message.sdp).catch((error) => report(`offer: ${String(error)}`));
        } else if (message.type === "ice-candidate" && isString(message.candidate))
          connection.candidate(message.candidate, isString(message.sdpMid) ? message.sdpMid : null);
      },
      closed: () => {
        if (connection?.client === socket) connection.client = null;
      },
    };
  },
};

// ---------------------------------------------------------------------------------------------
// The phone: one peer page for each server, as `RemoteTeamBridge` makes it.

const errors: string[] = [];
function report(message: string): void {
  errors.push(message);
}

let t0 = 0;
const at = () => Math.round(performance.now() - t0);

interface PhonePage {
  hostId: string;
  peer: ReturnType<typeof createRemoteTeamPeer>;
  steps: StepTimes;
  actions: { current: RemoteTeamPeerActions };
}

/** What the phone kept for each server between pages. */
const kept = new Map<string, unknown>();
let sessionCount = 0;
const sessions = new Map<string, string>();

function emptySteps(): StepTimes {
  return {
    ticket: null,
    signalOpen: null,
    ready: null,
    channels: null,
    auth: null,
    connect: null,
    compatibility: null,
    firstRead: null,
  };
}

function openPage(hostId: string, mode: Mode): PhonePage {
  const page = { steps: emptySteps() };
  const mark = (step: keyof StepTimes) => {
    page.steps[step] ??= at();
  };
  // As the bridge and the transport: the hints cross as JSON, and the phone keeps the newest.
  const store =
    mode === "after"
      ? createPeerHintStore((id, hints: PeerHints) => {
          kept.set(id, JSON.parse(JSON.stringify(hints)));
        })
      : null;
  // As the bridge: the native side sends what it kept before the first command.
  const saved = kept.get(hostId);
  const hints = store && saved ? decodePeerHints(saved) : null;
  if (store && hints) store.load(hostId, hints);
  const actions: { current: RemoteTeamPeerActions } = {
    current: {
      getBootstrap: async (id, _key, existing) => {
        await sleep(rt);
        mark("ticket");
        const sessionId = existing ?? sessions.get(id) ?? `session-${++sessionCount}`;
        sessions.set(id, sessionId);
        return { sessionId, signalUrl: SIGNAL_URL, ticket: `ticket|${id}|${sessionId}|${randomId()}` };
      },
      endSession: async () => undefined,
      onConnectionUpdate: async (update) => {
        if (update.state === "offline" && update.message) report(`${hostId} offline: ${update.message}`);
      },
      onTeamEvent: async () => undefined,
      onDiagnostic: async ({ step, detail }) => {
        if (step === "signal-open") mark("signalOpen");
        else if (step === "signal-ready") mark("ready");
        else if (step === "channels-open") mark("channels");
        else if (step === "authenticated") mark("auth");
        else if (step === "failed" || step === "signal-error") report(`${hostId} ${step}: ${detail ?? ""}`);
      },
    },
  };
  const peer = createRemoteTeamPeer(actions, {
    clientProtocol: TEAM_WEB_CLIENT_PROTOCOL,
    ...(store ? { hostProtocols: store } : {}),
  });
  return Object.assign(page, { hostId, peer, actions });
}

let commandCount = 0;
function command<T extends Omit<RemoteTeamCommand, "id">>(value: T): RemoteTeamCommand {
  return { ...value, id: `command-${++commandCount}` } as RemoteTeamCommand;
}

function checked(result: RemoteTeamCommandResult, what: string): RemoteTeamCommandResult {
  if (!result.ok) throw new Error(`${what}: ${result.error ?? "failed"}`);
  return result;
}

/**
 * The phone's connect and load of a server, as `ServerConnection` and `loadServer` run them: the
 * connect, then the compatibility read with the first workspace read beside it.
 */
async function connectAndLoad(page: PhonePage): Promise<void> {
  const host = hosts.get(page.hostId);
  if (!host) throw new Error("Unknown host.");
  checked(
    await page.peer.execute(
      command({ type: "connect", hostId: page.hostId, hostPublicKey: host.identity.publicKeyPem }),
    ),
    "connect",
  );
  page.steps.connect ??= at();
  const request = (path: string) =>
    page.peer
      .execute(command({ type: "request", method: "GET", path, body: {} }))
      .then((result) => checked(result, `GET ${path}`).body);
  const compatibility = readTeamHostCompatibility(
    () => request(TEAM_API_ROUTES.compatibility),
    TEAM_WEB_CLIENT_PROTOCOL,
  );
  const firstRead = request(TEAM_API_ROUTES.agents.all);
  await Promise.all([
    compatibility.then(() => {
      page.steps.compatibility ??= at();
    }),
    firstRead.then(() => {
      page.steps.firstRead ??= at();
    }),
  ]);
}

/** The page ends without a session end, as when iOS ends the web view's process in the background. */
function killPage(page: PhonePage): void {
  page.actions.current = {
    ...page.actions.current,
    endSession: async () => undefined,
    onConnectionUpdate: async () => undefined,
    onDiagnostic: async () => undefined,
  };
  void page.peer.dispose().catch(() => undefined);
}

function holdFramesOfOldPaths(): void {
  for (const connection of signal.connections.values()) connection.held ??= [];
}

async function prepareHosts(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const hostId = `host-${index + 1}-${randomId()}`;
    const identity = await Effect.runPromise(
      createEd25519Identity((size) => crypto.getRandomValues(new Uint8Array(size))),
    );
    hosts.set(hostId, { hostId, identity });
    ids.push(hostId);
  }
  return ids;
}

/** One measured run. Each run is in a new page, so no state of another run is left. */
async function run(options: { scenario: Scenario; mode: Mode; rt: number }): Promise<RunResult> {
  rt = options.rt;
  globalThis.WebSocket = FarWebSocket as unknown as typeof WebSocket;
  globalThis.RTCPeerConnection = FarPeerConnection;
  const { scenario, mode } = options;
  const hostIds = await prepareHosts(scenario === "three-servers-return" ? 3 : 1);
  // The visit before: the phone connected once and kept what the page learned.
  t0 = performance.now();
  let pages = hostIds.map((id) => openPage(id, mode));
  for (const page of pages) page.peer.setActive(true);
  await Promise.all(pages.map(connectAndLoad)).catch((error: unknown) => {
    throw new Error(`The first visit failed: ${String(error)}; ${errors.join("; ")}`);
  });
  errors.length = 0;

  const awayMs = scenario === "cold-start" ? 8 * 3_600_000 : scenario === "return-60s" ? 60_000 : 15 * 60_000;
  for (const page of pages) page.peer.setActive(false);
  clockSkew += awayMs;
  holdFramesOfOldPaths();
  const reload = scenario === "cold-start" || scenario === "return-15m-reload" || scenario === "three-servers-return";
  if (reload) {
    for (const page of pages) killPage(page);
    pages = hostIds.map((id) => openPage(id, mode));
  } else for (const page of pages) page.steps = emptySteps();

  t0 = performance.now();
  const loads: Promise<void>[] = [];
  if (scenario === "three-servers-return" && mode === "before") {
    // The code before this change: the selected server first, the others when it is online or after 3 s.
    const [selected, ...others] = pages;
    if (!selected) throw new Error("No server.");
    selected.peer.setActive(true);
    const first = connectAndLoad(selected);
    loads.push(first);
    await Promise.race([first, sleep(OLD_RETURN_HOLD_MS)]);
    for (const page of others) {
      page.peer.setActive(true);
      loads.push(connectAndLoad(page));
    }
  } else
    for (const page of pages) {
      page.peer.setActive(true);
      loads.push(connectAndLoad(page));
    }
  const settled = await Promise.allSettled(loads);
  for (const result of settled) if (result.status === "rejected") report(String(result.reason));
  const servers = pages.map((page) => page.steps);
  const result: RunResult = {
    scenario,
    mode,
    servers,
    allServersMs: Math.max(...servers.map((steps) => steps.firstRead ?? Number.NaN)),
    errors: [...errors],
  };
  for (const page of pages) killPage(page);
  globalThis.WebSocket = NativeWebSocket;
  globalThis.RTCPeerConnection = NativePeerConnection;
  return result;
}

declare global {
  interface Window {
    mobileReconnect?: { run: typeof run };
  }
}
window.mobileReconnect = { run };
