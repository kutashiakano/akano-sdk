const STRINGS: Record<string, Record<string, string>> = {
  en: {
    cooldown: "Slow down, wait {s}s.",
    error: "Something went wrong, try again later.",
    banned: "You have been banned from using the bot.",
    expired: "Verification expired. Please send a new join request to get a new code.",
    success: "Verification successful.",
    wrongCode: "Wrong code. Attempt: {used}/{max}.",
    noPermission: "Only the owner can use this feature."
  },
  id: {
    cooldown: "Pelan-pelan, tunggu {s} dtk.",
    error: "Terjadi kesalahan, coba lagi nanti.",
    banned: "Kamu diblokir dari bot.",
    expired: "Verifikasi kedaluwarsa. Kirim join request baru untuk kode baru.",
    success: "Verifikasi berhasil.",
    wrongCode: "Kode salah. Percobaan: {used}/{max}.",
    noPermission: "Hanya owner yang bisa memakai fitur ini."
  }
};

export function addStrings(lang: string, dict: Record<string, string>): void {
  const key = String(lang || "").toLowerCase().slice(0, 2);
  STRINGS[key] = Object.assign({}, STRINGS[key] || {}, dict);
}

export function t(lang: unknown, key: string, vars?: Record<string, unknown>): string {
  const code = String(lang || "").toLowerCase();
  const full = STRINGS[code] || STRINGS[code.slice(0, 2)];
  const table = full || {};
  let s = table[key] ?? STRINGS.en[key] ?? key;
  for (const k of Object.keys(vars || {})) s = s.split("{" + k + "}").join(String((vars as Record<string, unknown>)[k]));
  return s;
}
