"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, ShieldAlert } from "lucide-react";
import {
  getIs18Plus,
  setIs18Plus,
  openAgeVerificationModal,
  AGE_RESTRICTION_UPDATED_EVENT,
} from "@/lib/age-restriction";

interface AgeRestrictionToggleProps {
  variant?: "default" | "compact";
  className?: string;
}

export function AgeRestrictionToggle({
  variant = "default",
  className = "",
}: AgeRestrictionToggleProps) {
  const router = useRouter();
  const [is18Plus, setIs18PlusState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIs18PlusState(getIs18Plus());

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ is18Plus?: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.is18Plus === "boolean") {
        setIs18PlusState(customEvent.detail.is18Plus);
      } else {
        setIs18PlusState(getIs18Plus());
      }
    };

    window.addEventListener(AGE_RESTRICTION_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener(AGE_RESTRICTION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const handleToggle = () => {
    if (!is18Plus) {
      // Trying to enable 18+ mode -> Prompt confirmation modal
      openAgeVerificationModal();
    } else {
      // Disabling 18+ mode -> Directly disable and refresh view
      setIs18Plus(false);
      setIs18PlusState(false);
      router.refresh();
    }
  };

  if (!mounted) {
    // Avoid hydration mismatch
    return (
      <div className={`inline-flex items-center gap-2 opacity-50 ${className}`}>
        <div className="h-5 w-9 rounded-full bg-white/10" />
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`flex items-center justify-between gap-2 py-1 ${className}`}>
        <div className="flex items-center gap-1.5">
          {is18Plus ? (
            <ShieldAlert size={13} className="text-red-500" />
          ) : (
            <Shield size={13} className="text-zinc-500" />
          )}
          <span className="text-[11px] font-bold text-zinc-400">18+ Mode</span>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          role="switch"
          aria-checked={is18Plus}
          title={is18Plus ? "Disable 18+ Content" : "Enable 18+ Content (Age Verification Required)"}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 ${
            is18Plus
              ? "bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
              : "bg-zinc-800 border border-white/10"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
              is18Plus ? "translate-x-4" : "translate-x-0 bg-zinc-400"
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm transition-all hover:border-white/20 ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`grid h-5 place-items-center rounded px-1 text-[10px] font-black tracking-wider transition-colors ${
            is18Plus
              ? "bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          18+
        </span>
        <span className="text-xs font-bold text-zinc-300">
          Age Restriction
        </span>
      </div>

      <button
        type="button"
        onClick={handleToggle}
        role="switch"
        aria-checked={is18Plus}
        title={is18Plus ? "Click to turn OFF 18+ content" : "Click to turn ON 18+ content (Requires Age Confirmation)"}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full p-0.5 transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 ${
          is18Plus
            ? "bg-red-600 shadow-[0_0_12px_rgba(239,68,68,0.6)]"
            : "bg-zinc-800 border border-white/15 hover:border-white/30"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full transition duration-200 ease-in-out ${
            is18Plus ? "translate-x-4 bg-white" : "translate-x-0 bg-zinc-400"
          }`}
        />
      </button>

      <span
        className={`text-[10px] font-black tracking-wider uppercase ${
          is18Plus ? "text-red-400 font-bold" : "text-zinc-500"
        }`}
      >
        {is18Plus ? "ON" : "OFF"}
      </span>
    </div>
  );
}
