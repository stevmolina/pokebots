import { Redirect } from "expo-router";
import { SignInScreen } from "@/features/auth/screens/sign-in-screen";
import { useDesignPreview } from "@/features/design-preview/model/preview-switch";

export default function SignInRoute() {
  // With the design preview switch on, a signed-out start opens the preview instead of sign-in.
  const preview = useDesignPreview((state) => state.on);
  return preview ? <Redirect href="/design-preview" /> : <SignInScreen />;
}
