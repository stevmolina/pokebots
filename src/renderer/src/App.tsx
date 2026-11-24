import { NotificationObserver, Toaster } from "@pokebots/ui";
import { AppAccessGate } from "./AppView";
import { type AppProps, AppProviders } from "./app-providers";
import { reportNotification } from "./error-reports";
import { ConnectionNoiseToasts } from "./features/updates/connection-noise-toasts";
import { nativeBrowserPageShown } from "./native-browser-page";

export function App(props: AppProps = {}) {
  return (
    <NotificationObserver onShown={reportNotification}>
      <AppProviders
        landingPreview={props.landingPreview}
        peopleEnabled={props.peopleEnabled}
        chatWindow={props.chatWindow}
      >
        <ConnectionNoiseToasts />
        <AppAccessGate />
      </AppProviders>
      <Toaster hidden={nativeBrowserPageShown()} onToastShown={reportNotification} />
    </NotificationObserver>
  );
}
