import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, onSettled, Show } from "solid-js";
import { TransactionalPage } from "../components/transactional/TransactionalPage";
import { Button } from "../components/ui/button";
import { loadPageText } from "../lib/page-text";

export const Route = createFileRoute("/integration-accounts")({
  validateSearch: (search) => ({
    result: search.result === "linked" || search.result === "failed" ? search.result : undefined,
  }),
  loader: ({ context }) =>
    loadPageText(context.locale, (t) => ({
      title: t("status.messaging.integrationsSection"),
      brain: t("mcp.connect.title", { name: t("brain.title") }),
      rooms: t("mcp.connect.title", { name: t("rooms.title") }),
      signIn: t("account.login.workosTitle"),
      signInRequired: t("error.auth.signInRequired"),
      linked: t("provider.status.connected"),
      failed: t("error.auth.serviceError"),
      retry: t("common.tryAgain"),
    })),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.text.title }, { name: "robots", content: "noindex, nofollow" }],
  }),
  headers: () => ({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
  }),
  component: IntegrationAccounts,
});

function IntegrationAccounts() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const [session, setSession] = createSignal<"loading" | "signed-in" | "signed-out" | "failed">("loading");
  const [starting, setStarting] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  async function checkSession() {
    try {
      const response = await fetch("/api/browser/session");
      setSession(response.ok ? "signed-in" : response.status === 401 ? "signed-out" : "failed");
    } catch {
      setSession("failed");
    }
  }

  onSettled(() => {
    void checkSession();
    const refresh = () => {
      if (session() === "signed-out") void checkSession();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  });

  async function start(audience: "brain" | "rooms") {
    if (starting()) return;
    setStarting(true);
    setFailed(false);
    try {
      const response = await fetch("/api/browser/integration-link/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenBot-Browser": "1" },
        body: JSON.stringify({ audience }),
      });
      if (response.status === 401) {
        setSession("signed-out");
        return;
      }
      if (!response.ok) throw new Error("Integration link start failed");
      const body = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("authorizationUrl" in body) ||
        typeof body.authorizationUrl !== "string"
      ) {
        throw new Error("Integration link response is invalid");
      }
      window.location.assign(body.authorizationUrl);
    } catch {
      setFailed(true);
    } finally {
      setStarting(false);
    }
  }

  return (
    <TransactionalPage titleId="integration-title" lang={page().lang}>
      <h1 id="integration-title">{page().text.title}</h1>
      <Show when={session() === "signed-out"}>
        <p>{page().text.signInRequired}</p>
        <a href="/app" target="_blank" rel="noopener noreferrer">
          {page().text.signIn}
        </a>
      </Show>
      <Show when={session() === "failed"}>
        <p role="alert">{page().text.failed}</p>
        <Button as="button" type="button" icon="arrow-right" onClick={() => void checkSession()}>
          {page().text.retry}
        </Button>
      </Show>
      <Show when={session() === "signed-in"}>
        <Show when={search().result === "linked" && !failed()}>
          <p role="status">{page().text.linked}</p>
        </Show>
        <Show when={search().result === "failed" || failed()}>
          <p role="alert">{page().text.failed}</p>
        </Show>
        <div class="join-card-actions join-card-actions-full">
          <Button
            as="button"
            type="button"
            icon="arrow-right"
            disabled={starting()}
            onClick={() => void start("brain")}
          >
            {page().text.brain}
          </Button>
          <Button
            as="button"
            type="button"
            icon="arrow-right"
            disabled={starting()}
            onClick={() => void start("rooms")}
          >
            {page().text.rooms}
          </Button>
        </div>
      </Show>
    </TransactionalPage>
  );
}
