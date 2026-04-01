import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

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
      <body className={`${headlineFont.variable} ${monoFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
