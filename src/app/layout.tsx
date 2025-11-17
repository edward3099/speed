import type { Metadata } from "next";
import "./globals.css";
import HeaderWrapper from "@/components/HeaderWrapper";

export const metadata: Metadata = {
  title: "speed date",
  description: "video first speed dating web app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-black text-white overflow-x-hidden">
        <HeaderWrapper />
        {children}
      </body>
    </html>
  );
}
