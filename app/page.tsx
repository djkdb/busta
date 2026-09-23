import { JourneyPlanner } from "../features/search/journey-planner";
import { buildReport } from "../lib/prediction/service";
import { koreanToday } from "../lib/utils/time";

export const dynamic = "force-dynamic";
export default async function Home() {
  const initial = await buildReport({
    routeId: "cheongju-seoul",
    date: koreanToday(),
    departureTime: "17:00",
  });
  return <JourneyPlanner initial={initial} />;
}
