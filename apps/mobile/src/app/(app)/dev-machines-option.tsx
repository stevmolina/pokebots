import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { isMachinesSidebarOption, setMachinesSidebarOption } from "@/features/servers/model/machines-sidebar-option";

/** Development only: switches the machines sidebar option, then goes back to home. */
export default function DevMachinesOption() {
  const { o } = useLocalSearchParams<{ o?: string }>();
  useEffect(() => {
    if (__DEV__ && isMachinesSidebarOption(o)) setMachinesSidebarOption(o);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [o]);
  return null;
}
