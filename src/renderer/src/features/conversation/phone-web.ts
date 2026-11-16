import { createSignal, onSettled } from "solid-js";

/** The web client phone width. The same query as `PHONE_QUERY` in the web workspace. */
const PHONE_WEB_QUERY = "(max-width: 720px)";

/** True for the web client on a phone. A desktop window, including a narrow one, is not a phone. */
export function isPhoneWeb(): boolean {
  return document.querySelector(".web-app-frame") !== null && window.matchMedia(PHONE_WEB_QUERY).matches;
}

/** `isPhoneWeb` as a signal that follows the window width. */
export function createPhoneWeb() {
  const [phoneWeb, setPhoneWeb] = createSignal(false);
  onSettled(() => {
    if (!document.querySelector(".web-app-frame")) return;
    const query = window.matchMedia(PHONE_WEB_QUERY);
    const update = () => setPhoneWeb(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });
  return phoneWeb;
}
