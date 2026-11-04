import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ProgressBarProps {
  progress: number; // 0 to 1
  label?: string;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  color = '#2E7BD6'
}) => {
  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <View style={styles.container}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.percentText}>{percent}%</Text>
        </View>
      ) : null}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: '#7A8894',
    fontFamily: 'monospace',
  },
  percentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#41505E',
    fontFamily: 'monospace',
  },
  track: {
    height: 6,
    backgroundColor: '#E3E8E6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
