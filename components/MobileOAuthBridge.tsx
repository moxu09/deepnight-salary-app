"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { MOBILE_OAUTH_SCHEME } from "@/lib/mobileOAuth";

function resumeOAuth(url: string) {
  let incoming: URL;
  try {
    incoming = new URL(url);
  } catch {
    return;
  }
  if (
    incoming.protocol !== `${MOBILE_OAUTH_SCHEME}:` ||
    incoming.hostname !== "auth" ||
    incoming.pathname !== "/callback"
  ) {
    return;
  }

  void Browser.close().catch(() => undefined);
  const callback = new URL("/auth/callback", window.location.origin);
  incoming.searchParams.forEach((value, key) => {
    callback.searchParams.append(key, value);
  });
  callback.hash = incoming.hash;
  window.location.assign(callback.toString());
}

export default function MobileOAuthBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    void App.addListener("appUrlOpen", ({ url }) => resumeOAuth(url)).then(
      (handle) => {
        if (disposed) void handle.remove();
        else listener = handle;
      }
    );
    void App.getLaunchUrl().then((result) => {
      if (!disposed && result?.url) resumeOAuth(result.url);
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, []);

  return null;
}
