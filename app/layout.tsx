import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BUSTA — 시간표보다 현실적인 버스 도착시간",
  description:
    "시외버스 시간표의 고정 소요시간 대신 날짜·요일·시간대를 반영한 예상 소요시간과 도착시간을 보여주는 서비스 (프로토타입)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
