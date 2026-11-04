import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useServerReports } from '../hooks/useServerReports';
import { getServerUrl } from '../services/storage';

export const ReviewScreen: React.FC = () => {
  const { reports, loading, error, refresh } = useServerReports();
  const [serverHost, setServerHost] = React.useState('');

  React.useEffect(() => {
    getServerUrl().then(setServerHost);
  }, []);

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 KB';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoBanner}>
        <Text style={styles.infoTitle}>SERVER REVIEW</Text>
        <Text style={styles.infoText}>
          Displaying reports fetched directly from {serverHost}/api/reports (proves data safely landed at destination, not read from local memory).
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Cannot Reach Server</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={refresh}>
            <Text style={styles.refreshBtnText}>Try Reconnecting</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={reports}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} colors={['#2E7BD6']} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const dateStr = new Date(item.createdAt).toLocaleString();
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardId}>ID: {item.id}</Text>
                  <Text style={styles.cardDate}>{dateStr}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {item.status === 'delivered' ? '✓ Server Delivered' : 'Pending Photos'}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardDescription}>{item.description}</Text>

              <Text style={styles.photoCount}>
                Server photos: {item.images ? item.images.length : 0} of {item.expectedImagesCount} received
              </Text>

              {/* Images Row */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
                {(item.images || []).map((img, idx) => {
                  const fullUrl = img.url.startsWith('http') ? img.url : `${serverHost}${img.url}`;
                  return (
                    <View key={img.imageId || idx} style={styles.thumbWrap}>
                      <Image source={{ uri: fullUrl }} style={styles.thumbImage} resizeMode="cover" />
                      <View style={styles.thumbBadge}>
                        <Text style={styles.thumbBadgeText}>{formatSize(img.size)}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>☁️</Text>
              <Text style={styles.emptyTitle}>No Server Reports Yet</Text>
              <Text style={styles.emptySubtitle}>
                The server storage is currently empty. Submit a report from the Compose tab, and once delivered it will appear here.
              </Text>
              <TouchableOpacity style={styles.refreshBtn} onPress={refresh}>
                <Text style={styles.refreshBtnText}>Refresh Server State</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#2E7BD6" />
              <Text style={{ marginTop: 10, color: '#7A8894', fontSize: 13 }}>Querying server...</Text>
            </View>
          )
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
  infoBanner: {
    backgroundColor: '#E7F0FB',
    borderBottomWidth: 1,
    borderBottomColor: '#2E7BD6',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7BD6',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoText: {
    fontSize: 12,
    color: '#41505E',
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#FAE8E7',
    borderWidth: 1,
    borderColor: '#C4453D',
    borderRadius: 8,
    margin: 16,
    padding: 14,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C4453D',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#41505E',
    marginBottom: 10,
  },
  refreshBtn: {
    backgroundColor: '#2E7BD6',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  refreshBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FBFCFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D3DBD8',
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16212C',
    fontFamily: 'monospace',
  },
  cardDate: {
    fontSize: 11,
    color: '#7A8894',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: '#E4F3EB',
    borderWidth: 1,
    borderColor: '#2F9160',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: {
    color: '#2F9160',
    fontSize: 11,
    fontWeight: '700',
  },
  cardDescription: {
    fontSize: 15,
    color: '#16212C',
    marginVertical: 6,
  },
  photoCount: {
    fontSize: 12,
    color: '#7A8894',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  imagesRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  thumbWrap: {
    width: 90,
    height: 90,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 10,
    backgroundColor: '#E3E8E6',
    borderWidth: 1,
    borderColor: '#D3DBD8',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(22, 33, 44, 0.85)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  thumbBadgeText: {
    color: '#FBFCFC',
    fontSize: 9,
    fontFamily: 'monospace',
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
});
