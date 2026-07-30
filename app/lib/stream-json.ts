/**
 * Incremental extraction of a single string field from a JSON document that is
 * still being streamed (and may therefore be truncated mid-value).
 *
 * The AI shader route streams raw Groq tokens (a JSON object) over SSE. To show
 * the Slang code being written live, the client needs the current value of the
 * `slang` field even before the surrounding JSON has finished arriving. A full
 * `JSON.parse` can't do that — it throws on incomplete input — so this scans for
 * the field and decodes its string body up to whatever has arrived so far.
 */

/**
 * Returns the decoded value of `"<field>": "..."` from a (possibly partial) JSON
 * string. If the value's closing quote hasn't arrived yet, returns everything
 * decoded so far. Returns `null` when the field/opening quote isn't present yet.
 */
export function extractJsonStringField(raw: string, field: string): string | null {
  // Locate the `"field"` key. Match the key as a JSON token so we don't trip on
  // the same word appearing inside another string value.
  const keyPattern = new RegExp(`"${escapeRegExp(field)}"\\s*:\\s*"`);
  const keyMatch = keyPattern.exec(raw);
  if (!keyMatch) return null;

  // Start of the string body (just past the opening quote).
  let i = keyMatch.index + keyMatch[0].length;
  let out = "";

  while (i < raw.length) {
    const ch = raw[i];

    if (ch === '"') {
      // Unescaped closing quote — value is complete.
      return out;
    }

    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) {
        // Escape sequence split across chunk boundary — stop before it and
        // wait for more input rather than emitting a stray backslash.
        return out;
      }
      switch (next) {
        case "n":
          out += "\n";
          i += 2;
          continue;
        case "t":
          out += "\t";
          i += 2;
          continue;
        case "r":
          out += "\r";
          i += 2;
          continue;
        case "b":
          out += "\b";
          i += 2;
          continue;
        case "f":
          out += "\f";
          i += 2;
          continue;
        case '"':
          out += '"';
          i += 2;
          continue;
        case "\\":
          out += "\\";
          i += 2;
          continue;
        case "/":
          out += "/";
          i += 2;
          continue;
        case "u": {
          const hex = raw.slice(i + 2, i + 6);
          if (hex.length < 4) {
            // Incomplete \uXXXX at the tail — wait for the rest.
            return out;
          }
          const code = Number.parseInt(hex, 16);
          if (Number.isNaN(code)) {
            // Malformed escape — surface the raw text rather than crashing.
            out += "\\u";
            i += 2;
            continue;
          }
          out += String.fromCharCode(code);
          i += 6;
          continue;
        }
        default:
          // Unknown escape — keep the escaped char verbatim.
          out += next;
          i += 2;
          continue;
      }
    }

    out += ch;
    i += 1;
  }

  // Reached end of the available input without a closing quote: the value is
  // still streaming. Return what we have so far.
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
