import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "busta — 도착을 생각하는 버스 여행",
  description:
    "요일과 출발시간에 따른 시외버스 도착시간을 비교하는 예시 데이터 기반 MVP. 실제 운행·교통 정보가 아닙니다.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
