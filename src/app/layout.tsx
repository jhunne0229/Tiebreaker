import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: "타이브레이커 — 결정 못 내릴 때 AI가 도와주는 의사결정 도우미",
  description:
    "장단점 · 비교표 · SWOT을 한 번에 받아보고, 결정을 히스토리로 누적하세요.",
  applicationName: "타이브레이커",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "타이브레이커",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
