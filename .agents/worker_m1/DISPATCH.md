## 2026-09-02T05:03:03Z

You are Worker 1 (Ad Infrastructure & Adsterra Production Activation Specialist).
Your working directory is /home/unshakensoul/senpai_den/.agents/worker_m1/
Workspace Root: /home/unshakensoul/senpai_den

Please read:
- /home/unshakensoul/senpai_den/.agents/ORIGINAL_REQUEST.md
- /home/unshakensoul/senpai_den/PROJECT.md
- /home/unshakensoul/senpai_den/.agents/explorer_ad_infra/handoff.md
- /home/unshakensoul/senpai_den/.agents/explorer_ui_defects/handoff.md

File Write Ownership:
You have exclusive write access to:
- frontend/src/components/AdSlot.tsx
- frontend/src/lib/monetization.ts
- frontend/src/components/MonetizationProvider.tsx

Tasks for Milestone 1:
1. Refactor `frontend/src/components/AdSlot.tsx`:
   - Retain and ensure active production Adsterra banner keys: 728x90 desktop (`2de4d4b4a2f675e5880e6d1004852c8b`), 320x50 mobile (`e595c21e4de14999cdb8003e66163d4b`).
   - Retain Adsterra native banner config: `https://pl30953537.effectivecpmnetwork.com/d151fe0fbadd628be5d88b715d6a1e68/invoke.js` and container prefix.
   - Add dynamic debounced window resize handler so viewport changes (<768px vs >=768px) properly switch between 320x50 and 728x90 banners.
   - Clean up on unmount: clear container innerHTML and remove event listeners to prevent DOM memory leaks during client navigation.
   - Generate unique container IDs (e.g. using `useId()` or dynamic prefix) for native ad slots to prevent multi-instance ID collisions.
   - Enforce premium suppression: check `!hasActivePremium()` from `@/lib/reader-progression` in the `isAllowed` calculation.
   - Prevent Cumulative Layout Shift (CLS): Always render the outer `<aside>` container with reserved dimensions (`min-h-[74px] md:min-h-[114px]`) and standardized dark obsidian styling (`bg-[#0E1422]/60 border border-white/[0.08] rounded-2xl p-2.5`) with compliant uppercase "ADVERTISEMENT" header (`text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400`).
   - Graceful adblock handling: If script fails or is blocked, maintain clean dark container aesthetics without broken DOM artifacts.
2. Check `frontend/src/components/MonetizationProvider.tsx`:
   - Enforce `!hasActivePremium()` check before injecting any global monetization scripts.
3. Verification:
   - Run `npm run build` in `frontend/` and verify zero TypeScript, ESLint, or Next.js build errors.
4. Report:
   - Write your complete handoff report to `/home/unshakensoul/senpai_den/.agents/worker_m1/handoff.md`.
