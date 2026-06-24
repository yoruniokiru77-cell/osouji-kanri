export function normalizeHost(host: string | null) {
  return (host ?? "").split(":")[0].toLowerCase();
}

export function isAdminHost(host: string | null) {
  const normalized = normalizeHost(host);
  if (!normalized) return false;

  const configuredHosts = (process.env.ADMIN_HOSTS ?? "")
    .split(",")
    .map((value) => normalizeHost(value.trim()))
    .filter(Boolean);

  return (
    configuredHosts.includes(normalized) ||
    normalized === "admin-osouji-kanri.vercel.app" ||
    normalized.startsWith("admin.")
  );
}
