import { Image } from "expo-image";
import { View } from "react-native";
import { SERVER_AVATAR_CORNER_RATIO } from "./server-avatar";

const ALL_MACHINES = require("../../../../assets/machines/all-machines.webp");

/** The paper ink of the desktop mark, the same in light and dark. */
const TILE = "#1f1d1a";

/** The mark of All machines: three felt machines together, as a sign for "every server". */
export function AllMachinesMark({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * SERVER_AVATAR_CORNER_RATIO,
        borderCurve: "continuous",
        backgroundColor: TILE,
        overflow: "hidden",
      }}
    >
      <Image source={ALL_MACHINES} contentFit="contain" style={{ width: size, height: size }} />
    </View>
  );
}
