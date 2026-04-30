import { IBM_Plex_Mono, Newsreader, Inter } from "next/font/google";
import Image from "next/image";
import logo from "@/assets/logo2-transparent.png";
import { SITE_DESCRIPTION, SITE_FULL_TITLE, SITE_ORGANIZATION, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

const sansFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const headlineFont = Newsreader({
  subsets: ["latin"],
  variable: "--font-headline",
  weight: ["400", "500", "600", "700"],
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_FULL_TITLE,
    template: `%s | ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_ORGANIZATION.name,
    title: SITE_FULL_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_LK",
  },
  twitter: {
    card: "summary",
    title: SITE_FULL_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${sansFont.variable} ${headlineFont.variable} ${monoFont.variable}`}>
        <header className="site-header">
          <div className="site-header-inner">
            <a
              href="https://ceylondatastrategy.com"
              className="site-header-brand"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image src={logo} alt="Ceylon Data Strategy" height={30} />
            </a>
            <div className="site-header-sep" />
            <div className="site-header-meta">
              <span className="site-header-product">SLEPI</span>
              <span className="site-header-desc">Sri Lanka External Pressure Index</span>
            </div>
          </div>
        </header>

        {children}

        <footer className="site-footer">
          <span className="site-footer-label">Powered by</span>
          <Image src={logo} alt="Ceylon Data Strategy" height={20} />
        </footer>
      </body>
    </html>
  );
}
