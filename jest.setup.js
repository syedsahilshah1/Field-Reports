/* eslint-disable no-undef */
jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
    setItem: jest.fn((key, val) => {
      store[key] = val;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      store = {};
      return Promise.resolve();
    }),
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
    details: {}
  }),
  addEventListener: jest.fn().mockReturnValue(() => {})
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(true),
  copyFile: jest.fn().mockResolvedValue(true),
  stat: jest.fn().mockResolvedValue({ size: 1024 }),
  unlink: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue('base64data'),
  writeFile: jest.fn().mockResolvedValue(true)
}));

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  createResizedImage: jest.fn().mockResolvedValue({
    uri: 'file:///mock/resized.jpg',
    size: 500000,
    width: 2048,
    height: 1536
  })
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn()
}));
