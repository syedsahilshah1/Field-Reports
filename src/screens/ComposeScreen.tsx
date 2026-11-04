import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  PermissionsAndroid,
  Linking,
  AppState,
  ActivityIndicator
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Report, ReportImage } from '../types';
import { CONFIG } from '../constants/config';
import { copyToPersistentStorage, deleteImageFile } from '../services/fileSystem';
import { saveDraft, loadDraft } from '../services/storage';
import { queueEngine } from '../services/uploadQueue';
import { ImageThumbnail } from '../components/ImageThumbnail';

interface ComposeScreenProps {
  onReportSubmitted: () => void;
}

export const ComposeScreen: React.FC<ComposeScreenProps> = ({ onReportSubmitted }) => {
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<ReportImage[]>([]);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load draft on mount
  useEffect(() => {
    loadDraft().then(draft => {
      if (draft) {
        if (draft.description) setDescription(draft.description);
        if (draft.images && draft.images.length > 0) setImages(draft.images);
      }
    });
  }, []);

  // Autosave draft whenever description or images change
  useEffect(() => {
    if (description.trim() || images.length > 0) {
      saveDraft({ description, images });
    } else {
      saveDraft(null);
    }
  }, [description, images]);

  // Listen to AppState so if user returns from Settings, permission banners can refresh
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        setPermissionError(null);
      }
    });
    return () => sub.remove();
  }, []);

  // Request Android Camera Permission
  const requestCameraPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera Permission Needed',
        message: 'The Field Reports app requires camera access to attach site photographs.',
        buttonPositive: 'Grant Access',
        buttonNegative: 'Deny'
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      return false;
    }
  };

  // Request Android Storage/Gallery Permission
  const requestGalleryPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  };

  // Capture Photo with Camera
  const handleTakePhoto = async () => {
    setValidationError(null);
    if (images.length >= CONFIG.MAX_IMAGES) {
      setValidationError(`Maximum limit reached: A report can have at most ${CONFIG.MAX_IMAGES} photos.`);
      return;
    }

    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      setPermissionError('Camera permission was denied. You can enable it in device Settings without restarting the app.');
      return;
    }
    setPermissionError(null);

    setIsProcessingPhoto(true);
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        saveToPhotos: false,
        includeExtra: true,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        setIsProcessingPhoto(false);
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) return;

      const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      // Copy immediately to app persistent storage! (Survives force-quits)
      const { persistentUri, size } = await copyToPersistentStorage(asset.uri, imageId);

      const newImage: ReportImage = {
        id: imageId,
        localUri: persistentUri,
        originalSize: size || asset.fileSize || 0,
        compressedSize: size || asset.fileSize || 0,
        width: asset.width,
        height: asset.height,
        mimeType: asset.type || 'image/jpeg',
        status: 'pending',
        uploadedBytes: 0,
        totalBytes: size || asset.fileSize || 0
      };

      setImages(prev => [...prev, newImage]);
    } catch (err: any) {
      Alert.alert('Camera Error', err.message || 'Could not capture photo');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  // Pick Photo(s) from Gallery
  const handlePickGallery = async () => {
    setValidationError(null);
    const availableSlots = CONFIG.MAX_IMAGES - images.length;
    if (availableSlots <= 0) {
      setValidationError(`Maximum limit reached: A report can have at most ${CONFIG.MAX_IMAGES} photos.`);
      return;
    }

    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) {
      setPermissionError('Photo library permission was denied. You can enable it in device Settings without restarting the app.');
      return;
    }
    setPermissionError(null);

    setIsProcessingPhoto(true);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: availableSlots,
        includeExtra: true
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        setIsProcessingPhoto(false);
        return;
      }

      const newImages: ReportImage[] = [];
      for (const asset of result.assets) {
        if (!asset.uri) continue;
        const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const { persistentUri, size } = await copyToPersistentStorage(asset.uri, imageId);

        newImages.push({
          id: imageId,
          localUri: persistentUri,
          originalSize: size || asset.fileSize || 0,
          compressedSize: size || asset.fileSize || 0,
          width: asset.width,
          height: asset.height,
          mimeType: asset.type || 'image/jpeg',
          status: 'pending',
          uploadedBytes: 0,
          totalBytes: size || asset.fileSize || 0
        });
      }

      setImages(prev => [...prev, ...newImages]);
    } catch (err: any) {
      Alert.alert('Gallery Error', err.message || 'Could not pick photos');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  // Remove Photo from Selection
  const handleRemoveImage = async (indexToRemove: number) => {
    const toRemove = images[indexToRemove];
    if (toRemove) {
      await deleteImageFile(toRemove.localUri);
    }
    setImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Submit Report to Local Persistent Queue
  // "Nothing waits on the network except the network."
  const handleSubmit = async () => {
    setValidationError(null);

    // Rule 1: Non-blank description required
    if (!description.trim()) {
      setValidationError('Description is required and cannot be blank.');
      return;
    }

    // Rule 2: 1 to 5 images bound strictly enforced
    if (images.length < CONFIG.MIN_IMAGES) {
      setValidationError(`At least ${CONFIG.MIN_IMAGES} photograph is required.`);
      return;
    }

    if (images.length > CONFIG.MAX_IMAGES) {
      setValidationError(`At most ${CONFIG.MAX_IMAGES} photographs are allowed per report.`);
      return;
    }

    const reportId = 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const newReport: Report = {
      id: reportId,
      description: description.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      images: [...images],
      status: 'queued',
      retryCount: 0,
      maxRetries: CONFIG.MAX_RETRIES
    };

    // 1. Enqueue in persistent headless engine immediately
    await queueEngine.enqueue(newReport);

    // 2. Clear draft
    setDescription('');
    setImages([]);
    await saveDraft(null);

    // 3. Switch to Outbox to let user monitor delivery
    onReportSubmitted();
  };

  const isAtMaxImages = images.length >= CONFIG.MAX_IMAGES;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerBox}>
        <Text style={styles.heading}>Compose Report</Text>
        <Text style={styles.subheading}>
          Capture site observations. Reports are saved locally first and guaranteed to arrive.
        </Text>
      </View>

      {/* Permission Denied Banner with Open Settings link */}
      {permissionError ? (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionTitle}>Permission Denied</Text>
          <Text style={styles.permissionMsg}>{permissionError}</Text>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.settingsBtnText}>Open Device Settings</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Validation Error Banner */}
      {validationError ? (
        <View style={styles.validationBox}>
          <Text style={styles.validationText}>⚠️ {validationError}</Text>
        </View>
      ) : null}

      {/* Description Input */}
      <View style={styles.fieldGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Description <Text style={styles.required}>*</Text></Text>
          <Text style={styles.charCount}>{description.length} chars</Text>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Enter inspector notes, site conditions, location details..."
          placeholderTextColor="#7A8894"
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />
      </View>

      {/* Photographs Section (1–5 photos) */}
      <View style={styles.fieldGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Site Photographs (1–5) <Text style={styles.required}>*</Text></Text>
          <Text style={[styles.badgeCount, images.length >= 1 ? styles.badgeCountOk : styles.badgeCountWarn]}>
            {images.length} / {CONFIG.MAX_IMAGES}
          </Text>
        </View>

        {/* Selected Photos Grid */}
        {images.length > 0 ? (
          <View style={styles.thumbsGrid}>
            {images.map((img, idx) => (
              <ImageThumbnail
                key={img.id}
                image={img}
                index={idx}
                onRemove={() => handleRemoveImage(idx)}
              />
            ))}
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.mediaButtonsRow}>
          <TouchableOpacity
            style={[styles.mediaButton, isAtMaxImages && styles.buttonDisabled]}
            onPress={handleTakePhoto}
            disabled={isAtMaxImages || isProcessingPhoto}
            activeOpacity={0.8}
          >
            <Text style={styles.mediaButtonIcon}>📷</Text>
            <Text style={styles.mediaButtonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mediaButton, isAtMaxImages && styles.buttonDisabled]}
            onPress={handlePickGallery}
            disabled={isAtMaxImages || isProcessingPhoto}
            activeOpacity={0.8}
          >
            <Text style={styles.mediaButtonIcon}>🖼️</Text>
            <Text style={styles.mediaButtonText}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>

        {isProcessingPhoto ? (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#2E7BD6" />
            <Text style={styles.processingText}>Securing photo to device storage...</Text>
          </View>
        ) : null}
      </View>

      {/* Constraints Reminder Note */}
      <View style={styles.noteBox}>
        <Text style={styles.noteTitle}>DELIVERY GUARANTEES</Text>
        <Text style={styles.noteText}>
          • Photos are compressed safely below the 5 MB server limit.{'\n'}
          • If connection drops, upload pauses and resumes automatically.{'\n'}
          • Saved locally immediately; safe against app force-quits.
        </Text>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, (!description.trim() || images.length === 0) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        activeOpacity={0.85}
      >
        <Text style={styles.submitButtonText}>Submit Report</Text>
      </TouchableOpacity>
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
  headerBox: {
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#16212C',
  },
  subheading: {
    fontSize: 13,
    color: '#7A8894',
    marginTop: 4,
    lineHeight: 18,
  },
  permissionBox: {
    backgroundColor: '#FAE8E7',
    borderWidth: 1,
    borderColor: '#C4453D',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C4453D',
    marginBottom: 4,
  },
  permissionMsg: {
    fontSize: 13,
    color: '#41505E',
    marginBottom: 10,
    lineHeight: 18,
  },
  settingsBtn: {
    backgroundColor: '#C4453D',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  settingsBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  validationBox: {
    backgroundColor: '#FBEFDF',
    borderWidth: 1,
    borderColor: '#E08A34',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  validationText: {
    color: '#E08A34',
    fontSize: 13,
    fontWeight: '600',
  },
  fieldGroup: {
    backgroundColor: '#FBFCFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D3DBD8',
    padding: 16,
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16212C',
  },
  required: {
    color: '#C4453D',
  },
  charCount: {
    fontSize: 12,
    color: '#7A8894',
    fontFamily: 'monospace',
  },
  badgeCount: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeCountOk: {
    backgroundColor: '#E4F3EB',
    color: '#2F9160',
  },
  badgeCountWarn: {
    backgroundColor: '#FBEFDF',
    color: '#E08A34',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D3DBD8',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#16212C',
    backgroundColor: '#FFFFFF',
    minHeight: 100,
  },
  thumbsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  mediaButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mediaButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16212C',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  mediaButtonIcon: {
    fontSize: 16,
  },
  mediaButtonText: {
    color: '#FBFCFC',
    fontSize: 13,
    fontWeight: '600',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  processingText: {
    fontSize: 12,
    color: '#2E7BD6',
    fontWeight: '600',
  },
  noteBox: {
    backgroundColor: '#E7F0FB',
    borderLeftWidth: 3,
    borderLeftColor: '#2E7BD6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  noteTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7BD6',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 12,
    color: '#41505E',
    lineHeight: 17,
  },
  submitButton: {
    backgroundColor: '#2F9160',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#2F9160',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  submitButtonDisabled: {
    backgroundColor: '#7A8894',
    opacity: 0.7,
    elevation: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
