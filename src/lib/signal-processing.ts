export type FilterType = 'moving_average' | 'median' | 'exponential';
export type SensorType = 'soil' | 'rain' | 'temp' | 'tank' | 'light';

export interface DataPoint {
  time: string;
  timestamp: number;
  raw: number;
  filtered: number | null;
}

// Simple moving average filter (N=5)
export function movingAverage(data: number[], windowSize: number = 5): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = data.slice(start, i + 1);
    const sum = window.reduce((acc, val) => acc + val, 0);
    result.push(sum / window.length);
  }
  return result;
}

// Simple median filter (N=5)
export function medianFilter(data: number[], windowSize: number = 5): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = data.slice(start, i + 1).sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    if (window.length % 2 === 0 && window.length >= 2) {
      result.push((window[mid - 1] + window[mid]) / 2);
    } else {
      result.push(window[mid]);
    }
  }
  return result;
}

// Exponential smoothing (alpha=0.3)
export function exponentialSmoothing(data: number[], alpha: number = 0.3): (number | null)[] {
  const result: (number | null)[] = [];
  if (data.length === 0) return result;
  
  result.push(data[0]); // First point is raw value
  for (let i = 1; i < data.length; i++) {
    const prev = result[i - 1] as number;
    result.push(alpha * data[i] + (1 - alpha) * prev);
  }
  return result;
}

// Apply selected filter
export function applyFilter(raw: number[], filter: FilterType): (number | null)[] {
  switch (filter) {
    case 'moving_average':
      return movingAverage(raw, 5); // N=5
    case 'median':
      return medianFilter(raw, 5); // N=5
    case 'exponential':
      return exponentialSmoothing(raw, 0.3); // alpha=0.3
    default:
      return raw;
  }
}

export function getSensorUnit(sensor: SensorType): string {
  switch (sensor) {
    case 'soil': return '%';
    case 'rain': return '';
    case 'temp': return '°C';
    case 'tank': return '%';
    case 'light': return '%';
    default: return '';
  }
}

export function getSensorLabel(sensor: SensorType): string {
  switch (sensor) {
    case 'soil': return 'SOIL MOISTURE';
    case 'rain': return 'RAIN SENSOR';
    case 'temp': return 'TEMPERATURE';
    case 'tank': return 'TANK LEVEL';
    case 'light': return 'LIGHT INTENSITY';
    default: return 'SENSOR';
  }
}
