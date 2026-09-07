import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SiteLayout } from "@/components/SiteLayout";
import { CookieConsent } from "@/components/CookieConsent";
import { MonetizationProvider } from "@/components/MonetizationProvider";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-G8GLTV3ES8";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Read Manga, Manhwa & Webtoons Online | Senpai Den",
    template: "%s | Senpai Den",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: "Read Manga, Manhwa & Webtoons Online | Senpai Den",
    description: DEFAULT_DESCRIPTION,
    images: [{ url: absoluteUrl("/icon.png"), alt: "Senpai Den" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Read Manga, Manhwa & Webtoons Online | Senpai Den",
    description: DEFAULT_DESCRIPTION,
    images: [absoluteUrl("/icon.png")],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "google7939b298ac53f907",
    other: {
      "mylead-verification": "bd6e2f03e36f35ff606ee4ae41cb79ea",
      ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : {}),
    },
  },
  category: "entertainment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        inLanguage: "en",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/discover?included={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: absoluteUrl("/icon.png"),
        sameAs: [],
      },
    ],
  };
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="referrer" content="no-referrer" />
        <meta name="mylead-verification" content="bd6e2f03e36f35ff606ee4ae41cb79ea" />
      </head>
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        {GA_ID && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_ID}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
          </>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        <SiteLayout>
          {children}
        </SiteLayout>
        <CookieConsent />
        <MonetizationProvider />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
