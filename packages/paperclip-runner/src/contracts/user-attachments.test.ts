import { describe, expect, it } from "vitest";
import { acpxAttachmentInput, parseNativeUserAttachments, MAX_NATIVE_ATTACHMENT_BYTES } from "./user-attachments.js";
describe("authorized native attachment contract", () => {
  const text = { schema: "paperclip.user_attachment.v1", kind: "text", mediaType: "text/markdown", name: "notes.md", text: "Inspect this document" };
  it("keeps ordinary message calls backward compatible", () => {
    expect(acpxAttachmentInput("Hello", undefined)).toEqual({ text: "Hello" });
    expect(acpxAttachmentInput("Read", [text]).text).toContain(text.text);
  });
  it.each([
    { ...text, url: "https://example.com/private" },
    { ...text, path: "/private/file" }, { ...text, mediaType: "application/pdf" },
    { ...text, text: "a".repeat(MAX_NATIVE_ATTACHMENT_BYTES + 1) },
    { ...text, kind: "image", data: "%%%", mediaType: "image/png", text: undefined },
  ])("rejects unsupported resources and oversized content before provider dispatch", attachment => {
    expect(() => parseNativeUserAttachments([attachment])).toThrow();
  });
  it("returns independent content and applies a total bound", () => {
    expect(parseNativeUserAttachments([text])[0]).not.toBe(text);
    expect(() => parseNativeUserAttachments(Array(5).fill({ ...text, text: "a".repeat(MAX_NATIVE_ATTACHMENT_BYTES) }))).toThrow();
  });
});
