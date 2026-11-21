import { AppLogo, type MobilePlatformLogoVariant, PlatformLogo } from "@pokebots/brand";
import type { AppVariant } from "@pokebots/contracts/ipc";
import type { AppTextKey } from "@pokebots/i18n";
import { Button } from "@pokebots/ui";
import { ANDROID_PLAY_STORE_URL } from "@pokebots/ui/features/mobile-app/android-play-store";
import { IOS_APP_STORE_URL } from "@pokebots/ui/features/mobile-app/ios-app-store";
import { useText } from "@pokebots/ui/text";
import { For } from "solid-js";

const PRODUCT_NAME = "OpenBot";
const STORAGE_KEY = "openbot.web.phoneBrowser";
interface StoreLink {
  platform: MobilePlatformLogoVariant;
  label: AppTextKey;
  href: string;
}

const STORES: Record<MobilePlatformLogoVariant, StoreLink> = {
  ios: { platform: "ios", label: "webClient.phoneApp.ios", href: IOS_APP_STORE_URL },
  android: { platform: "android", label: "webClient.phoneApp.android", href: ANDROID_PLAY_STORE_URL },
};

function rememberBrowserChoice(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Without storage, the screen shows again on the next visit.
  }
}

/** The store of this phone first. An iPad in desktop mode reports a Mac and has no coarse narrow screen. */
function storeOrder(): StoreLink[] {
  return /android/i.test(navigator.userAgent) ? [STORES.android, STORES.ios] : [STORES.ios, STORES.android];
}

/**
 * The first screen of the web client on a phone. The phone app is the client for phones, so this
 * screen sends the user to its store page. "Continue in browser" opens the web client, and this
 * browser keeps that choice.
 */
export function WebPhoneAppScreen(props: { variant: AppVariant; onContinue: () => void }) {
  const { t } = useText();
  return (
    <main class="account-login-screen">
      <div class="account-login-shell">
        <header class="account-login-brand-lockup">
          <AppLogo variant={props.variant} animation="blink" interactive class="account-login-logo" />
          <span class="account-login-wordmark">{PRODUCT_NAME}</span>
        </header>
        <section class="account-login" aria-labelledby="web-phone-app-title">
          <h1 id="web-phone-app-title" class="account-login-title">
            {t("webClient.phoneApp.title")}
          </h1>
          <p class="account-login-description">{t("webClient.phoneApp.description")}</p>
          <div class="web-phone-app-stores">
            <For each={storeOrder()}>
              {(store, index) => (
                <Button
                  as="a"
                  variant={index() === 0 ? "default" : "outline"}
                  class={index() === 0 ? "account-login-primary" : "web-phone-app-store"}
                  href={store.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PlatformLogo platform={store.platform} class="web-phone-app-store-logo" />
                  {t(store.label)}
                </Button>
              )}
            </For>
          </div>
          <Button
            type="button"
            variant="link"
            class="web-phone-app-continue"
            onClick={() => {
              rememberBrowserChoice();
              props.onContinue();
            }}
          >
            {t("webClient.phoneApp.continue")}
          </Button>
        </section>
      </div>
    </main>
  );
}
