import DashboardClient from "./dashboard-client";
import dashboard from "../public/data/dashboard.json";

export default function Page() {
  return <DashboardClient data={dashboard} />;
}
