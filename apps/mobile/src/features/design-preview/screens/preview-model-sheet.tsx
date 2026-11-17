import { Typography } from "heroui-native";
import Check from "lucide-react-native/icons/check";
import { View } from "react-native";
import { ProviderMark } from "@/features/servers/components/provider-mark";
import { SettingsRow, SettingsSection } from "@/features/settings/components/settings-content";
import { SheetScrollView } from "@/shared/components/sheet-scroll-view";
import { haptics } from "@/shared/lib/haptics";
import { useText } from "@/shared/lib/text";
import { PreviewChips } from "../components/preview-page";
import { usePreviewColors } from "../components/preview-parts";
import { PREVIEW_MODEL_GROUPS } from "../model/preview-data";
import { type PreviewReasoning, type PreviewSpeed, usePreviewModelChoice } from "../model/preview-model-choice";
import { previewType as type } from "../model/preview-tokens";

/**
 * The model picker of the preview: models by provider with the current one checked, then reasoning
 * and speed. A choice shows at once in the profile and in the ••• sheet; nothing is saved.
 */
export function PreviewModelSheet() {
  const { t } = useText();
  const colors = usePreviewColors();
  const choice = usePreviewModelChoice();
  return (
    <SheetScrollView scrollEdgeEffect={false} contentContainerClassName="gap-5 px-4 pb-safe-offset-5 pt-7">
      {PREVIEW_MODEL_GROUPS.map((group) => (
        <View key={group.provider} style={{ gap: 8 }}>
          {/* The provider's logo before its name, the same logo as the composer button. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16 }}>
            <ProviderMark provider={group.mark} size={14} />
            <Typography style={[type.groupCaption, { color: colors.groupCaption }]}>{group.provider}</Typography>
          </View>
          <SettingsSection>
            {group.models.map((model) => {
              const current = model.id === choice.modelId;
              return (
                <SettingsRow
                  key={model.id}
                  leading={<ProviderMark provider={group.mark} size={22} />}
                  supportingText={model.note}
                  checked={current}
                  disclosure={false}
                  trailing={current ? <Check size={20} color={colors.accent} strokeWidth={2.2} /> : undefined}
                  onPress={() => {
                    void haptics.selection();
                    usePreviewModelChoice.setState({ modelId: model.id });
                  }}
                >
                  <Typography>{model.name}</Typography>
                </SettingsRow>
              );
            })}
          </SettingsSection>
        </View>
      ))}
      <View style={{ gap: 10 }}>
        <Typography style={[type.groupCaption, { color: colors.groupCaption, marginLeft: 16 }]}>
          {t("mobile.workspace.preview.reasoning")}
        </Typography>
        <View style={{ marginHorizontal: -16 }}>
          <PreviewChips
            value={choice.reasoning}
            onChange={(reasoning: PreviewReasoning) => usePreviewModelChoice.setState({ reasoning })}
            options={[
              { id: "low", label: t("mobile.workspace.preview.reasoningLow") },
              { id: "medium", label: t("mobile.workspace.preview.reasoningMedium") },
              { id: "high", label: t("mobile.workspace.preview.reasoningHigh") },
            ]}
          />
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Typography style={[type.groupCaption, { color: colors.groupCaption, marginLeft: 16 }]}>
          {t("mobile.workspace.preview.speed")}
        </Typography>
        <View style={{ marginHorizontal: -16 }}>
          <PreviewChips
            value={choice.speed}
            onChange={(speed: PreviewSpeed) => usePreviewModelChoice.setState({ speed })}
            options={[
              { id: "standard", label: t("mobile.workspace.preview.speedStandard") },
              { id: "fast", label: t("mobile.workspace.preview.speedFast") },
            ]}
          />
        </View>
      </View>
    </SheetScrollView>
  );
}
