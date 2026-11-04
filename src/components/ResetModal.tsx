import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';

interface ResetModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (resetServerAlso: boolean) => Promise<void>;
}

export const ResetModal: React.FC<ResetModalProps> = ({ visible, onCancel, onConfirm }) => {
  const [resetServerAlso, setResetServerAlso] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(resetServerAlso);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>

          <Text style={styles.title}>Start Over (Deliberate Reset)</Text>
          <Text style={styles.subtitle}>Explicitly defined blast radius:</Text>

          <View style={styles.radiusBox}>
            <Text style={styles.radiusHeader}>Local Device (Immediate):</Text>
            <Text style={styles.radiusItem}>• All outbox and queued report records will be deleted.</Text>
            <Text style={styles.radiusItem}>• All persistent photos copied to device storage will be unlinked.</Text>
            <Text style={styles.radiusItem}>• Any active draft description and selected photos will be cleared.</Text>
          </View>

          <TouchableOpacity
            style={styles.checkboxRow}
            activeOpacity={0.8}
            onPress={() => setResetServerAlso(!resetServerAlso)}
          >
            <View style={[styles.checkbox, resetServerAlso && styles.checkboxActive]}>
              {resetServerAlso ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkboxLabel}>Wipe Server Storage Also</Text>
              <Text style={styles.checkboxSubtext}>Delete confirmed reports and files on the backend.</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dangerButton} onPress={handleConfirm} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.dangerText}>Execute Reset</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 33, 44, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FBFCFC',
    borderRadius: 16,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#D3DBD8',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#16212C',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#7A8894',
    textAlign: 'center',
    marginBottom: 16,
  },
  radiusBox: {
    backgroundColor: '#FAE8E7',
    borderWidth: 1,
    borderColor: '#C4453D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  radiusHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C4453D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  radiusItem: {
    fontSize: 13,
    color: '#41505E',
    marginBottom: 3,
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F1F4F3',
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D3DBD8',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#7A8894',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: '#C4453D',
    borderColor: '#C4453D',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16212C',
  },
  checkboxSubtext: {
    fontSize: 12,
    color: '#7A8894',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E3E8E6',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#41505E',
  },
  dangerButton: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#C4453D',
    alignItems: 'center',
  },
  dangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
