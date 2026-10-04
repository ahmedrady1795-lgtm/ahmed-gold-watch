import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahmed Market Command | Predator Core v8.1",
  description: "مركز تحليل مباشر للذهب وBitcoin بنواة Predator Core v8.1 وقرار اتجاه واحد حصري.",
  manifest: "/manifest.webmanifest",
  icons: {icon:"/favicon.svg",shortcut:"/favicon.svg"},
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl"><body className="antialiased">{children}</body></html>;
}
