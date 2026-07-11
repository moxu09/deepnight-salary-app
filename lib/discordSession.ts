type DiscordIdentity = {
  identity_data?: Record<string, unknown>;
};

type DiscordSession = {
  user?: {
    user_metadata?: Record<string, unknown>;
    identities?: DiscordIdentity[];
  };
};

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function getDiscordIdFromSession(session: unknown) {
  const user = (session as DiscordSession | null)?.user;
  const metadata = user?.user_metadata || {};
  const identity = user?.identities?.[0]?.identity_data || {};

  return (
    stringValue(metadata.provider_id) ||
    stringValue(metadata.sub) ||
    stringValue(metadata.user_id) ||
    stringValue(identity.sub) ||
    stringValue(identity.id)
  ).trim();
}
