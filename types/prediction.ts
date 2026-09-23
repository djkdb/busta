export type DataSource = "mock" | "historical" | "traffic";
export interface BusRoute {
  id: string;
  origin: string;
  destination: string;
  baselineMinutes: number;
  source: DataSource;
}
export interface PredictionInput {
  routeId: string;
  date: string;
  departureTime: string;
}
export interface TravelTimeContext {
  route: BusRoute;
  multiplier: number;
  reasons: string[];
  source: DataSource;
}
export interface TravelTimeDataProvider {
  getContext(input: PredictionInput): Promise<TravelTimeContext>;
}
export interface PredictionResult {
  input: PredictionInput;
  route: BusRoute;
  durationMinutes: number;
  differenceMinutes: number;
  arrivalTime: string;
  arrivalDate: string;
  dayOffset: number;
  source: DataSource;
  reasons: string[];
}
export interface PredictionEngine {
  predict(input: PredictionInput): Promise<PredictionResult>;
}
export interface PredictionReport {
  selected: PredictionResult;
  hourly: PredictionResult[];
}
