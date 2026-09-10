"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, X, Check, AlertTriangle } from "lucide-react";
import {
  OPEN_AGE_RESTRICTION_MODAL_EVENT,
  setIs18Plus,
  getIs18Plus,
} from "@/lib/age-restriction";

export function AgeConfirmationModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener(OPEN_AGE_RESTRICTION_MODAL_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_AGE_RESTRICTION_MODAL_EVENT, handleOpen);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    setIs18Plus(true);
    setIsOpen(false);
    router.refresh();
  };

  const handleCancel = () => {
    // Keep it OFF
    if (getIs18Plus()) {
      setIs18Plus(false);
    }
    setIsOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-modal-title"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-red-500/30 bg-[#0F1117] p-6 sm:p-8 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-red-600/15 blur-3xl" />

        {/* Close Button */}
        <button
          onClick={handleCancel}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close age verification modal"
        >
          <X size={16} />
        </button>

        {/* Icon & Badge */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]">
            <ShieldAlert size={32} />
            <span className="absolute -top-1 -right-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-md">
              18+
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-bold text-red-400 mb-2">
            <AlertTriangle size={12} />
            <span>Age Restriction Notice</span>
          </div>

          <h2 id="age-modal-title" className="text-xl font-black text-white sm:text-2xl">
            Are you 18 or older?
          </h2>

          <p className="mt-3 text-xs leading-relaxed text-zinc-400 sm:text-sm">
            This option enables mature and adult (18+) manga titles across SenpaiDen. 
            You must be at least 18 years of age or the legal age of majority in your jurisdiction to view age-restricted material.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-7 flex flex-col gap-3">
          <button
            onClick={handleConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-3.5 text-sm font-black text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            <Check size={18} className="stroke-[3]" />
            <span>Yes, I am 18 or older</span>
          </button>

          <button
            onClick={handleCancel}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-bold text-zinc-400 hover:bg-white/10 hover:text-white active:scale-[0.98] transition-all"
          >
            No, I am under 18 (Cancel)
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] text-zinc-600">
          You can toggle this setting anytime from the footer.
        </p>
      </div>
    </div>
  );
}
