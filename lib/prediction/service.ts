import type {
  PredictionEngine,
  PredictionInput,
  PredictionReport,
} from "../../types/prediction";
import { MockTravelTimeDataProvider } from "../data/mock-travel-time-provider";
import { MockPredictionEngine } from "./mock-prediction-engine";

export const predictionEngine: PredictionEngine = new MockPredictionEngine(
  new MockTravelTimeDataProvider(),
);
export async function buildReport(
  input: PredictionInput,
  engine = predictionEngine,
): Promise<PredictionReport> {
  const selected = await engine.predict(input);
  const times = new Set(
    Array.from(
      { length: 18 },
      (_, i) => `${String(i + 6).padStart(2, "0")}:00`,
    ),
  );
  times.add(input.departureTime);
  const hourly = await Promise.all(
    [...times]
      .sort()
      .map((departureTime) => engine.predict({ ...input, departureTime })),
  );
  return { selected, hourly };
}
