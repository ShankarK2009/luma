"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "Could not generate an outfit right now.";
  } catch {
    return "Could not generate an outfit right now.";
  }
}

export function TodayGenerateButton({ vibePrompt }: { vibePrompt?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleGenerate = async () => {
    setBusy(true);
    setStatus("Generating a fresh outfit...");

    try {
      const response = await fetch("/api/outfits/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vibePrompt,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setStatus("Outfit ready.");
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not generate an outfit right now.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void handleGenerate();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-[1.4rem] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Generate outfit
      </button>
      {status ? <p className="text-sm text-[var(--text-soft)]">{status}</p> : null}
    </div>
  );
}
