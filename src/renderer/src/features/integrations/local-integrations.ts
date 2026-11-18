import { usePlatform } from "../../platform";
import { useAuth } from "../account/account-context";

export function useLocalIntegrations() {
  const { appInfo } = usePlatform();
  const { centralAuth } = useAuth();
  return () => appInfo()?.pokebotsIntegrations === true && centralAuth().status === "signed_in";
}
