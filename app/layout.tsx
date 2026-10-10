import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Gold Watch | لوحة السوق",
  description: "متابعة الذهب والبيتكوين، مؤشرات متعددة الأطر، سيناريوهات الحركة والسيولة والأخبار.",
  manifest: "/manifest.webmanifest",
  icons: {icon:"/favicon.svg",shortcut:"/favicon.svg"},
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl"><body className="antialiased">{children}</body></html>;
}
