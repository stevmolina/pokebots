import { ComposerAddMenu } from "@pokebots/ui/features/conversation/ComposerAddMenu";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

// A browser opens a file picker only in an event of user activation. A mouse press is one; a touch or
// pen press is not, its release is. A picker opened on a touch press does nothing on a phone.
function renderMenu(attachDisabled = false) {
  const onAttach = vi.fn();
  render(() => (
    <ComposerAddMenu open onOpenChange={vi.fn()} disabled={false} attachDisabled={attachDisabled} onAttach={onAttach} />
  ));
  return { onAttach, item: screen.getByRole("menuitem", { name: /files/i }) };
}

describe("ComposerAddMenu Files item", () => {
  it("opens the picker on a mouse press", () => {
    const { onAttach, item } = renderMenu();
    fireEvent.pointerDown(item, { pointerType: "mouse", button: 0 });
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it.each(["touch", "pen"])("opens the picker on the release of a %s, not on its press", (pointerType) => {
    const { onAttach, item } = renderMenu();
    fireEvent.pointerDown(item, { pointerType, button: 0 });
    expect(onAttach).not.toHaveBeenCalled();
    fireEvent.pointerUp(item, { pointerType, button: 0 });
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it("opens the picker from Enter", () => {
    const { onAttach, item } = renderMenu();
    fireEvent.keyDown(item, { key: "Enter" });
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it("does not open the picker while the item is disabled", () => {
    const { onAttach, item } = renderMenu(true);
    fireEvent.pointerUp(item, { pointerType: "touch", button: 0 });
    fireEvent.pointerDown(item, { pointerType: "mouse", button: 0 });
    expect(onAttach).not.toHaveBeenCalled();
  });
});
