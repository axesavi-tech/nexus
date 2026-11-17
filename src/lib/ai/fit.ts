/**
 * Bring model output within a JSON Schema's hard limits before zod validation.
 *
 * Models routinely overshoot soft limits by a little — a title of 162 characters where 150 are
 * allowed, 31 tasks where 30 are allowed, "High" for the enum value "high". Rejecting a whole plan
 * for that wastes a long, expensive generation. This trims and clamps only; it never invents
 * required content, so genuinely malformed output still fails validation.
 */
type S = Record<string, unknown>;

function resolve(schema: S, root: S): S {
  const ref = schema.$ref;
  if (typeof ref === "string" && ref.startsWith("#/")) {
    let node: unknown = root;
    for (const k of ref.slice(2).split("/")) node = (node as S)?.[k];
    if (node && typeof node === "object") return resolve(node as S, root);
  }
  return schema;
}

export function fitToSchema(value: unknown, schema: S, root: S = schema): unknown {
  const s = resolve(schema, root);
  if (value === null || value === undefined) return value;

  if (Array.isArray(s.anyOf) || Array.isArray(s.oneOf)) {
    const opts = ((s.anyOf ?? s.oneOf) as S[]).map((o) => resolve(o, root));
    const match = opts.find((o) => typeMatches(value, o)) ?? opts[0];
    return match ? fitToSchema(value, match, root) : value;
  }

  if (Array.isArray(s.enum) && typeof value === "string" && !s.enum.includes(value)) {
    const hit = (s.enum as unknown[]).find((e) => typeof e === "string" && e.toLowerCase() === value.trim().toLowerCase());
    return hit ?? value;
  }

  switch (s.type) {
    case "string": {
      const str = typeof value === "number" || typeof value === "boolean" ? String(value) : value;
      if (typeof str === "string" && typeof s.maxLength === "number" && str.length > s.maxLength) {
        return str.slice(0, Math.max(0, s.maxLength - 1)).trimEnd() + "…";
      }
      return str;
    }
    case "number":
    case "integer": {
      const raw = typeof value === "string" && value.trim() !== "" && !isNaN(Number(value)) ? Number(value) : value;
      if (typeof raw !== "number") return value;
      let n: number = raw;
      if (s.type === "integer") n = Math.round(n);
      if (typeof s.minimum === "number") n = Math.max(s.minimum, n);
      if (typeof s.maximum === "number") n = Math.min(s.maximum, n);
      return n;
    }
    case "array": {
      if (!Array.isArray(value)) return value;
      let arr = value;
      if (typeof s.maxItems === "number" && arr.length > s.maxItems) arr = arr.slice(0, s.maxItems);
      const items = s.items as S | undefined;
      return items ? arr.map((v) => fitToSchema(v, items, root)) : arr;
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) return value;
      const props = (s.properties ?? {}) as Record<string, S>;
      const out: S = {};
      for (const [k, v] of Object.entries(value as S)) out[k] = props[k] ? fitToSchema(v, props[k], root) : v;
      return out;
    }
    default:
      return value;
  }
}

function typeMatches(v: unknown, s: S): boolean {
  switch (s.type) {
    case "string": return typeof v === "string";
    case "number": case "integer": return typeof v === "number";
    case "boolean": return typeof v === "boolean";
    case "array": return Array.isArray(v);
    case "object": return typeof v === "object" && v !== null && !Array.isArray(v);
    case "null": return v === null;
    default: return true;
  }
}
