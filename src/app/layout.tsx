import type { Metadata } from "next";
import "./globals.css";
import HeaderWrapper from "@/components/HeaderWrapper";
import { ChakraUIProvider } from "@/providers/chakra-provider";

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
        <ChakraUIProvider>
          <HeaderWrapper />
          {children}
        </ChakraUIProvider>
      </body>
    </html>
  );
}
