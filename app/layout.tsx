import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahmed Market Command | Predator AI",
  description: "مركز تحليل مباشر للذهب وBitcoin: Predator AI، مؤشرات متعددة الأطر، أخبار اقتصادية، ورادار فرص.",
  manifest: "/manifest.webmanifest",
  icons: {icon:"/favicon.svg",shortcut:"/favicon.svg"},
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl"><body className="antialiased">{children}</body></html>;
}
