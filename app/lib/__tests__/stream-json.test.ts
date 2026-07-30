import { describe, expect, it } from "vitest";
import { extractJsonStringField } from "@/lib/stream-json";

describe("extractJsonStringField", () => {
  it("extracts a complete string value", () => {
    const raw = '{"title":"Neon","slang":"float4 main() {}"}';
    expect(extractJsonStringField(raw, "slang")).toBe("float4 main() {}");
  });

  it("returns the partial value while the string is still streaming", () => {
    const raw = '{"title":"Neon","slang":"float4 mai';
    expect(extractJsonStringField(raw, "slang")).toBe("float4 mai");
  });

  it("decodes escaped newlines, quotes and backslashes", () => {
    const raw = '{"slang":"line1\\nsay \\"hi\\"\\n\\\\done"}';
    expect(extractJsonStringField(raw, "slang")).toBe('line1\nsay "hi"\n\\done');
  });

  it("decodes \\uXXXX escapes", () => {
    const raw = '{"slang":"A\\u0042C"}';
    expect(extractJsonStringField(raw, "slang")).toBe("ABC");
  });

  it("waits for a split escape at the chunk boundary", () => {
    // Trailing lone backslash: the escape's second char hasn't arrived yet.
    expect(extractJsonStringField('{"slang":"ab\\', "slang")).toBe("ab");
    // Truncated \u escape.
    expect(extractJsonStringField('{"slang":"ab\\u00', "slang")).toBe("ab");
  });

  it("returns null when the field is not present yet", () => {
    expect(extractJsonStringField('{"title":"Neon"', "slang")).toBeNull();
    expect(extractJsonStringField("", "slang")).toBeNull();
  });

  it("does not match the field name appearing inside another value", () => {
    // "slang" appears inside the description value but not as a key yet.
    const raw = '{"description":"a slang shader","slang":"CODE"}';
    expect(extractJsonStringField(raw, "slang")).toBe("CODE");
  });

  it("tolerates whitespace between key and value", () => {
    const raw = '{"slang"  :   "CODE"}';
    expect(extractJsonStringField(raw, "slang")).toBe("CODE");
  });
});
