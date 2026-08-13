import type { Metadata } from "next";
import Overlay from "./Overlay";

export const metadata: Metadata = {
  title: "Overlay OBS — Focus Party",
  description: "Overlay Pomodoro transparent pour OBS.",
  robots: { index: false, follow: false, nocache: true },
};

export default function OverlayPage() {
  return <Overlay />;
}
