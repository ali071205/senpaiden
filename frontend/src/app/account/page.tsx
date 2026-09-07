"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Check, Home, LogIn, LogOut, Mail, Save, UserRound, X, Ticket } from "lucide-react";
import { getReaderProgression, PROGRESSION_UPDATED_EVENT, type ReaderProgression } from "@/lib/reader-progression";
import { endSession, getRegisteredAccounts, getStoredAccount, isSignedIn, rememberAccount, startSession, type StoredAccount } from "@/lib/auth-storage";
import { addNotification } from "@/lib/notifications";

interface AccountDetails {
  displayName: string;
  email: string;
  bio: string;
  referralCode?: string;
}

const DEFAULT_ACCOUNT: AccountDetails = {
  displayName: "Senpai",
  email: "reader@senpaiden.com",
  bio: "Chasing great panels, one chapter at a time.",
};

export default function AccountPage() {
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [saved, setSaved] = useState(false);
  const [progression, setProgression] = useState<ReaderProgression>({ totalExp: 0, readMangaIds: [], proPlusRewardClaimed: false, claimedRewardIds: [], creditedReferralIds: [], creditedReferralEmails: [], referralCode: "" });
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [showReferralPrompt, setShowReferralPrompt] = useState(false);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [signupReferralCode, setSignupReferralCode] = useState("");
  const [signupReferralError, setSignupReferralError] = useState("");

  useEffect(() => {
    try {
      const stored = getStoredAccount();
      if (stored) {
        setAccount({ ...DEFAULT_ACCOUNT, ...stored });
        setSignupReferralCode(stored.pendingReferralCode || "");
        const reopenFromNotification = new URLSearchParams(window.location.search).get("referral") === "1";
        if (stored.referralPrompt === "pending" || reopenFromNotification) setShowReferralPrompt(true);
      }
    } catch {}
    setAuthenticated(isSignedIn());
  }, []);

  useEffect(() => {
    const syncProgression = () => setProgression(getReaderProgression());
    syncProgression();
    window.addEventListener(PROGRESSION_UPDATED_EVENT, syncProgression);
    return () => window.removeEventListener(PROGRESSION_UPDATED_EVENT, syncProgression);
  }, []);

  const referralShareCode = account.referralCode || progression.referralCode;

  useEffect(() => {
    if (authenticated && referralShareCode) rememberAccount({ ...account, referralCode: referralShareCode });
  }, [account, authenticated, referralShareCode]);

  const saveAccount = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    localStorage.setItem("senpai_account", JSON.stringify({ ...account, referralCode: referralShareCode }));
    rememberAccount({ ...account, referralCode: referralShareCode });
    window.dispatchEvent(new Event("senpai-account-updated"));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  const shareReferral = async () => {
    const link = `${window.location.origin}/login?mode=signup&ref=${encodeURIComponent(referralShareCode)}`;
    const shareText = `Join me on SenpaiDen and discover your next manga. Use my referral code ${referralShareCode}: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join SenpaiDen", text: shareText, url: link });
        setReferralMessage("Invite shared.");
      } else {
        await navigator.clipboard.writeText(shareText);
        setReferralMessage("Invite message and link copied.");
      }
    } catch {
      setReferralMessage("Share cancelled. You can copy the invite link instead.");
    }
  };

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/login?mode=signup&ref=${encodeURIComponent(referralShareCode)}`;
    await navigator.clipboard.writeText(link);
    setReferralMessage("Referral link copied.");
  };

  const updateReferralPrompt = (status: StoredAccount["referralPrompt"]) => {
    const updated = { ...account, referralCode: referralShareCode, referralPrompt: status, pendingReferralCode: "" };
    setAccount(updated);
    rememberAccount(updated);
    startSession(updated);
    setShowReferralPrompt(false);
  };

  const dismissReferralPrompt = () => {
    updateReferralPrompt("dismissed");
    addNotification({ id: `referral-reminder-${account.email}`, kind: "referral", title: "Add your referral code", detail: "You closed the referral step before finishing. Tap here if you still want to add a friend's code.", time: "Just now", href: "/account?referral=1", unread: true });
  };

  const applySignupReferral = () => {
    const code = signupReferralCode.trim().toUpperCase();
    const referrer = getRegisteredAccounts().find((item) => item.referralCode?.toUpperCase() === code);
    if (!code || !referrer) {
      setSignupReferralError("This referral code is not valid. Check the code and try again.");
      return;
    }
    if (referrer.email.toLowerCase() === account.email.toLowerCase()) {
      setSignupReferralError("You cannot use your own referral code.");
      return;
    }
    const result = creditSuccessfulReferral(account.email, referrer.email);
    if (!result.ok) {
      setSignupReferralError(result.error);
      return;
    }
    setProgression(result.progression);
    updateReferralPrompt("completed");
  };

  if (authenticated === null) return null;

  if (!authenticated) {
    return <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-4 py-16"><section className="w-full rounded-3xl border border-white/10 bg-[#11131A] p-8 text-center shadow-2xl"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary"><UserRound className="h-8 w-8" /></span><h1 className="mt-5 text-3xl font-black text-white">Sign in to view your profile</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-400">Your account details, reader level, rewards and referral link are available after you sign in.</p><Link href="/login" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-black text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"><LogIn className="h-4 w-4" /> Log in</Link><p className="mt-4 text-xs text-zinc-500">New here? You can create an account on the next screen.</p></section></div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">
      {showReferralPrompt && <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="referral-prompt-title"><section className="relative w-full max-w-md rounded-3xl border border-cyan-300/20 bg-[#11151A] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.65)] md:p-8"><button onClick={dismissReferralPrompt} aria-label="Close referral prompt" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"><X className="h-5 w-5" /></button><span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300"><Ticket className="h-7 w-7" /></span><h2 id="referral-prompt-title" className="mt-5 pr-10 text-2xl font-black text-white">Do you have a referral code?</h2><p className="mt-2 text-sm leading-6 text-zinc-400">This is optional and appears only once for a new account. Adding a valid code rewards the friend who invited you.</p>{showReferralInput ? <div className="mt-6"><label htmlFor="signup-referral-code" className="text-xs font-bold uppercase tracking-wider text-zinc-400">Referral code</label><input id="signup-referral-code" autoFocus value={signupReferralCode} onChange={(event) => { setSignupReferralCode(event.target.value.toUpperCase()); setSignupReferralError(""); }} placeholder="SENPAI-XXXX" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 font-mono text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/15" /><p role="alert" className="mt-2 min-h-5 text-xs text-red-300">{signupReferralError}</p><div className="mt-4 flex gap-3"><button onClick={() => setShowReferralInput(false)} className="min-h-11 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-300 hover:bg-white/10">Back</button><button onClick={applySignupReferral} className="min-h-11 flex-1 rounded-2xl bg-cyan-300 px-4 text-sm font-black text-[#061013] hover:bg-cyan-200">Apply code</button></div></div> : <div className="mt-7 grid grid-cols-2 gap-3"><button onClick={() => updateReferralPrompt("skipped")} className="min-h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-300 transition hover:bg-white/10">No, skip</button><button onClick={() => setShowReferralInput(true)} className="min-h-12 rounded-2xl bg-cyan-300 px-4 text-sm font-black text-[#061013] transition hover:bg-cyan-200">Yes, add code</button></div>}<Link href="/" onClick={dismissReferralPrompt} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"><Home className="h-4 w-4" /> Go to home</Link></section></div>}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Reader identity</p><h1 className="mt-2 text-3xl font-black text-white md:text-4xl">Your account</h1><p className="mt-2 max-w-xl text-sm text-zinc-400">Manage the name and details shown across your SenpaiDen experience.</p></div>
        <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-zinc-200 transition hover:border-primary/30 hover:bg-primary/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"><Home className="h-4 w-4" /> Home</Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="overflow-hidden rounded-3xl border border-white/10 bg-[#11131A]">
          <div className="h-24 bg-[radial-gradient(circle_at_top_left,rgba(255,46,46,0.55),transparent_65%),linear-gradient(120deg,#1B1020,#0F1117)]" />
          <div className="px-6 pb-6 text-center">
            <div className="mx-auto -mt-12 grid h-24 w-24 place-items-center rounded-full border-4 border-[#11131A] bg-zinc-800 shadow-[0_0_30px_rgba(255,46,46,0.25)]">
              <UserRound className="h-10 w-10 text-zinc-300" />
            </div>
            <h2 className="mt-3 truncate text-xl font-black text-white">{account.displayName || "Senpai"}</h2>
            <p className="text-xs text-zinc-500">SenpaiDen Reader</p>
            <div className="mt-5 grid grid-cols-1 gap-2">
              <div className="rounded-2xl bg-white/5 p-3"><Bookmark className="mx-auto h-4 w-4 text-primary" /><p className="mt-1 text-lg font-black text-white">{progression.readMangaIds.length}</p><p className="text-[10px] text-zinc-500">Manga read</p></div>
            </div>
          </div>
        </aside>

        <div className="grid gap-6">
        <form onSubmit={saveAccount} className="rounded-3xl border border-white/10 bg-[#11131A] p-5 md:p-7">
          <div className="flex items-center gap-3 border-b border-white/5 pb-5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></div>
            <div><h2 className="font-bold text-white">Profile details</h2><p className="text-xs text-zinc-500">Saved locally on this device.</p></div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-zinc-300">Display name
              <input required maxLength={32} value={account.displayName} onChange={(e) => setAccount({ ...account, displayName: e.target.value })} className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-300">Email
              <div className="relative"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input required type="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-white outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15" /></div>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-300 md:col-span-2">Reader bio
              <textarea maxLength={160} rows={4} value={account.bio} onChange={(e) => setAccount({ ...account, bio: e.target.value })} className="resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-white outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15" />
              <span className="text-right text-[11px] font-normal text-zinc-600">{account.bio.length}/160</span>
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <span aria-live="polite" className={`flex items-center gap-1 text-xs text-emerald-400 transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}><Check className="h-4 w-4" /> Saved</span>
            <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"><Save className="h-4 w-4" /> Save changes</button>
          </div>
        </form>

        <section className="rounded-3xl border border-red-500/20 bg-[#11131A] p-5 md:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-white">Account session</h2>
              <p className="text-xs text-zinc-500">You are signed in as {account.email}.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  endSession();
                  window.location.href = "/login";
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 text-sm font-bold text-red-400 transition hover:bg-red-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </div>
        </section>

        </div>
      </div>
    </div>
  );
}
