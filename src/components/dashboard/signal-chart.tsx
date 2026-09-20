"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  FilterType, 
  SensorType, 
  applyFilter,
  getSensorUnit,
  getSensorLabel
} from '@/lib/signal-processing';
import { api, SensorName } from '@/lib/api';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { format24hTimeIST } from '@/lib/date-utils';

interface SignalChartProps {
  deviceId?: number;
}

interface ChartDataPoint {
  time: string;
  timestamp: number;
  raw: number;
  filtered: number | null;
}

// Map from internal SensorType ('soil' | 'rain' | 'temp' | 'tank' | 'light') to backend SensorName
const sensorTypeToBackendMap: Record<SensorType, SensorName> = {
  soil: 'soil_moisture',
  rain: 'rain',
  temp: 'temperature',
  tank: 'tank_level',
  light: 'light',
};

export function SignalChart({ deviceId }: SignalChartProps) {
  const [sensor, setSensor] = useState<SensorType>('soil');
  const [filter, setFilter] = useState<FilterType>('moving_average');
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSensorHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const backendSensor = sensorTypeToBackendMap[sensor];
      const readings = await api.getReadings({
        deviceId: deviceId || undefined,
        sensor: backendSensor,
        limit: 80,
      });

      if (!readings || !Array.isArray(readings) || readings.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Backend returns newest first; sort chronologically (oldest to newest) for chart
      const chronological = [...readings].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const rawValues = chronological.map(r => Number(r.raw_value ?? 0));
      const computedFiltered = applyFilter(rawValues, filter);

      const chartPoints: ChartDataPoint[] = chronological.map((r, i) => {
        const timeStr = format24hTimeIST(r.timestamp);

        // Use the signal-processing computed filter for the selected filter algorithm
        const calcFiltered = computedFiltered[i];
        const finalFiltered = calcFiltered !== null && calcFiltered !== undefined
          ? Number(Number(calcFiltered).toFixed(2))
          : (r.filtered_value !== null && r.filtered_value !== undefined ? Number(Number(r.filtered_value).toFixed(2)) : null);

        const rawVal = Number(Number(r.raw_value ?? 0).toFixed(2));

        return {
          time: timeStr,
          timestamp: i,
          raw: rawVal,
          filtered: finalFiltered,
        };
      });

      setData(chartPoints);
    } catch (err: unknown) {
      console.error('Failed to load sensor telemetry history:', err);
      setError('Unable to load signal data from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSensorHistory();
  }, [sensor, filter, deviceId]);

  const unit = getSensorUnit(sensor);

  // Custom tooltip to match Botanical Lab theme
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-app-card border border-app-muted/20 p-3 rounded-sm shadow-lg">
          <p className="font-mono text-xs text-app-muted mb-2 border-b border-app-muted/20 pb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center space-x-4 justify-between text-xs font-mono mb-1">
              <span className="uppercase tracking-widest" style={{ color: entry.color }}>{entry.name}</span>
              <span className="text-app-primary">{entry.value} {unit}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col w-full h-full p-0 overflow-hidden">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-4 lg:p-6 border-b border-app-muted/10 gap-4">
        <div>
          <h2 className="text-sm font-bold tracking-[0.2em] text-app-primary font-sans leading-none">
            SIGNAL ANALYSIS
          </h2>
          <span className="text-[10px] text-app-muted uppercase tracking-widest mt-1.5 leading-none block">
            RAW VS FILTERED SENSOR SIGNAL
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* Sensor Select */}
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest text-app-muted mb-1">SENSOR</span>
            <div className="relative">
              <select 
                value={sensor}
                onChange={(e) => setSensor(e.target.value as SensorType)}
                className="appearance-none bg-app-bg tech-border text-app-primary font-mono text-xs px-3 py-1.5 pr-8 rounded-sm w-full sm:w-40 focus:outline-none focus:border-app-signal transition-colors"
              >
                <option value="soil">SOIL MOISTURE</option>
                <option value="rain">RAIN SENSOR</option>
                <option value="temp">TEMPERATURE</option>
                <option value="tank">TANK LEVEL</option>
                <option value="light">LIGHT INTENSITY</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-app-muted pointer-events-none" />
            </div>
          </div>

          {/* Filter Select */}
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest text-app-muted mb-1">FILTER</span>
            <div className="relative">
              <select 
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
                className="appearance-none bg-app-bg tech-border text-app-primary font-mono text-xs px-3 py-1.5 pr-8 rounded-sm w-full sm:w-48 focus:outline-none focus:border-app-signal transition-colors"
              >
                <option value="moving_average">MOVING AVERAGE (N=5)</option>
                <option value="median">MEDIAN FILTER (N=5)</option>
                <option value="exponential">EXPONENTIAL (α=0.3)</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-app-muted pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full h-[300px] sm:h-[400px] p-4 pt-6 relative">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-app-signal" />
          </div>
        ) : error ? (
          <div className="w-full h-full flex flex-col items-center justify-center space-y-2 text-center">
            <span className="font-mono text-xs text-[#E5675B]">{error}</span>
            <button
              onClick={fetchSensorHistory}
              className="text-[10px] font-mono uppercase tracking-wider text-app-signal underline"
            >
              Retry
            </button>
          </div>
        ) : data.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-6">
            <span className="font-mono text-xs text-app-muted uppercase tracking-widest">
              NO HISTORICAL TELEMETRY FOUND
            </span>
            <span className="font-mono text-[10px] text-app-muted/60 mt-1">
              Awaiting telemetry ingestion for {getSensorLabel(sensor)}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#7FA08C" strokeOpacity={0.1} vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#7FA08C" 
                tick={{ fill: '#7FA08C', fontSize: 10, fontFamily: 'monospace' }}
                tickMargin={10}
                minTickGap={30}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                stroke="#7FA08C" 
                tick={{ fill: '#7FA08C', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(val) => `${val}${unit === '%' || unit === '°C' ? unit : ''}`}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                height={36}
                iconType="circle"
                wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.1em' }}
              />
              <Line 
                type="monotone" 
                dataKey="raw" 
                name="RAW"
                stroke="#F5B942" 
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
              <Line 
                type="monotone" 
                dataKey="filtered" 
                name="FILTERED"
                stroke="#B6F04A" 
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-app-bg/50 border-t border-app-muted/10 p-3 px-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">SAMPLES</span>
          <span className="text-xs text-app-primary font-mono mt-0.5">{data.length}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">DATABASE</span>
          <span className="text-xs text-app-signal font-mono mt-0.5">POSTGRESQL</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">FILTER</span>
          <span className="text-xs text-app-primary font-mono mt-0.5 uppercase">
            {filter.replace('_', ' ')} · {filter === 'exponential' ? 'α=0.3' : 'N=5'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-widest text-app-muted font-mono">SIGNAL</span>
          <span className="text-xs text-app-primary font-mono mt-0.5 uppercase">
            {getSensorLabel(sensor)}
          </span>
        </div>
      </div>
    </Card>
  );
}
