/**
 * Botanical Lab Frontend API Client
 * Typed client connecting Next.js directly to the FastAPI backend.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Device {
  id: number;
  device_name: string;
  device_type: string;
  location: string;
  is_active: boolean;
  created_at: string;
}

export type SensorName = 'soil_moisture' | 'rain' | 'temperature' | 'tank_level' | 'light';

export interface SensorReading {
  id: number;
  device_id: number | null;
  timestamp: string;
  sensor: SensorName;
  raw_value: number;
  filtered_value: number;
  unit: string;
}

export interface AlertItem {
  id: number;
  device_id: number | null;
  timestamp: string;
  category: string | null;
  message: string;
  severity: 'normal' | 'warning' | 'alert';
  is_resolved: boolean;
  acknowledged: boolean;
  alert_type?: 'THRESHOLD' | 'FREQUENCY' | string;
  sensor?: SensorName | string | null;
  value?: number | null;
  threshold?: number | null;
}

export interface IrrigationEvent {
  id: number;
  device_id: number | null;
  timestamp: string;
  action: 'ON' | 'OFF';
  reason: string;
  soil_moisture: number | null;
  tank_level: number | null;
  mode: 'AUTO' | 'MANUAL';
}

export interface SystemSettings {
  id: number;
  device_id: number | null;
  auto_mode: boolean;
  soil_start_threshold: number;
  soil_stop_threshold: number;
  tank_minimum_threshold: number;
  high_temp_threshold?: number;
  debounce_samples?: number;
  cooldown_seconds?: number;
  updated_at: string;
}

export interface AlertSsePayload {
  id?: number;
  device_id?: number | null;
  timestamp?: string;
  category?: string | null;
  message?: string;
  severity?: 'normal' | 'warning' | 'alert';
  is_resolved?: boolean;
  acknowledged?: boolean;
  alert_type?: string;
  sensor?: string | null;
  value?: number | null;
  threshold?: number | null;
  status?: string;
}

export interface AlertSseEvent {
  event: 'connected' | 'alert_created' | 'alert_acknowledged' | 'alert_resolved';
  data: AlertSsePayload;
  timestamp?: string;
}

class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new ApiError(
        `API request failed (${res.status} ${res.statusText}): ${errorText || 'Unknown error'}`,
        res.status
      );
    }

    return await res.json();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(`Unable to connect to backend at ${API_BASE_URL}: ${message}`);
  }
}

export const api = {
  // Health check
  getHealth: async (): Promise<{ status: string; service?: string; database?: string }> => {
    return request<{ status: string; service?: string; database?: string }>('/health');
  },

  // Devices
  getDevices: async (): Promise<Device[]> => {
    return request<Device[]>('/api/devices');
  },

  getDevice: async (deviceId: number): Promise<Device> => {
    return request<Device>(`/api/devices/${deviceId}`);
  },

  createDevice: async (data: Omit<Device, 'id' | 'created_at'>): Promise<Device> => {
    return request<Device>('/api/devices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Sensor Readings (5 Sensors ONLY: soil_moisture, rain, temperature, tank_level, light)
  getLatestReadings: async (deviceId?: number, sensor?: SensorName): Promise<SensorReading[]> => {
    const params = new URLSearchParams();
    if (deviceId !== undefined) params.append('device_id', String(deviceId));
    if (sensor) params.append('sensor', sensor);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<SensorReading[]>(`/api/readings/latest${queryString}`);
  },

  getReadings: async (options: {
    deviceId?: number;
    sensor?: SensorName;
    limit?: number;
  } = {}): Promise<SensorReading[]> => {
    const params = new URLSearchParams();
    if (options.deviceId !== undefined && options.deviceId !== null) params.append('device_id', String(options.deviceId));
    if (options.sensor) params.append('sensor', options.sensor);
    if (options.limit) params.append('limit', String(options.limit));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<SensorReading[]>(`/api/readings${queryString}`);
  },

  createReading: async (data: {
    device_id?: number | null;
    sensor: SensorName;
    raw_value: number;
    filtered_value: number;
    unit: string;
  }): Promise<SensorReading> => {
    return request<SensorReading>('/api/readings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Alerts
  getAlerts: async (options: {
    deviceId?: number;
    isResolved?: boolean;
    acknowledged?: boolean;
    severity?: string;
    limit?: number;
  } = {}): Promise<AlertItem[]> => {
    const params = new URLSearchParams();
    if (options.deviceId !== undefined && options.deviceId !== null) params.append('device_id', String(options.deviceId));
    if (options.isResolved !== undefined) params.append('is_resolved', String(options.isResolved));
    if (options.acknowledged !== undefined) params.append('acknowledged', String(options.acknowledged));
    if (options.severity) params.append('severity', options.severity);
    if (options.limit) params.append('limit', String(options.limit));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<AlertItem[]>(`/api/alerts${queryString}`);
  },

  createAlert: async (data: {
    device_id?: number | null;
    category?: string | null;
    message: string;
    severity?: 'normal' | 'warning' | 'alert';
    is_resolved?: boolean;
    acknowledged?: boolean;
    alert_type?: string;
    sensor?: string | null;
    value?: number | null;
    threshold?: number | null;
  }): Promise<AlertItem> => {
    return request<AlertItem>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  acknowledgeAlert: async (alertId: number): Promise<AlertItem> => {
    return request<AlertItem>(`/api/alerts/${alertId}/acknowledge`, {
      method: 'PATCH',
    });
  },

  resolveAlert: async (alertId: number): Promise<AlertItem> => {
    return request<AlertItem>(`/api/alerts/${alertId}/resolve`, {
      method: 'PATCH',
    });
  },

  /**
   * Subscribe to live Server-Sent Events (SSE) from FastAPI /api/alerts/stream.
   * Returns an unsubscribe/cleanup function.
   */
  subscribeToAlerts: (
    onEvent: (event: AlertSseEvent) => void,
    onError?: (err: Event) => void
  ): (() => void) => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return () => {};
    }

    const sseUrl = `${API_BASE_URL}/api/alerts/stream`;
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const connect = () => {
      if (isCancelled) return;
      try {
        eventSource = new EventSource(sseUrl);

        eventSource.addEventListener('connected', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            onEvent({ event: 'connected', data: parsed });
          } catch {
            onEvent({ event: 'connected', data: { status: 'connected' } });
          }
        });

        eventSource.addEventListener('alert_created', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            onEvent({ event: 'alert_created', data: parsed.data || parsed, timestamp: parsed.timestamp });
          } catch (err) {
            console.error('Error parsing SSE alert_created payload:', err);
          }
        });

        eventSource.addEventListener('alert_acknowledged', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            onEvent({ event: 'alert_acknowledged', data: parsed.data || parsed, timestamp: parsed.timestamp });
          } catch (err) {
            console.error('Error parsing SSE alert_acknowledged payload:', err);
          }
        });

        eventSource.addEventListener('alert_resolved', (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            onEvent({ event: 'alert_resolved', data: parsed.data || parsed, timestamp: parsed.timestamp });
          } catch (err) {
            console.error('Error parsing SSE alert_resolved payload:', err);
          }
        });

        eventSource.onerror = (err) => {
          if (onError) onError(err);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isCancelled) {
            // Reconnect after 3 seconds
            reconnectTimer = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        console.warn('SSE connection initialization error:', err);
        if (!isCancelled) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  },

  // Irrigation Events
  getIrrigationEvents: async (options: {
    deviceId?: number;
    limit?: number;
  } = {}): Promise<IrrigationEvent[]> => {
    const params = new URLSearchParams();
    if (options.deviceId !== undefined && options.deviceId !== null) params.append('device_id', String(options.deviceId));
    if (options.limit) params.append('limit', String(options.limit));
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<IrrigationEvent[]>(`/api/irrigation-events${queryString}`);
  },

  createIrrigationEvent: async (data: {
    device_id?: number | null;
    action: 'ON' | 'OFF';
    reason: string;
    soil_moisture?: number | null;
    tank_level?: number | null;
    mode?: 'AUTO' | 'MANUAL';
  }): Promise<IrrigationEvent> => {
    return request<IrrigationEvent>('/api/irrigation-events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // System Settings
  getSettings: async (deviceId?: number): Promise<SystemSettings> => {
    const endpoint = deviceId !== undefined ? `/api/settings/${deviceId}` : '/api/settings';
    return request<SystemSettings>(endpoint);
  },

  updateSettings: async (
    settings: Partial<Omit<SystemSettings, 'id' | 'updated_at'>>,
    deviceId?: number
  ): Promise<SystemSettings> => {
    const endpoint = deviceId !== undefined ? `/api/settings/${deviceId}` : '/api/settings';
    return request<SystemSettings>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
};
