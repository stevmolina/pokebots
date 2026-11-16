import net from "node:net";
import tls from "node:tls";

/** The SMTP adapter owns cancellation and deadlines. TLS always verifies the mail host. */
function socketPair(socket: net.Socket, hostname: string, secure: boolean) {
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  const opened = new Promise<void>((resolve, reject) => {
    socket.once(secure ? "secureConnect" : "connect", () => resolve());
    socket.once("error", reject);
  });
  let ended = false;
  const onData = (chunk: Buffer) => controller?.enqueue(new Uint8Array(chunk));
  const onEnd = () => {
    if (!ended) {
      ended = true;
      controller?.close();
    }
  };
  const onError = () => {
    if (!ended) {
      ended = true;
      controller?.error(new Error("SMTP socket failed."));
    }
  };
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const readable = new ReadableStream<Uint8Array>({
    start(active) {
      controller = active;
      socket.on("data", onData);
      socket.once("end", onEnd);
      socket.once("error", onError);
    },
    cancel() {
      socket.destroy();
    },
  });
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) =>
        socket.write(chunk, (error) => (error ? reject(new Error("SMTP socket write failed.")) : resolve())),
      );
    },
    close() {
      socket.end();
    },
    abort() {
      socket.destroy();
    },
  });
  return {
    readable,
    writable,
    opened,
    closed,
    async close() {
      socket.destroy();
      await closed;
    },
    startTls() {
      if (secure) throw new Error("TLS already started.");
      socket.pause();
      socket.off("data", onData);
      socket.off("end", onEnd);
      socket.off("error", onError);
      onEnd();
      return socketPair(tls.connect({ socket, servername: hostname }), hostname, true);
    },
  };
}

export function connect(
  address: { hostname: string; port: number },
  options?: { secureTransport?: "on" | "off" | "starttls" },
) {
  const secure = options?.secureTransport === "on";
  const socket = secure
    ? tls.connect({ host: address.hostname, port: address.port, servername: address.hostname })
    : net.connect({ host: address.hostname, port: address.port });
  return socketPair(socket, address.hostname, secure);
}
