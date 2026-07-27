import React, { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface SparklineProps {
  values: number[];
  /** Line + area colour. */
  color: string;
  /** Endpoint dot colour (defaults to the line colour). */
  endColor?: string;
  height?: number;
  strokeWidth?: number;
}

/**
 * A tiny trend line with a soft area fill and an emphasised endpoint — the
 * "is today good?" glance. Measures its own width so the line fills the space and
 * the endpoint dot stays round. Built on react-native-svg.
 */
export function Sparkline({ values, color, endColor, height = 40, strokeWidth = 2.2 }: SparklineProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const n = values.length;
  const max = Math.max(...values, 1);
  const pad = strokeWidth + 2; // keep the line/dot off the edges

  const points = values.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * width : 0;
    const y = pad + (1 - v / max) * (height - pad * 2);
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = width > 0 ? `${line} L${width.toFixed(1)},${height} L0,${height} Z` : '';
  const end = points[points.length - 1];
  const gradientId = 'sparkfill';

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.3} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gradientId})`} />
          <Path d={line} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {end ? <Circle cx={end.x} cy={end.y} r={strokeWidth + 1.4} fill={endColor ?? color} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
