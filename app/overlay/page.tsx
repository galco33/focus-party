import type { Metadata } from "next";
import Overlay from "./Overlay";

export const metadata: Metadata = {
  title: "Overlay OBS — Focus Party",
  description: "Overlay Pomodoro transparent pour OBS.",
};

export default function OverlayPage() {
  return <Overlay />;
}
