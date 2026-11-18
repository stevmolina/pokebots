import { POKEBOTS_INTEGRATION_ACCOUNTS_URL } from "@openbot/contracts/team-protocol/pokebots-integrations-v1";
import { Button } from "heroui-native";
import { Linking, View } from "react-native";
import { useText } from "@/shared/lib/text";

export function IntegrationProfiles({ native, onSelect }: { native: boolean; onSelect: (native: boolean) => void }) {
  const { t } = useText();
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2" accessibilityLabel={t("common.integrationProfile")}>
        <Button
          variant={native ? "ghost" : "secondary"}
          accessibilityState={{ selected: !native }}
          onPress={() => onSelect(false)}
        >
          <Button.Label>{t("common.integrationLinked")}</Button.Label>
        </Button>
        <Button
          variant={native ? "secondary" : "ghost"}
          accessibilityState={{ selected: native }}
          onPress={() => onSelect(true)}
        >
          <Button.Label>{t("common.integrationNative")}</Button.Label>
        </Button>
      </View>
      <Button variant="ghost" onPress={() => void Linking.openURL(POKEBOTS_INTEGRATION_ACCOUNTS_URL)}>
        <Button.Label>{t("common.integrationLink")}</Button.Label>
      </Button>
    </View>
  );
}
