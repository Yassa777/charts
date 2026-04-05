import { IBM_Plex_Mono, Newsreader, Inter } from "next/font/google";
import Image from "next/image";
import logo from "@/assets/logo2-transparent.png";
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
  title: "SLEPI",
  description: "Sri Lanka External Pressure Index",
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
