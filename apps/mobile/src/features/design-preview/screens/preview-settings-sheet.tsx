import { useRouter } from "expo-router";
import { Typography } from "heroui-native";
import Check from "lucide-react-native/icons/check";
import Server from "lucide-react-native/icons/server";
import X from "lucide-react-native/icons/x";
import { useState } from "react";
import { Image, View } from "react-native";
import { RoutineActiveSwitch } from "@/features/agents/components/routine-active-switch";
import { AppLogo } from "@/features/auth/components/app-logo";
import { ProfileAvatar } from "@/shared/components/profile-avatar";
import { SheetScrollView } from "@/shared/components/sheet-scroll-view";
import { APP_BRAND, POKEBOTS_MARK } from "@/shared/lib/app-brand";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { PreviewCaption, PreviewGap, PreviewGroup, PreviewRow } from "../components/preview-page";
import { PreviewCircleButton, usePreviewColors } from "../components/preview-parts";
import { PREVIEW_ACCOUNT, PREVIEW_APP_VERSION, PREVIEW_SERVERS } from "../model/preview-data";
import { setDesignPreview } from "../model/preview-switch";
import {
  previewBatch4 as b4,
  previewProfile as profile,
  previewSize as size,
  previewType as type,
} from "../model/preview-tokens";

/** The product name, as the About page shows it: the brand of a Pokebots build, OpenBot otherwise. */
const PRODUCT_NAME = APP_BRAND === "pokebots" ? "Pokebots" : "OpenBot";

/**
 * The Settings sheet of the preview, opened by the profile circle: the reference's calm grouped list,
 * with the Pokebots parts on top (servers, usage, plan, vault). Made-up values; the rows change
 * nothing, except New design, which leaves the preview when turned off.
 */
export function PreviewSettingsSheet() {
  const { t } = useText();
  const router = useRouter();
  const colors = usePreviewColors();
  const [notify, setNotify] = useState(true);
  const [autoTimeZone, setAutoTimeZone] = useState(true);
  const tap = () => undefined;
  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void) => (
    // The switch ends 4 pt further in than a chevron, as on the profile.
    <View style={{ marginRight: 4 }}>
      <RoutineActiveSwitch label={label} value={value} disabled={false} onValueChange={onChange} />
    </View>
  );
  return (
    // The sheet's own scroll view, as every sheet of the app; the close circle is its sticky header.
    <SheetScrollView
      className="bg-transparent"
      scrollEdgeEffect={false}
      header={
        <View style={{ paddingTop: b4.closeTop, paddingLeft: size.headerInset, alignItems: "flex-start" }}>
          <PreviewCircleButton
            label={t("mobile.workspace.preview.close")}
            onPress={() => {
              void haptics.selection();
              router.back();
            }}
          >
            <X size={22} color={colors.icon} strokeWidth={1.8} />
          </PreviewCircleButton>
        </View>
      }
    >
      <View style={{ paddingTop: b4.settingsTop - b4.closeTop - size.headerButton, paddingBottom: 48 }}>
        <PreviewGroup>
          <PreviewRow
            label={PREVIEW_ACCOUNT.name}
            detail={PREVIEW_ACCOUNT.email}
            icon={<ProfileAvatar name={PREVIEW_ACCOUNT.name} neutral size={b4.accountAvatar} />}
            height={b4.accountRowHeight}
            onPress={tap}
          />
          <PreviewRow label={t("mobile.workspace.preview.usage")} value={`${PREVIEW_ACCOUNT.usage}%`} onPress={tap} />
          <PreviewRow label={t("mobile.workspace.preview.plan")} value={PREVIEW_ACCOUNT.plan} onPress={tap} />
          <PreviewRow
            label={t("mobile.workspace.preview.vault")}
            detail={t("mobile.workspace.preview.vaultHelp")}
            onPress={tap}
          />
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        {/* Pokebots only: the servers of this account, the current one checked. */}
        <PreviewCaption>{t("mobile.workspace.preview.servers")}</PreviewCaption>
        <PreviewGroup>
          {PREVIEW_SERVERS.map((server) => (
            <PreviewRow
              key={server.id}
              icon={<Server size={20} color={colors.icon} strokeWidth={1.7} />}
              label={server.name}
              detail={server.detail}
              chevron={false}
              trailing={server.current ? <Check size={20} color={colors.accent} strokeWidth={2.2} /> : undefined}
              onPress={tap}
            />
          ))}
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        <PreviewGroup>
          <PreviewRow
            label={t("mobile.workspace.preview.update")}
            detail={t("mobile.workspace.preview.updateDetail", {
              from: PREVIEW_APP_VERSION.from,
              to: PREVIEW_APP_VERSION.to,
            })}
            icon={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />}
            link
            onPress={tap}
          />
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        <PreviewGroup>
          <PreviewRow
            label={t("mobile.workspace.preview.connectApps")}
            detail={t("mobile.workspace.preview.connectAppsHelp")}
            onPress={() => router.replace("/design-preview/grid")}
          />
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        <PreviewCaption>{t("mobile.workspace.preview.agentsGroup")}</PreviewCaption>
        <PreviewGroup>
          <PreviewRow
            label={t("mobile.workspace.preview.permissions")}
            detail={t("mobile.workspace.preview.permissionsHelp")}
            onPress={tap}
          />
          <PreviewRow
            label={t("mobile.workspace.preview.autoTimeZone")}
            detail={t("mobile.workspace.preview.autoTimeZoneHelp")}
            trailing={toggle(t("mobile.workspace.preview.autoTimeZone"), autoTimeZone, setAutoTimeZone)}
          />
          <PreviewRow label={t("mobile.workspace.preview.timeZone")} value="America/Argentina/Salta" />
          <PreviewRow label={t("mobile.workspace.preview.cloudComputers")} onPress={tap} />
          <PreviewRow label={t("mobile.workspace.preview.devices")} onPress={tap} />
          <PreviewRow label={t("mobile.workspace.preview.importMemory")} onPress={tap} />
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        <PreviewCaption>{t("mobile.workspace.preview.appGroup")}</PreviewCaption>
        <PreviewGroup>
          <PreviewRow
            label={t("mobile.workspace.preview.notifications")}
            height={profile.toggleRowHeight}
            trailing={toggle(t("mobile.workspace.preview.notifications"), notify, setNotify)}
          />
          <PreviewRow
            label={t("mobile.workspace.preview.appearance")}
            value={t("mobile.workspace.preview.followSystem")}
            onPress={tap}
          />
          <PreviewRow
            label={t("mobile.workspace.preview.newDesign")}
            height={profile.toggleRowHeight}
            trailing={toggle(t("mobile.workspace.preview.newDesign"), true, (on) => {
              if (on) return;
              // Off leaves the preview, as the old profile menu did.
              setDesignPreview(false);
              // Close the sheet first, so it can't stay over the app's own start screen.
              router.dismissAll();
              router.replace("/");
            })}
          />
          <PreviewRow
            label={t("mobile.workspace.preview.language")}
            value={t("mobile.workspace.preview.system")}
            onPress={tap}
          />
          <PreviewRow
            label={t("mobile.workspace.preview.haptics")}
            value={t("mobile.workspace.preview.on")}
            onPress={tap}
          />
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        <PreviewGroup>
          <PreviewRow label={t("mobile.workspace.preview.helpCenter")} link onPress={tap} />
          <PreviewRow label={t("mobile.workspace.preview.privacy")} link onPress={tap} />
          <PreviewRow label={t("mobile.workspace.preview.terms")} link onPress={tap} />
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        <PreviewGroup>
          <PreviewRow label={t("mobile.workspace.preview.feedback")} onPress={tap} />
        </PreviewGroup>
        <PreviewGap size={b4.groupGap} />
        <PreviewGroup>
          <PreviewRow
            label={t("mobile.workspace.preview.signOut")}
            labelColor={colors.danger}
            chevron={false}
            onPress={tap}
          />
        </PreviewGroup>
        <View style={{ alignItems: "center", marginTop: b4.footerTop }}>
          {APP_BRAND === "pokebots" ? (
            <Image
              source={POKEBOTS_MARK}
              style={{ width: b4.footerLogo, height: b4.footerLogo, borderRadius: b4.footerLogo * 0.24 }}
            />
          ) : (
            <AppLogo size={b4.footerLogo} />
          )}
          <Typography style={[type.pageTitle, { color: colors.title, marginTop: 12 }]}>{PRODUCT_NAME}</Typography>
          <Typography style={[type.rowDetail, { color: colors.rowValue, marginTop: 2 }]}>
            {PREVIEW_APP_VERSION.build}
          </Typography>
        </View>
      </View>
    </SheetScrollView>
  );
}
