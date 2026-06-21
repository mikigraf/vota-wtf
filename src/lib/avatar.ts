const GENERATED_AVATAR_MARKER = "data-vota-avatar";

const palettes: Array<[string, string, string]> = [
  ["#FF5A1F", "#FAFAF8", "#0B0B0C"],
  ["#0B0B0C", "#FAFAF8", "#0B0B0C"],
  ["#18C97B", "#FAFAF8", "#0B0B0C"],
  ["#F0C000", "#FAFAF8", "#0B0B0C"]
];

export function isGeneratedAvatarUrl(value: string | undefined) {
  return Boolean(value?.startsWith("data:image/svg+xml;utf8,") && value.includes(GENERATED_AVATAR_MARKER));
}

export function generatedAvatarDataUrl(nickname: string, _roleInput: string) {
  const normalized = avatarNickname(nickname);
  const hash = hashText(normalized);
  const [primary, secondary, ink] = palettes[hash % palettes.length];
  const initials = initialsFor(normalized);
  const accent = hash % 2 === 0 ? secondary : primary;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${GENERATED_AVATAR_MARKER}="1" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs><rect width="512" height="512" rx="72" fill="url(#g)"/><circle cx="${128 + (hash % 48)}" cy="${120 + (hash % 42)}" r="${80 + (hash % 34)}" fill="${accent}" opacity=".26"/><circle cx="${352 - (hash % 54)}" cy="${376 - (hash % 46)}" r="${94 + (hash % 28)}" fill="#fff" opacity=".22"/><text x="256" y="308" text-anchor="middle" font-family="Archivo, Arial, Helvetica, sans-serif" font-size="176" font-weight="900" fill="${ink}">${escapeXml(initials)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function avatarNickname(input: string) {
  return input.replace(/[^\w .-]/g, "").trim().slice(0, 24) || "oracle";
}

function initialsFor(nickname: string) {
  const parts = nickname.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : nickname.slice(0, 2);
  return letters.toUpperCase();
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => {
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "&") return "&amp;";
    if (char === "'") return "&apos;";
    return "&quot;";
  });
}
