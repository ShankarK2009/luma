import { getDemoState } from "@/lib/data/demo";
import { ensureUserProfileRecord, isTransientSupabaseFetchFailure } from "@/lib/data/repository";
import { hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/env";
import { getServerSupabaseClientMaybe } from "@/lib/supabase/server";
import type { UserContext } from "@/lib/types";

const OWNER_USER_ID = "11111111-1111-4111-8111-111111111111";
let hasLoggedSupabaseProfileUnavailable = false;

export class AuthRequiredError extends Error {
  status = 401;

  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

async function safelyEnsureUserProfile(params: {
  userId: string;
  displayName: string;
}) {
  try {
    await ensureUserProfileRecord(params);
  } catch (error) {
    if (isTransientSupabaseFetchFailure(error)) {
      if (!hasLoggedSupabaseProfileUnavailable) {
        console.warn("Supabase unavailable while ensuring user profile record.");
        hasLoggedSupabaseProfileUnavailable = true;
      }
      return;
    }
    console.error("Failed to ensure Supabase user profile record.", error);
  }
}

export async function getCurrentUserContext(): Promise<UserContext> {
  if (!hasSupabaseEnv) {
    const demo = getDemoState().user;
    return {
      userId: demo.id,
      displayName: demo.displayName,
      isAuthenticated: true,
      mode: "demo",
    };
  }

  const supabase = await getServerSupabaseClientMaybe();

  if (!supabase) {
    const demo = getDemoState().user;
    return {
      userId: demo.id,
      displayName: demo.displayName,
      isAuthenticated: false,
      mode: "demo",
    };
  }

  const { data, error } = await supabase.auth.getUser();

  if (!error && data.user) {
    const context = {
      userId: data.user.id,
      displayName:
        data.user.user_metadata?.display_name ??
        data.user.email?.split("@")[0] ??
        "Luma user",
      isAuthenticated: true,
      mode: "supabase" as const,
    };

    await safelyEnsureUserProfile({
      userId: context.userId,
      displayName: context.displayName,
    });

    return context;
  }

  if (hasSupabaseAdminEnv) {
    const owner = {
      userId: OWNER_USER_ID,
      displayName: "Luma owner",
      isAuthenticated: true,
      mode: "supabase" as const,
    };

    await safelyEnsureUserProfile({
      userId: owner.userId,
      displayName: owner.displayName,
    });

    return owner;
  }

  if (error || !data.user) {
    return {
      userId: "anonymous",
      displayName: "Guest",
      isAuthenticated: false,
      mode: "supabase",
    };
  }

  return {
    userId: "anonymous",
    displayName: "Guest",
    isAuthenticated: false,
    mode: "supabase",
  };
}

export async function requireCurrentUserContext() {
  const context = await getCurrentUserContext();

  if (context.mode === "supabase" && !context.isAuthenticated) {
    throw new AuthRequiredError();
  }

  return context;
}
