import type { Metadata, Viewport } from "next";
import "./globals.css";
import HeaderWrapper from "@/components/HeaderWrapper";
import { PreventHorizontalScroll } from "@/components/PreventHorizontalScroll";
import { SuppressDevtoolsErrors } from "@/components/SuppressDevtoolsErrors";
import { ErrorDebugger } from "@/components/ErrorDebugger";
import { DevToolsStatus } from "@/lib/debug";
import { DebugPanel } from "@/components/DebugPanel";
import { ToastProvider } from "@/app/providers/ToastProvider";

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
        <SuppressDevtoolsErrors />
        <ErrorDebugger />
        <DevToolsStatus />
        <DebugPanel />
        <PreventHorizontalScroll />
        <ToastProvider>
          <div className="overflow-hidden max-w-full w-full h-full" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
            <HeaderWrapper />
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
