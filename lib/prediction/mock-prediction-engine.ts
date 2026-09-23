import type {
  PredictionEngine,
  PredictionInput,
  TravelTimeDataProvider,
} from "../../types/prediction";
import { arrivalAt } from "../utils/time";

export class MockPredictionEngine implements PredictionEngine {
  constructor(private readonly provider: TravelTimeDataProvider) {}
  async predict(input: PredictionInput) {
    const context = await this.provider.getContext(input);
    const durationMinutes = Math.max(
      1,
      Math.round(context.route.baselineMinutes * context.multiplier),
    );
    return {
      input: { ...input },
      route: context.route,
      durationMinutes,
      differenceMinutes: durationMinutes - context.route.baselineMinutes,
      ...arrivalAt(input.date, input.departureTime, durationMinutes),
      source: context.source,
      reasons: context.reasons,
    };
  }
}
