import { isBoolean, isDynamicRecord, isNumber, isString } from "@pokebots/contracts/runtime-values";
import type { RemoteHostProtocols } from "@pokebots/team-client/remote-peer";

/** An ICE server as `RTCIceServer` has it. A type literal, so the hints cross the web view bridge as JSON. */
type PeerHintIceServer = { urls: string | string[]; username?: string; credential?: string };

/** `RemoteSignalRoute` of the peer: the Signal URL and ICE servers of the last `ready`, and when they came. */
type PeerHintSignalRoute = { signalUrl: string; iceServers: PeerHintIceServer[]; at: number };

/**
 * What a new peer page needs to know about a server from its last connection, so that it does not
 * wait for these answers again. Connection data only: no chat, no file, no account data. The TURN
 * credentials in `signalRoute` expire after one hour, and the peer uses them for 30 minutes only.
 */
export type PeerHints = {
  /** The highest protocol that the phone and the host both speak, from the last compatibility read. */
  protocol: number | null;
  /** The host advertised compact-rpc-v1: the first requests go with `auth-complete`. */
  compactRpc: boolean | null;
  /** The route of the last `ready`: the Signal socket opens while the ticket request runs. */
  signalRoute: PeerHintSignalRoute | null;
};

/** The phone keeps the hints of each server. Read before the peer page connects, written after it learns more. */
export interface PeerHintCache {
  read(serverId: string): Promise<PeerHints | null>;
  write(serverId: string, hints: PeerHints): void;
}

function isIceServer(value: unknown): value is PeerHintIceServer {
  return (
    isDynamicRecord(value) &&
    (isString(value.urls) || (Array.isArray(value.urls) && value.urls.every(isString))) &&
    (value.username === undefined || isString(value.username)) &&
    (value.credential === undefined || isString(value.credential))
  );
}

function decodeSignalRoute(value: unknown): PeerHintSignalRoute | null {
  if (!isDynamicRecord(value) || !isString(value.signalUrl) || !isNumber(value.at) || !Array.isArray(value.iceServers))
    return null;
  try {
    const { protocol } = new URL(value.signalUrl);
    if (protocol !== "wss:" && protocol !== "ws:") return null;
  } catch {
    return null;
  }
  if (!value.iceServers.every(isIceServer)) return null;
  // Only the known fields, so that nothing else crosses into the page.
  const iceServers = value.iceServers.map(({ urls, username, credential }) => ({
    urls,
    ...(username === undefined ? {} : { username }),
    ...(credential === undefined ? {} : { credential }),
  }));
  return { signalUrl: value.signalUrl, iceServers, at: value.at };
}

/** Null for a value that is not hints. A bad field drops only that field: the peer then asks the host again. */
export function decodePeerHints(value: unknown): PeerHints | null {
  if (!isDynamicRecord(value)) return null;
  const { protocol, compactRpc } = value;
  return {
    protocol: isNumber(protocol) && Number.isSafeInteger(protocol) && protocol > 0 ? protocol : null,
    compactRpc: isBoolean(compactRpc) ? compactRpc : null,
    signalRoute: decodeSignalRoute(value.signalRoute),
  };
}

const EMPTY: PeerHints = { protocol: null, compactRpc: null, signalRoute: null };

/**
 * The `hostProtocols` store of a peer page. `load` gives it what the phone kept, before the first
 * connect. Each change goes to `save` once, after the changes of the same task, such as the protocol
 * and compact-rpc-v1 of one compatibility read.
 */
export function createPeerHintStore(
  save: (hostId: string, hints: PeerHints) => void,
): RemoteHostProtocols & { load(hostId: string, hints: PeerHints): void } {
  const hints = new Map<string, PeerHints>();
  const unsaved = new Set<string>();
  const change = (hostId: string, next: Partial<PeerHints>) => {
    const current = hints.get(hostId) ?? EMPTY;
    const updated = { ...current, ...next };
    if (
      updated.protocol === current.protocol &&
      updated.compactRpc === current.compactRpc &&
      updated.signalRoute === current.signalRoute
    )
      return;
    hints.set(hostId, updated);
    if (unsaved.has(hostId)) return;
    unsaved.add(hostId);
    queueMicrotask(() => {
      unsaved.delete(hostId);
      const value = hints.get(hostId);
      if (value) save(hostId, value);
    });
  };
  return {
    load: (hostId, value) => {
      // A change of this page is newer than what the phone kept.
      if (!hints.has(hostId)) hints.set(hostId, value);
    },
    get: (hostId) => hints.get(hostId)?.protocol ?? undefined,
    set: (hostId, protocol) => change(hostId, { protocol }),
    compactRpc: (hostId) => hints.get(hostId)?.compactRpc === true,
    setCompactRpc: (hostId, compactRpc) => change(hostId, { compactRpc }),
    signalRoute: (hostId) => hints.get(hostId)?.signalRoute ?? null,
    // Only the known fields, as `decodeSignalRoute` keeps them.
    setSignalRoute: (hostId, { signalUrl, iceServers, at }) =>
      change(hostId, { signalRoute: decodeSignalRoute({ signalUrl, iceServers, at }) }),
  };
}
