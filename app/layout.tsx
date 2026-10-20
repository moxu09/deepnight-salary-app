import { Geist, Geist_Mono } from "next/font/google";
import AppLanguageProvider from "@/components/AppLanguageProvider";
import MobileOAuthBridge from "@/components/MobileOAuthBridge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "深夜不關燈 EIP",
  description: "深夜不關燈企業資訊入口系統",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MobileOAuthBridge />
        {children}
        <AppLanguageProvider />
      </body>
    </html>
  );
}
