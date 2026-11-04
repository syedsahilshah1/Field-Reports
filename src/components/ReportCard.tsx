import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Report } from '../types';
import { ImageThumbnail } from './ImageThumbnail';
import { ProgressBar } from './ProgressBar';

interface ReportCardProps {
  report: Report;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ReportCard: React.FC<ReportCardProps> = ({ report, onRetry, onDelete }) => {
  const dateStr = new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Compute overall delivery progress
  const uploadedCount = report.images.filter(i => i.status === 'uploaded').length;
  const totalCount = report.images.length;
  const progressRatio = totalCount > 0 ? uploadedCount / totalCount : 0;

  // Render honest status banner
  const renderStatusBadge = () => {
    switch (report.status) {
      case 'delivered':
        return (
          <View style={[styles.badge, styles.badgeDelivered]}>
            <Text style={styles.badgeDeliveredText}>✓ Confirmed On Server</Text>
          </View>
        );
      case 'processing': {
        const activeUploading = report.images.find(i => i.status === 'uploading');
        const activeCompressing = report.images.find(i => i.status === 'compressing');
        return (
          <View style={[styles.badge, styles.badgeProcessing]}>
            <ActivityIndicator size="small" color="#2E7BD6" style={{ marginRight: 6 }} />
            <Text style={styles.badgeProcessingText}>
              {activeCompressing
                ? 'Compressing photo...'
                : activeUploading
                ? `Uploading photo ${uploadedCount + 1} of ${totalCount}...`
                : 'Connecting to server...'}
            </Text>
          </View>
        );
      }
      case 'queued':
        return (
          <View style={[styles.badge, styles.badgeQueued]}>
            <Text style={styles.badgeQueuedText}>Saved to device &bull; Queued for delivery</Text>
          </View>
        );
      case 'failed': {
        const isScheduled = report.nextRetryAt && report.nextRetryAt > Date.now();
        const secondsRemaining = isScheduled ? Math.max(1, Math.round((report.nextRetryAt! - Date.now()) / 1000)) : 0;
        return (
          <View style={[styles.badge, styles.badgeFailed]}>
            <Text style={styles.badgeFailedText}>
              {isScheduled
                ? `Retrying in ${secondsRemaining}s (attempt ${report.retryCount}/${report.maxRetries})`
                : report.isTerminalError
                ? 'Delivery rejected by destination'
                : 'Delivery paused (network dropped)'}
            </Text>
          </View>
        );
      }
      default:
        return null;
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.timeText}>{dateStr}</Text>
          <Text style={styles.idText}>ID: {report.id.substring(0, 8)}</Text>
        </View>
        {renderStatusBadge()}
      </View>

      <Text style={styles.description}>{report.description}</Text>

      {/* Progress Bar during flight */}
      {report.status === 'processing' || (report.status === 'failed' && uploadedCount > 0) ? (
        <ProgressBar
          progress={progressRatio}
          label={`Progress: ${uploadedCount}/${totalCount} photos delivered`}
          color={report.status === 'failed' ? '#E08A34' : '#2E7BD6'}
        />
      ) : null}

      {/* Thumbnails Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
        {report.images.map((img, idx) => (
          <ImageThumbnail
            key={img.id}
            image={img}
            index={idx}
            showStatusOverlay={report.status !== 'delivered'}
          />
        ))}
      </ScrollView>

      {/* Diagnostic Error Banner with Retry button if failed */}
      {report.status === 'failed' ? (
        <View style={styles.errorBox}>
          <View style={styles.errorTextRow}>
            <Text style={styles.errorLabel}>Reason:</Text>
            <Text style={styles.errorReason}>{report.lastError || 'Connection failure'}</Text>
          </View>
          <View style={styles.errorActions}>
            <TouchableOpacity style={styles.retryButton} onPress={() => onRetry(report.id)}>
              <Text style={styles.retryButtonText}>Retry Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(report.id)}>
              <Text style={styles.deleteButtonText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FBFCFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D3DBD8',
    padding: 16,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16212C',
  },
  idText: {
    fontSize: 11,
    color: '#7A8894',
    fontFamily: 'monospace',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeDelivered: {
    backgroundColor: '#E4F3EB',
    borderWidth: 1,
    borderColor: '#2F9160',
  },
  badgeDeliveredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2F9160',
  },
  badgeProcessing: {
    backgroundColor: '#E7F0FB',
    borderWidth: 1,
    borderColor: '#2E7BD6',
  },
  badgeProcessingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7BD6',
  },
  badgeQueued: {
    backgroundColor: '#F1F4F3',
    borderWidth: 1,
    borderColor: '#D3DBD8',
  },
  badgeQueuedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#41505E',
  },
  badgeFailed: {
    backgroundColor: '#FBEFDF',
    borderWidth: 1,
    borderColor: '#E08A34',
  },
  badgeFailedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E08A34',
  },
  description: {
    fontSize: 15,
    color: '#16212C',
    marginVertical: 6,
    lineHeight: 20,
  },
  imagesRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  errorBox: {
    backgroundColor: '#FAE8E7',
    borderWidth: 1,
    borderColor: '#C4453D',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  errorTextRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  errorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C4453D',
    marginRight: 6,
  },
  errorReason: {
    fontSize: 12,
    color: '#7A8894',
    flex: 1,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  retryButton: {
    backgroundColor: '#2E7BD6',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#E3E8E6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: '#41505E',
    fontSize: 12,
    fontWeight: '600',
  },
});
