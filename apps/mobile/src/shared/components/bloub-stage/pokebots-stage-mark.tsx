import { Image } from "expo-image";
import { View } from "react-native";
import { POKEBOTS_MARK } from "@/shared/lib/app-brand";
import { EYES_HEIGHT, EYES_WIDTH } from "./bloub-eyes";

/** The size of the mascot on the block, as on the native splash, so the hand-over does not jump. */
const MARK_SIZE = 150;

/**
 * The Pokebots mascot in the place of the eyes, in the Pokebots build. It sits in the same frame as
 * the eyes, so it moves, fades and scales with the block as they do.
 */
export function PokebotsStageMark() {
  return (
    <View style={{ width: EYES_WIDTH, height: EYES_HEIGHT, alignItems: "center", justifyContent: "center" }}>
      <Image source={POKEBOTS_MARK} style={{ width: MARK_SIZE, height: MARK_SIZE }} contentFit="contain" />
    </View>
  );
}
