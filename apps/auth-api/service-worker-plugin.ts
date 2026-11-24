import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const TEMPLATE = new URL("./service-worker/app-sw.js", import.meta.url);
/** The file name at the site root. A script at the root may take the scope `/app`. */
export const WEB_SERVICE_WORKER_FILE = "app-sw.js";
const APP_NAME = "Pokebots";

/**
 * Emits `app-sw.js`, the service worker of the web client, into the client build. Its build id is a
 * hash of the names of the files in the build. Vite puts a content hash in each name, so the bytes of
 * the worker change when, and only when, the web client changes, and a browser that checks the file
 * sees a new version. The worker also gets the list of the build's `/assets/` files, so that it keeps
 * those files in its cache across deploys and removes the others.
 *
 * `vite dev` serves the same file at the same address with the build id `dev`. The worker keeps no
 * `/assets/` file there, because the dev server has none, and it answers `/app` from the network, so it
 * hides no edit. It is there so that push and the update prompt can be tried while developing.
 */
export function webServiceWorker(): Plugin {
  const appName = APP_NAME;
  const workerSource = (template: string, buildId: string, assetPaths: readonly string[]) =>
    // Function replacers, so that a `$` in a value is not read as a replacement pattern.
    template
      .replace("__OPENBOT_BUILD_ID__", () => buildId)
      .replace("__OPENBOT_APP_NAME__", () => appName)
      .replace('["__OPENBOT_ASSET_PATHS__"]', () => JSON.stringify(assetPaths));
  return {
    name: "openbot-web-service-worker",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? "").split("?")[0] !== `/${WEB_SERVICE_WORKER_FILE}`) {
          next();
          return;
        }
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache");
        response.end(workerSource(readFileSync(TEMPLATE, "utf8"), "dev", []));
      });
    },
    generateBundle(_options, bundle) {
      // The Worker build gets no copy: only the client build is served as files.
      if (this.environment.name !== "client") return;
      const template = readFileSync(TEMPLATE, "utf8");
      const names = Object.keys(bundle).sort();
      const hash = createHash("sha256").update(template).update(appName);
      for (const name of names) hash.update(name).update("\n");
      // The worker compares them with `URL.pathname`, which is percent-encoded.
      const assetPaths = names.filter((name) => name.startsWith("assets/")).map((name) => encodeURI(`/${name}`));
      const source = workerSource(template, hash.digest("hex").slice(0, 16), assetPaths);
      this.emitFile({ type: "asset", fileName: WEB_SERVICE_WORKER_FILE, source });
    },
  };
}
