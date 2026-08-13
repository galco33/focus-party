import type { Metadata } from "next";
import Dashboard from "../Dashboard";

export const metadata: Metadata = {
  title: "Dashboard — Focus Party",
  description: "Gérez votre timer Pomodoro, vos overlays OBS et les tâches de votre communauté Twitch.",
  robots: { index: false, follow: false, nocache: true },
};

export default function DashboardPage() {
  return <Dashboard />;
}
