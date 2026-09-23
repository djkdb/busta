import { mockRoutes } from "../../data/mock/routes";
import type {
  PredictionInput,
  TravelTimeDataProvider,
} from "../../types/prediction";
import { validateInput } from "../utils/time";

// Hand-authored demo assumptions; neither measured traffic nor a trained model.
const weekday = [
  0.94, 0.93, 0.92, 0.92, 0.93, 0.96, 1.02, 1.14, 1.19, 1.12, 1.06, 1.04, 1.05,
  1.06, 1.08, 1.12, 1.2, 1.28, 1.37, 1.24, 1.1, 1.02, 0.98, 0.95,
];
const weekend = [
  0.96, 0.94, 0.93, 0.93, 0.94, 0.97, 1.02, 1.06, 1.1, 1.15, 1.19, 1.23, 1.27,
  1.31, 1.34, 1.36, 1.32, 1.28, 1.23, 1.17, 1.1, 1.04, 1.0, 0.97,
];

export class MockTravelTimeDataProvider implements TravelTimeDataProvider {
  async getContext(input: PredictionInput) {
    validateInput(input.date, input.departureTime);
    const route = mockRoutes.find((route) => route.id === input.routeId);
    if (!route)
      throw new Error(
        "지원하지 않는 예시 노선입니다. 다른 노선을 선택해 주세요.",
      );
    const day = new Date(`${input.date}T00:00:00Z`).getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const [hour, minute] = input.departureTime.split(":").map(Number);
    const curve = isWeekend ? weekend : weekday;
    const multiplier =
      curve[hour] + ((curve[(hour + 1) % 24] - curve[hour]) * minute) / 60;
    const reasons = [
      isWeekend
        ? "주말 오후 혼잡을 가정한 예시 패턴"
        : "평일 출퇴근 시간의 혼잡을 가정한 예시 패턴",
      "시간 사이의 값은 선형 보간으로 계산",
    ];
    return { route, multiplier, reasons, source: "mock" as const };
  }
}
