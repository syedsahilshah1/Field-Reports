import React from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ReportImage } from '../types';

interface ImageThumbnailProps {
  image: ReportImage;
  index: number;
  onRemove?: () => void;
  showStatusOverlay?: boolean;
}

export const ImageThumbnail: React.FC<ImageThumbnailProps> = ({
  image,
  index,
  onRemove,
  showStatusOverlay = false
}) => {
  const formatSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  const getStatusBadge = () => {
    switch (image.status) {
      case 'uploaded':
        return <Text style={styles.badgeSuccess}>✓ Uploaded</Text>;
      case 'uploading':
        return (
          <View style={styles.badgeUploading}>
            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.badgeText}>Sending...</Text>
          </View>
        );
      case 'compressing':
        return <Text style={styles.badgeCompressing}>Compressing</Text>;
      case 'failed':
        return <Text style={styles.badgeFailed}>! Failed</Text>;
      case 'compressed':
        return <Text style={styles.badgeReady}>Ready</Text>;
      default:
        return <Text style={styles.badgePending}>Queued</Text>;
    }
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: image.localUri }} style={styles.image} resizeMode="cover" />

      {/* Index indicator */}
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>

      {/* Size Badge */}
      <View style={styles.sizeBadge}>
        <Text style={styles.sizeText}>
          {image.compressedSize > 0 && image.compressedSize !== image.originalSize
            ? `${formatSize(image.compressedSize)}`
            : formatSize(image.originalSize)}
        </Text>
      </View>

      {/* Status Overlay */}
      {showStatusOverlay ? (
        <View style={styles.statusOverlay}>
          {getStatusBadge()}
        </View>
      ) : null}

      {/* Remove Button for Compose screen */}
      {onRemove ? (
        <TouchableOpacity style={styles.removeButton} onPress={onRemove} activeOpacity={0.7}>
          <Text style={styles.removeText}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 96,
    height: 96,
    borderRadius: 8,
    marginRight: 10,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#E3E8E6',
    borderWidth: 1,
    borderColor: '#D3DBD8',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  indexBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(22, 33, 44, 0.75)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    color: '#FBFCFC',
    fontSize: 10,
    fontWeight: '700',
  },
  sizeBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(22, 33, 44, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  sizeText: {
    color: '#FBFCFC',
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  statusOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
  },
  badgeSuccess: {
    backgroundColor: '#2F9160',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeUploading: {
    backgroundColor: '#2E7BD6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeCompressing: {
    backgroundColor: '#E08A34',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeReady: {
    backgroundColor: '#41505E',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeFailed: {
    backgroundColor: '#C4453D',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgePending: {
    backgroundColor: '#7A8894',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(196, 69, 61, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 13,
  },
});
