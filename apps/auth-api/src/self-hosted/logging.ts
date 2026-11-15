import { Console } from "node:console";
import { Writable } from "node:stream";
import { createOpenBotLogger, isSecretName, registerSecretValue } from "@openbot/logging";

/** Frameworks also write to console. Send those lines through the same redacting logger. */
export function installSelfHostedLogging(): void {
  for (const [name, value] of Object.entries(process.env)) {
    if (value && isSecretName(name)) registerSecretValue(value);
  }
  const logger = createOpenBotLogger("self-hosted-framework");
  const stream = (write: (line: string) => void) =>
    new Writable({
      write(chunk, _encoding, done) {
        write(String(chunk));
        done();
      },
    });
  Object.assign(
    globalThis.console,
    new Console({
      stdout: stream((line) => logger.info(line.trimEnd())),
      stderr: stream((line) => logger.error(line.trimEnd())),
    }),
  );
}
