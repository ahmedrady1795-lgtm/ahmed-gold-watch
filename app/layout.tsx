import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahmed Gold Command | XAU/USD",
  description: "مركز متابعة الذهب: مؤشرات متعددة الأطر، تنبيهات، أخبار، وMT5 Bridge.",
  manifest: "/manifest.webmanifest",
  other: {"codex-preview":"development"},
  icons: {icon:"/favicon.svg",shortcut:"/favicon.svg"},
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl"><body className="antialiased">{children}</body></html>;
}
