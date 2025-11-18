import type { Metadata, Viewport } from "next";
import "./globals.css";
import HeaderWrapper from "@/components/HeaderWrapper";
import { PreventHorizontalScroll } from "@/components/PreventHorizontalScroll";

export const metadata: Metadata = {
  title: "speed date",
  description: "video first speed dating web app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-hidden max-w-full" style={{ touchAction: 'none', overscrollBehavior: 'none', position: 'fixed', width: '100%', height: '100%' }}>
      <body className="bg-black text-white overflow-hidden max-w-full w-full h-full" style={{ touchAction: 'none', overscrollBehavior: 'none', position: 'fixed', width: '100%', height: '100%' }}>
        <PreventHorizontalScroll />
        <div className="overflow-hidden max-w-full w-full h-full" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
          <HeaderWrapper />
          {children}
        </div>
      </body>
    </html>
  );
}
