/**
 * Minimal indentation-based YAML parser for `kubectl create/apply -f` manifest
 * paste (Phase 6). Supports maps, lists (of scalars or maps), scalars and
 * multi-document input separated by `---`. Not a full YAML implementation.
 */

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [k: string]: YamlValue };

interface RawLine {
  indent: number;
  text: string;
}

function coerce(raw: string): YamlValue {
  const v = raw.trim();
  if (v === "" || v === "~" || v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function tokenize(doc: string): RawLine[] {
  return doc
    .split("\n")
    .map((line) => line.replace(/\t/g, "  "))
    .filter((line) => {
      const t = line.trim();
      return t !== "" && !t.startsWith("#");
    })
    .map((line) => ({
      indent: line.length - line.trimStart().length,
      text: line.trim(),
    }));
}

function parseBlock(lines: RawLine[], start: number, indent: number): [YamlValue, number] {
  // List block.
  if (lines[start]?.text.startsWith("- ")) {
    const arr: YamlValue[] = [];
    let i = start;
    while (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith("- ")) {
      const inline = lines[i].text.slice(2).trim();
      if (inline.includes(":") && !inline.startsWith('"')) {
        // A map item; reparse the "- key: value" as a nested map.
        const synthetic: RawLine[] = [
          { indent: indent + 2, text: inline },
          ...lines.slice(i + 1),
        ];
        const [value, consumed] = parseBlock(synthetic, 0, indent + 2);
        arr.push(value);
        i += consumed; // consumed counts the synthetic first line as one
      } else {
        arr.push(coerce(inline));
        i += 1;
      }
    }
    return [arr, i - start];
  }

  // Map block.
  const map: { [k: string]: YamlValue } = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i].text;
    const colon = line.indexOf(":");
    if (colon === -1) break;
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (rest !== "") {
      map[key] = coerce(rest);
      i += 1;
    } else {
      // Nested block on following, more-indented lines.
      const childIndent = lines[i + 1]?.indent ?? indent + 2;
      if (childIndent > indent) {
        const [value, consumed] = parseBlock(lines, i + 1, childIndent);
        map[key] = value;
        i += 1 + consumed;
      } else {
        map[key] = null;
        i += 1;
      }
    }
  }
  return [map, i - start];
}

/** Parse one or more YAML documents. */
export function parseYamlDocuments(text: string): YamlValue[] {
  return text
    .split(/^---\s*$/m)
    .map((doc) => doc.trim())
    .filter(Boolean)
    .map((doc) => {
      const lines = tokenize(doc);
      if (lines.length === 0) return {};
      const baseIndent = lines[0].indent;
      return parseBlock(lines, 0, baseIndent)[0];
    });
}
