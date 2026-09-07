"use client";

import { useEffect, useState } from "react";
import { CONSENT_UPDATED_EVENT, getConsent, type ConsentPreferences } from "@/lib/consent";
import {
  ADS_ENABLED,
  ADS_PREVIEW,
  ADSENSE_CLIENT,
  ADSTERRA_SCRIPT_URL,
  canServeAdsInBrowser,
} from "@/lib/monetization";
import { hasActivePremium } from "@/lib/reader-progression";

const ADSENSE_SCRIPT_ID = "senpaiden-adsense-script";
const ADSTERRA_SCRIPT_ID = "senpaiden-adsterra-script";

export function MonetizationProvider() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = (preferences?: ConsentPreferences | null) => {
      const consent = preferences || getConsent();
      setAllowed(
        Boolean(
          canServeAdsInBrowser() &&
            (ADS_ENABLED || ADS_PREVIEW) &&
            !hasActivePremium() &&
            (consent?.advertising || ADS_PREVIEW)
        )
      );
    };

    sync();
    const onConsent = (event: Event) =>
      sync((event as CustomEvent<ConsentPreferences>).detail);
    const onPremium = () => sync();

    window.addEventListener(CONSENT_UPDATED_EVENT, onConsent);
    window.addEventListener("senpai-premium-updated", onPremium);
    window.addEventListener("storage", onPremium);

    return () => {
      window.removeEventListener(CONSENT_UPDATED_EVENT, onConsent);
      window.removeEventListener("senpai-premium-updated", onPremium);
      window.removeEventListener("storage", onPremium);
    };
  }, []);

  // Inject Google AdSense Script
  useEffect(() => {
    if (!allowed || !ADSENSE_CLIENT) {
      const existing = document.getElementById(ADSENSE_SCRIPT_ID);
      if (existing) existing.remove();
      return;
    }
    if (document.getElementById(ADSENSE_SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
      ADSENSE_CLIENT
    )}`;
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById(ADSENSE_SCRIPT_ID);
      if (el) el.remove();
    };
  }, [allowed]);

  // Inject Adsterra Global Script (Social Bar / Popunder)
  useEffect(() => {
    if (!allowed || !ADSTERRA_SCRIPT_URL) {
      const existing = document.getElementById(ADSTERRA_SCRIPT_ID);
      if (existing) existing.remove();
      return;
    }
    if (document.getElementById(ADSTERRA_SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = ADSTERRA_SCRIPT_ID;
    script.type = "text/javascript";
    script.async = true;
    script.src = ADSTERRA_SCRIPT_URL;
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById(ADSTERRA_SCRIPT_ID);
      if (el) el.remove();
    };
  }, [allowed]);

  return null;
}

