import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./m15-watch-strip.css";
import "./gold-sniper-radar.css";
import "./sniper-m15-mt5.css";

export const metadata: Metadata = {
  title: "القناص | Qannas Trading Terminal",
  description: "شاشة القناص للذهب والبيتكوين: شموع سعر حقيقية، سيناريوهات مراقبة مؤهلة، تكلفة السكالب، والأخبار الاقتصادية في سطر واحد.",
  manifest: "/manifest.webmanifest",
  icons: {icon:"/favicon.svg",shortcut:"/favicon.svg"},
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl"><body className="antialiased">{children}</body></html>;
}
