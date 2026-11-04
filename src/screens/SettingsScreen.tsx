import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { getServerUrl, setServerUrl } from '../services/storage';
import { apiCheckHealth, apiUpdateChaosConfig, apiGetChaosConfig, apiResetServer } from '../services/apiClient';
import { queueEngine } from '../services/uploadQueue';
import { ResetModal } from '../components/ResetModal';
import { ChaosConfig } from '../types';

interface SettingsScreenProps {
  onResetComplete: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onResetComplete }) => {
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [urlStatus, setUrlStatus] = useState<'success' | 'failed' | null>(null);
  const [chaos, setChaos] = useState<ChaosConfig | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [chaosLoading, setChaosLoading] = useState(false);

  useEffect(() => {
    getServerUrl().then(url => {
      setServerUrlInput(url);
      loadChaos();
    });
  }, []);

  const loadChaos = async () => {
    try {
      const cfg = await apiGetChaosConfig();
      setChaos(cfg);
    } catch (e) {}
  };

  const handleSaveUrl = async () => {
    const trimmed = serverUrlInput.trim().replace(/\/$/, ''); // Remove trailing slash
    await setServerUrl(trimmed);
    setServerUrlInput(trimmed);
    testConnection(trimmed);
  };

  const testConnection = async (urlToCheck?: string) => {
    setIsTestingUrl(true);
    setUrlStatus(null);
    try {
      const ok = await apiCheckHealth();
      setUrlStatus(ok ? 'success' : 'failed');
      if (ok) loadChaos();
    } catch (e) {
      setUrlStatus('failed');
    } finally {
      setIsTestingUrl(false);
    }
  };

  const applyChaosPreset = async (presetName: string, presetConfig: Partial<ChaosConfig>) => {
    setChaosLoading(true);
    try {
      const updated = await apiUpdateChaosConfig(presetConfig);
      setChaos(updated);
      Alert.alert('Chaos Preset Applied', `Server is now configured in: ${presetName}`);
    } catch (err: any) {
      Alert.alert('Chaos Update Failed', err.message || 'Make sure backend server is running');
    } finally {
      setChaosLoading(false);
    }
  };

  const handleExecuteReset = async (resetServerAlso: boolean) => {
    // 1. Wipe local engine queue, disk storage, persistent images, and drafts
    await queueEngine.resetAll();

    // 2. Wipe server storage if requested
    if (resetServerAlso) {
      try {
        await apiResetServer();
      } catch (err) {
        console.warn('Could not reset server:', err);
      }
    }

    setShowResetModal(false);
    Alert.alert('Reset Complete', 'Device outbox, persistent storage, and drafts have been wiped.');
    onResetComplete();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Backend URL Configuration */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend Server Configuration</Text>
        <Text style={styles.cardSubtitle}>
          Destination where reports and images are delivered. (Use 10.0.2.2 for Android emulator, LAN IP for physical device)
        </Text>

        <TextInput
          style={styles.input}
          value={serverUrlInput}
          onChangeText={setServerUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://10.0.2.2:3001"
          placeholderTextColor="#7A8894"
        />

        <View style={styles.urlButtonsRow}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl} disabled={isTestingUrl}>
            <Text style={styles.saveBtnText}>Save URL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.testBtn} onPress={() => testConnection()} disabled={isTestingUrl}>
            {isTestingUrl ? (
              <ActivityIndicator size="small" color="#41505E" />
            ) : (
              <Text style={styles.testBtnText}>Test Ping</Text>
            )}
          </TouchableOpacity>
        </View>

        {urlStatus === 'success' ? (
          <Text style={styles.urlSuccess}>✓ Connected to server successfully!</Text>
        ) : urlStatus === 'failed' ? (
          <Text style={styles.urlFailed}>✕ Cannot reach server at this address</Text>
        ) : null}
      </View>

      {/* Chaos Simulator Presets */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Failure Simulator (Make It Fail)</Text>
        <Text style={styles.cardSubtitle}>
          Test delivery guarantees against live network failure conditions:
        </Text>

        {chaos ? (
          <View style={styles.chaosStatusBox}>
            <Text style={styles.chaosStatusText}>
              Current Server State: Latency {chaos.latencyMs}ms | Drop {chaos.dropRate}% | 500 Fail {chaos.failRate}% | Black Hole: {chaos.blackHole ? 'ON' : 'OFF'}
            </Text>
          </View>
        ) : null}

        <View style={styles.presetGrid}>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => applyChaosPreset('Normal Fast', { latencyMs: 0, dropRate: 0, failRate: 0, blackHole: false, rateLimit: false })}
            disabled={chaosLoading}
          >
            <Text style={styles.presetTitle}>Normal Fast</Text>
            <Text style={styles.presetDesc}>0ms delay, 0% failure</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetBtn, styles.preset2G]}
            onPress={() => applyChaosPreset('2G Remote Site', { latencyMs: 1800, dropRate: 0, failRate: 0, blackHole: false, rateLimit: false })}
            disabled={chaosLoading}
          >
            <Text style={[styles.presetTitle, { color: '#E08A34' }]}>Simulate 2G Network</Text>
            <Text style={styles.presetDesc}>1800ms throttled latency</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetBtn, styles.presetDrop]}
            onPress={() => applyChaosPreset('Dying Socket', { dropRate: 40, latencyMs: 500, failRate: 0, blackHole: false, rateLimit: false })}
            disabled={chaosLoading}
          >
            <Text style={[styles.presetTitle, { color: '#C4453D' }]}>Dying Sockets (40%)</Text>
            <Text style={styles.presetDesc}>Abrupt TCP disconnects</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.presetBtn, styles.preset500]}
            onPress={() => applyChaosPreset('Server 500 Errors', { failRate: 35, latencyMs: 300, dropRate: 0, blackHole: false, rateLimit: false })}
            disabled={chaosLoading}
          >
            <Text style={[styles.presetTitle, { color: '#8B5CF6' }]}>Server 500 Errors (35%)</Text>
            <Text style={styles.presetDesc}>Triggers exponential backoff</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.webDashboardNote}>
          Tip: You can also open the Web Dashboard at <Text style={{ fontFamily: 'monospace' }}>{serverUrlInput}/dashboard</Text> on any computer on your network.
        </Text>
      </View>

      {/* 04 Start Over (Deliberate Reset) */}
      <View style={[styles.card, styles.resetCard]}>
        <Text style={[styles.cardTitle, { color: '#C4453D' }]}>04 Start Over</Text>
        <Text style={styles.cardSubtitle}>
          Deliberate reset of the application state. Wipes local queue and device storage.
        </Text>

        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => setShowResetModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.resetButtonText}>Trigger Start Over (Reset)</Text>
        </TouchableOpacity>
      </View>

      <ResetModal
        visible={showResetModal}
        onCancel={() => setShowResetModal(false)}
        onConfirm={handleExecuteReset}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F4F3',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FBFCFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D3DBD8',
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16212C',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#7A8894',
    marginBottom: 12,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D3DBD8',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#16212C',
    backgroundColor: '#FFFFFF',
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  urlButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#16212C',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  testBtn: {
    paddingHorizontal: 16,
    backgroundColor: '#E3E8E6',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtnText: {
    color: '#41505E',
    fontSize: 13,
    fontWeight: '600',
  },
  urlSuccess: {
    color: '#2F9160',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  urlFailed: {
    color: '#C4453D',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  chaosStatusBox: {
    backgroundColor: '#F1F4F3',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  chaosStatusText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#41505E',
  },
  presetGrid: {
    gap: 8,
  },
  presetBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D3DBD8',
    borderRadius: 8,
    padding: 10,
  },
  preset2G: {
    borderColor: '#E08A34',
    backgroundColor: '#FBEFDF',
  },
  presetDrop: {
    borderColor: '#C4453D',
    backgroundColor: '#FAE8E7',
  },
  preset500: {
    borderColor: '#8B5CF6',
    backgroundColor: '#F3E8FF',
  },
  presetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16212C',
  },
  presetDesc: {
    fontSize: 11,
    color: '#7A8894',
    marginTop: 2,
  },
  webDashboardNote: {
    fontSize: 11,
    color: '#7A8894',
    marginTop: 12,
    lineHeight: 15,
  },
  resetCard: {
    borderColor: '#C4453D',
  },
  resetButton: {
    backgroundColor: '#C4453D',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
