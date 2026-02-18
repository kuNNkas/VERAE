type TelemetryPayload = Record<string, unknown>;

export type TelemetryAdapter = {
  track: (event: string, payload?: TelemetryPayload) => void;
};

let adapter: TelemetryAdapter | null = null;

export function setTelemetryAdapter(nextAdapter: TelemetryAdapter | null) {
  adapter = nextAdapter;
}

export function trackEvent(event: string, payload: TelemetryPayload = {}) {
  if (adapter) {
    adapter.track(event, payload);
    return;
  }

  console.info("[telemetry]", { event, ...payload });
}

