import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useQueue } from '../hooks/useQueue';
import { ReportCard } from '../components/ReportCard';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface OutboxScreenProps {
  onNavigateToCompose: () => void;
}

export const OutboxScreen: React.FC<OutboxScreenProps> = ({ onNavigateToCompose }) => {
  const { reports, retryReport, deleteReport, inFlightCount, pendingCount, deliveredCount, failedCount } = useQueue();
  const { isOnline, is2G } = useNetworkStatus();
  const [filter, setFilter] = useState<'all' | 'in_flight' | 'delivered' | 'failed'>('all');

  const filteredReports = reports.filter(r => {
    if (filter === 'in_flight') return r.status === 'processing' || r.status === 'queued';
    if (filter === 'delivered') return r.status === 'delivered';
    if (filter === 'failed') return r.status === 'failed';
    return true;
  });

  const retryAllFailed = () => {
    reports
      .filter(r => r.status === 'failed')
      .forEach(r => retryReport(r.id));
  };

  return (
    <View style={styles.container}>
      {/* Network Alert Banner when Offline */}
      {!isOnline ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📡 Network Disconnected: Uploads safely paused on device. Resuming automatically once connected.
          </Text>
        </View>
      ) : is2G ? (
        <View style={styles.slowLinkBanner}>
          <Text style={styles.slowLinkText}>
            ⏳ 2G Network: Transmitting incrementally over slow link. Please keep device on.
          </Text>
        </View>
      ) : null}

      {/* Filter Chips Header */}
      <View style={styles.chipsRow}>
        <TouchableOpacity
          style={[styles.chip, filter === 'all' && styles.chipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>
            All ({reports.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.chip, filter === 'in_flight' && styles.chipActive]}
          onPress={() => setFilter('in_flight')}
        >
          <Text style={[styles.chipText, filter === 'in_flight' && styles.chipTextActive]}>
            Active ({inFlightCount + pendingCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.chip, filter === 'delivered' && styles.chipActive]}
          onPress={() => setFilter('delivered')}
        >
          <Text style={[styles.chipText, filter === 'delivered' && styles.chipTextActive]}>
            Delivered ({deliveredCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.chip, filter === 'failed' && styles.chipActive]}
          onPress={() => setFilter('failed')}
        >
          <Text style={[styles.chipText, filter === 'failed' && styles.chipTextActive]}>
            Paused ({failedCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Retry All button if multiple failed */}
      {failedCount > 0 ? (
        <View style={styles.actionHeader}>
          <Text style={styles.actionHeaderMsg}>
            {failedCount} report(s) paused due to network errors.
          </Text>
          <TouchableOpacity style={styles.retryAllBtn} onPress={retryAllFailed}>
            <Text style={styles.retryAllBtnText}>Retry All</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Reports List */}
      <FlatList
        data={filteredReports}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ReportCard
            report={item}
            onRetry={retryReport}
            onDelete={deleteReport}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>Outbox is Empty</Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'all'
                ? 'No reports submitted yet. Compose your first report to test delivery guarantees.'
                : `No reports in the '${filter}' filter.`}
            </Text>
            {filter === 'all' ? (
              <TouchableOpacity style={styles.composeBtn} onPress={onNavigateToCompose}>
                <Text style={styles.composeBtnText}>Compose New Report</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F4F3',
  },
  offlineBanner: {
    backgroundColor: '#FAE8E7',
    borderBottomWidth: 1,
    borderBottomColor: '#C4453D',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineText: {
    color: '#C4453D',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  slowLinkBanner: {
    backgroundColor: '#FBEFDF',
    borderBottomWidth: 1,
    borderBottomColor: '#E08A34',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  slowLinkText: {
    color: '#E08A34',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#FBFCFC',
    borderBottomWidth: 1,
    borderBottomColor: '#D3DBD8',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F4F3',
    borderWidth: 1,
    borderColor: '#D3DBD8',
  },
  chipActive: {
    backgroundColor: '#16212C',
    borderColor: '#16212C',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#41505E',
  },
  chipTextActive: {
    color: '#FBFCFC',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FBEFDF',
    borderBottomWidth: 1,
    borderBottomColor: '#E08A34',
  },
  actionHeaderMsg: {
    fontSize: 12,
    color: '#E08A34',
    fontWeight: '600',
    flex: 1,
  },
  retryAllBtn: {
    backgroundColor: '#E08A34',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  retryAllBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16212C',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7A8894',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  composeBtn: {
    backgroundColor: '#2E7BD6',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  composeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
