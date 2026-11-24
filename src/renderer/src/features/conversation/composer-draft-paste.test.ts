import { describe, expect, it } from "vitest";
import { insertAtSelection } from "./composer-draft";

const IMAGE = "[image.png]";

describe("insertAtSelection for a paste that imports while the person types", () => {
  it("puts the file at the selection and the caret after it when the draft did not change", () => {
    expect(insertAtSelection("see ", IMAGE, { before: "see ", selection: { start: 4, end: 4 } })).toEqual({
      value: `see ${IMAGE}`,
      caret: 4 + IMAGE.length,
    });
  });

  it("replaces the selected text when the draft did not change", () => {
    expect(insertAtSelection("a bc d", IMAGE, { before: "a bc d", selection: { start: 2, end: 4 } })).toEqual({
      value: `a ${IMAGE} d`,
      caret: 2 + IMAGE.length,
    });
  });

  it("keeps the file where it was pasted when the person types after it, and leaves their caret", () => {
    // Pasted at the end of "look ", then typed "at this" while the image uploaded.
    expect(insertAtSelection("look at this", IMAGE, { before: "look ", selection: { start: 5, end: 5 } })).toEqual({
      value: `look ${IMAGE}at this`,
    });
  });

  it("shifts the place of the file when the person edits the text before it", () => {
    expect(insertAtSelection("well, a b", IMAGE, { before: "a b", selection: { start: 2, end: 2 } })).toEqual({
      value: `well, a ${IMAGE}b`,
    });
  });

  it("puts the file at the end when an edit crossed the place of the paste", () => {
    expect(insertAtSelection("xyz", IMAGE, { before: "abc", selection: { start: 1, end: 1 } })).toEqual({
      value: `xyz ${IMAGE}`,
    });
  });

  it("puts the file at the end with the caret there when no selection is known", () => {
    expect(insertAtSelection("hi", IMAGE, undefined)).toEqual({ value: `hi ${IMAGE}`, caret: 3 + IMAGE.length });
  });
});
