import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@pokebots/ui";
import type { JSX } from "@solidjs/web";
import { useText } from "../../text";
import {
  SIDEBAR_AUTO_SETTLE_LABEL,
  SIDEBAR_AUTO_SETTLE_OPTIONS,
  type SidebarAutoSettleOption,
} from "../sidebar/sidebar-settling";

const options = [...SIDEBAR_AUTO_SETTLE_OPTIONS];

export interface SidebarAutoSettleSelectProps {
  value: SidebarAutoSettleOption;
  onChange: (value: SidebarAutoSettleOption) => void;
  /** The dialog element the popover portals into, as the other Settings selects receive it. */
  mount?: HTMLElement | undefined;
}

/**
 * The "Auto-settle inactive bots" control in General Settings.
 */
export function SidebarAutoSettleSelect(props: SidebarAutoSettleSelectProps): JSX.Element {
  const { t } = useText();
  return (
    <Select<SidebarAutoSettleOption>
      class="settings-modal-select"
      options={options}
      value={props.value}
      onChange={(choice) => choice && props.onChange(choice)}
      placement="bottom-end"
      itemComponent={(itemProps) => (
        <SelectItem item={itemProps.item}>{t(SIDEBAR_AUTO_SETTLE_LABEL[itemProps.item.rawValue])}</SelectItem>
      )}
    >
      <SelectTrigger size="sm" aria-label={t("settings.autoSettle.title")}>
        <SelectValue<SidebarAutoSettleOption>>
          {(state) => t(SIDEBAR_AUTO_SETTLE_LABEL[state.selectedOption()])}
        </SelectValue>
      </SelectTrigger>
      <SelectContent mount={props.mount} />
    </Select>
  );
}
