import { UploadQueueEngine } from '../src/services/uploadQueue';
import { Report } from '../src/types';
import * as storage from '../src/services/storage';
import * as apiClient from '../src/services/apiClient';
import * as imagePipeline from '../src/services/imagePipeline';
import * as network from '../src/services/network';
import { ApiError } from '../src/services/apiClient';

// Mock dependencies
jest.mock('../src/services/storage');
jest.mock('../src/services/apiClient');
jest.mock('../src/services/imagePipeline');
jest.mock('../src/services/network');
jest.mock('../src/services/fileSystem');

describe('UploadQueueEngine (Headless & Screen-independent)', () => {
  let engine: UploadQueueEngine;
  let mockStorage: Report[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = [];

    (storage.loadReportsFromStorage as jest.Mock).mockImplementation(async () => [...mockStorage]);
    (storage.saveReportsToStorage as jest.Mock).mockImplementation(async (reports: Report[]) => {
      mockStorage = [...reports];
    });
    (storage.upsertReportInStorage as jest.Mock).mockImplementation(async (report: Report) => {
      const idx = mockStorage.findIndex(r => r.id === report.id);
      if (idx >= 0) mockStorage[idx] = report;
      else mockStorage.unshift(report);
      return [...mockStorage];
    });

    (network.checkNetworkState as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi'
    });
    (network.subscribeNetworkChanges as jest.Mock).mockReturnValue(() => {});

    (imagePipeline.processAndCompressImage as jest.Mock).mockResolvedValue({
      uri: 'file:///persistent/compressed.jpg',
      size: 850 * 1024, // 850 KB (well under 5 MB ceiling)
      width: 2048,
      height: 1536,
      originalSize: 12 * 1024 * 1024, // Original was 12 MB
      compressionRatio: 0.07
    });

    (apiClient.apiRegisterReport as jest.Mock).mockResolvedValue({ message: 'registered' });
    (apiClient.apiUploadImage as jest.Mock).mockResolvedValue({
      success: true,
      image: { url: '/uploads/rep_1/img_1.jpg' }
    });

    engine = new UploadQueueEngine();
  });

  afterEach(async () => {
    await engine.resetAll();
  });

  test('1. Enqueues report into persistent queue and notifies subscribers', async () => {
    await engine.initialize();

    const mockReport: Report = {
      id: 'rep_100',
      description: 'Site foundation crack near pillar 4',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      images: [
        {
          id: 'img_1',
          localUri: 'file:///path/img_1.jpg',
          originalSize: 8 * 1024 * 1024, // 8 MB original
          compressedSize: 8 * 1024 * 1024,
          mimeType: 'image/jpeg',
          status: 'pending',
          uploadedBytes: 0,
          totalBytes: 8 * 1024 * 1024
        }
      ],
      status: 'queued',
      retryCount: 0,
      maxRetries: 10
    };

    const subscriber = jest.fn();
    engine.subscribe(subscriber);

    await engine.enqueue(mockReport);

    expect(storage.upsertReportInStorage).toHaveBeenCalled();
    expect(subscriber).toHaveBeenCalled();
  });

  test('2. Progress on a bad link: Skips already-uploaded images on retry', async () => {
    await engine.initialize();

    const mockReport: Report = {
      id: 'rep_200',
      description: 'Progress preservation test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      images: [
        {
          id: 'img_already_done',
          localUri: 'file:///path/img1.jpg',
          originalSize: 1024,
          compressedSize: 1024,
          mimeType: 'image/jpeg',
          status: 'uploaded', // ALREADY uploaded in previous attempt
          uploadedBytes: 1024,
          totalBytes: 1024,
          remoteUrl: '/uploads/rep_200/img_already_done.jpg'
        },
        {
          id: 'img_pending',
          localUri: 'file:///path/img2.jpg',
          originalSize: 2048,
          compressedSize: 2048,
          mimeType: 'image/jpeg',
          status: 'pending',
          uploadedBytes: 0,
          totalBytes: 2048
        }
      ],
      status: 'queued',
      retryCount: 1,
      maxRetries: 10
    };

    await engine.enqueue(mockReport);
    await engine.waitForIdle();

    // Verify apiUploadImage was ONLY called for the pending image, NOT the already-uploaded one!
    expect(apiClient.apiUploadImage).toHaveBeenCalledTimes(1);
    expect(apiClient.apiUploadImage).toHaveBeenCalledWith(
      'rep_200',
      expect.objectContaining({ id: 'img_pending' }),
      1,
      2,
      expect.any(Function)
    );
  });

  test('3. Survives a kill / crash: Recovers in-flight processing reports back to queued on initialize', async () => {
    // Pre-populate storage with an in-flight report left by a simulated force-quit
    mockStorage = [
      {
        id: 'rep_killed',
        description: 'Inspector was interrupted by app kill',
        createdAt: Date.now() - 5000,
        updatedAt: Date.now() - 5000,
        images: [
          {
            id: 'img_killed',
            localUri: 'file:///path/killed.jpg',
            originalSize: 1000,
            compressedSize: 1000,
            mimeType: 'image/jpeg',
            status: 'uploading', // Was mid-upload when killed
            uploadedBytes: 500,
            totalBytes: 1000
          }
        ],
        status: 'processing', // Was processing when OS killed process
        retryCount: 0,
        maxRetries: 10
      }
    ];

    await engine.initialize();
    await engine.waitForIdle();

    // Verify status was reverted back to queued so it can automatically resume
    const recovered = engine.getQueue().find(r => r.id === 'rep_killed');
    expect(recovered).toBeDefined();
    expect(recovered?.status).toBe('delivered'); // Re-processed and delivered!
    expect(storage.saveReportsToStorage).toHaveBeenCalled();
  });

  test('4. Handles transient errors with exponential backoff & retry schedule', async () => {
    (apiClient.apiUploadImage as jest.Mock).mockRejectedValueOnce(
      { message: 'Simulated 500 Internal Server Error (Chaos)', isTransient: true }
    );

    await engine.initialize();

    const mockReport: Report = {
      id: 'rep_transient',
      description: 'Testing transient retry',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      images: [
        {
          id: 'img_t',
          localUri: 'file:///path/t.jpg',
          originalSize: 1000,
          compressedSize: 1000,
          mimeType: 'image/jpeg',
          status: 'pending',
          uploadedBytes: 0,
          totalBytes: 1000
        }
      ],
      status: 'queued',
      retryCount: 0,
      maxRetries: 10
    };

    await engine.enqueue(mockReport);
    await engine.waitForIdle();

    const report = engine.getQueue().find(r => r.id === 'rep_transient');
    expect(report?.status).toBe('failed');
    expect(report?.retryCount).toBe(1);
    expect(report?.nextRetryAt).toBeGreaterThan(Date.now());
    expect(report?.isTerminalError).toBeFalsy();
  });

  test('5. Terminal fatal errors (e.g. 400 Bad Request) are NOT endlessly retried', async () => {
    (apiClient.apiRegisterReport as jest.Mock).mockRejectedValueOnce(
      { message: 'Permanent bad request', isTransient: false } // non-transient!
    );

    await engine.initialize();

    const mockReport: Report = {
      id: 'rep_fatal',
      description: 'Testing terminal fatal rejection',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      images: [],
      status: 'queued',
      retryCount: 0,
      maxRetries: 10
    };

    await engine.enqueue(mockReport);
    await engine.waitForIdle();

    const report = engine.getQueue().find(r => r.id === 'rep_fatal');
    expect(report?.status).toBe('failed');
    expect(report?.isTerminalError).toBe(true);
    expect(report?.nextRetryAt).toBeUndefined(); // No auto-retry scheduled
  });
});
