"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";

type StaffAvatarProps = {
  avatarUrl?: string | null;
  discordId?: string | null;
  alt?: string;
  iconSize?: number;
};

function getDefaultDiscordAvatar(discordId?: string | null) {
  const id = String(discordId || "").trim();

  if (!id) return "https://cdn.discordapp.com/embed/avatars/0.png";

  try {
    const index = Number((BigInt(id) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

function addDiscordSize(urlText: string) {
  try {
    const url = new URL(urlText);

    if (
      url.hostname === "cdn.discordapp.com" &&
      url.pathname.startsWith("/avatars/") &&
      !url.searchParams.has("size")
    ) {
      url.searchParams.set("size", "128");
    }

    return url.toString();
  } catch {
    return urlText;
  }
}

function normalizeAvatarUrl(
  avatarUrl?: string | null,
  discordId?: string | null
) {
  const value = String(avatarUrl || "").trim();
  const id = String(discordId || "").trim();

  if (!value) return getDefaultDiscordAvatar(id);

  if (/^https?:\/\//i.test(value)) {
    return addDiscordSize(value);
  }

  if (id && /^[a-z0-9_]+$/i.test(value)) {
    const ext = value.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${value}.${ext}?size=128`;
  }

  return getDefaultDiscordAvatar(id);
}

export default function StaffAvatar({
  avatarUrl,
  discordId,
  alt = "staff avatar",
  iconSize = 22,
}: StaffAvatarProps) {
  const fallbackUrl = useMemo(
    () => getDefaultDiscordAvatar(discordId),
    [discordId]
  );
  const primaryUrl = useMemo(
    () => normalizeAvatarUrl(avatarUrl, discordId),
    [avatarUrl, discordId]
  );
  const [useFallback, setUseFallback] = useState(false);
  const [hideImage, setHideImage] = useState(false);

  useEffect(() => {
    setUseFallback(false);
    setHideImage(false);
  }, [primaryUrl, fallbackUrl]);

  const src = useFallback ? fallbackUrl : primaryUrl;

  if (!src || hideImage) {
    return <UserRound size={iconSize} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      decoding="async"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useFallback && fallbackUrl && fallbackUrl !== src) {
          setUseFallback(true);
          return;
        }

        setHideImage(true);
      }}
    />
  );
}
