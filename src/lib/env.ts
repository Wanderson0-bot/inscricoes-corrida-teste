function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabasePublicConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    key: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function getSupabaseServiceKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getAppUrl() {
  const configuredUrl = required("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL).trim();
  const url = new URL(configuredUrl.includes("://") ? configuredUrl : `https://${configuredUrl}`);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }

  return url.origin;
}

export function getSafe2PayConfig() {
  return {
    apiKey: required("SAFE2PAY_API_KEY", process.env.SAFE2PAY_API_KEY),
    application: process.env.SAFE2PAY_APPLICATION || "LetsRun",
  };
}

export function getPrivacyPolicyVersion() {
  return process.env.PRIVACY_POLICY_VERSION || "v1";
}
