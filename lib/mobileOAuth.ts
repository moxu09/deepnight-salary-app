import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/lib/supabase";

export const MOBILE_OAUTH_SCHEME = "deepnight-eip";

function callbackUrl(params: URLSearchParams) {
  const query = params.toString();
  if (Capacitor.isNativePlatform()) {
    return `${MOBILE_OAUTH_SCHEME}://auth/callback${query ? `?${query}` : ""}`;
  }
  return `${window.location.origin}/auth/callback${query ? `?${query}` : ""}`;
}

async function openNativeOAuth(url?: string | null) {
  if (!Capacitor.isNativePlatform() || !url) return;
  await Browser.open({ url, presentationStyle: "popover" });
}

export async function beginOAuth(
  provider: "discord" | "google",
  params: URLSearchParams
) {
  const native = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl(params),
      skipBrowserRedirect: native,
    },
  });
  if (error) return { error };
  try {
    await openNativeOAuth(data.url);
    return { error: null };
  } catch (browserError) {
    return {
      error:
        browserError instanceof Error
          ? browserError
          : new Error("無法開啟系統瀏覽器"),
    };
  }
}

export async function beginIdentityLink(
  provider: "google",
  params: URLSearchParams
) {
  const native = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: callbackUrl(params),
      skipBrowserRedirect: native,
    },
  });
  if (!error) await openNativeOAuth(data.url);
  return { error };
}
