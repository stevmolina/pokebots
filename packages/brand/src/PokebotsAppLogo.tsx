/*
 * The Pokebots mark, which a Pokebots build shows in place of the OpenBot mark. `AppLogo` calls it
 * when `POKEBOTS_LANDING_ARTWORK` is on, so the daily upstream merge touches only
 * the two lines that call it there.
 */

/** The app icon of `build/custom`, cut to its rounded square. */
const POKEBOTS_APP_LOGO_URL = new URL("./assets/pokebots/app-logo.webp", import.meta.url).href;

export function PokebotsAppLogo(props: { class: string }) {
  return <img class={props.class} src={POKEBOTS_APP_LOGO_URL} alt="" draggable={false} />;
}
