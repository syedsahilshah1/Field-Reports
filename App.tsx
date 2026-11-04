import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Header } from './src/components/Header';
import { ComposeScreen } from './src/screens/ComposeScreen';
import { OutboxScreen } from './src/screens/OutboxScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useQueue } from './src/hooks/useQueue';
import { queueEngine } from './src/services/uploadQueue';

type Tab = 'compose' | 'outbox' | 'review' | 'settings';

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('compose');
  const { pendingCount, inFlightCount, failedCount } = useQueue();

  useEffect(() => {
    // Initialize headless engine on launch
    queueEngine.initialize();
  }, []);

  const activeWorkCount = pendingCount + inFlightCount + failedCount;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" />

        <Header
          title="Field Reports"
          subtitle="2G Resilient Mobile Delivery"
        />

        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.contentContainer}>
            {activeTab === 'compose' && (
              <ComposeScreen onReportSubmitted={() => setActiveTab('outbox')} />
            )}
            {activeTab === 'outbox' && (
              <OutboxScreen onNavigateToCompose={() => setActiveTab('compose')} />
            )}
            {activeTab === 'review' && <ReviewScreen />}
            {activeTab === 'settings' && (
              <SettingsScreen onResetComplete={() => setActiveTab('compose')} />
            )}
          </View>
        </KeyboardAvoidingView>

        {/* Bottom Tab Bar */}
        <SafeAreaView style={styles.tabBar} edges={['bottom']}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'compose' && styles.tabButtonActive]}
            onPress={() => setActiveTab('compose')}
            activeOpacity={0.7}
          >
            <Text style={styles.tabIcon}>📝</Text>
            <Text style={[styles.tabLabel, activeTab === 'compose' && styles.tabLabelActive]}>
              Compose
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'outbox' && styles.tabButtonActive]}
            onPress={() => setActiveTab('outbox')}
            activeOpacity={0.7}
          >
            <View style={styles.tabIconWrap}>
              <Text style={styles.tabIcon}>📤</Text>
              {activeWorkCount > 0 ? (
                <View style={[styles.tabBadge, failedCount > 0 && styles.tabBadgeFailed]}>
                  <Text style={styles.tabBadgeText}>{activeWorkCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tabLabel, activeTab === 'outbox' && styles.tabLabelActive]}>
              Outbox
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'review' && styles.tabButtonActive]}
            onPress={() => setActiveTab('review')}
            activeOpacity={0.7}
          >
            <Text style={styles.tabIcon}>🌐</Text>
            <Text style={[styles.tabLabel, activeTab === 'review' && styles.tabLabelActive]}>
              Review
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'settings' && styles.tabButtonActive]}
            onPress={() => setActiveTab('settings')}
            activeOpacity={0.7}
          >
            <Text style={styles.tabIcon}>⚙️</Text>
            <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
              Settings
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#16212C',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F1F4F3',
  },
  contentContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FBFCFC',
    borderTopWidth: 1,
    borderTopColor: '#D3DBD8',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#E7F0FB',
    borderRadius: 8,
    marginVertical: 4,
    marginHorizontal: 6,
  },
  tabIconWrap: {
    position: 'relative',
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A8894',
  },
  tabLabelActive: {
    color: '#2E7BD6',
    fontWeight: '700',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#2E7BD6',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeFailed: {
    backgroundColor: '#E08A34',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
