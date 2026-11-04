import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { NetworkState } from '../types';

/**
 * Network Connectivity Service
 * Real-time monitoring of online/offline and cellular generations (2G/3G/4G/5G)
 */

function mapNetInfoState(state: NetInfoState): NetworkState {
  const isConnected = Boolean(state.isConnected);
  const isInternetReachable = state.isInternetReachable;

  let cellularGen: '2g' | '3g' | '4g' | '5g' | null = null;
  if (state.type === 'cellular' && state.details && 'cellularGeneration' in state.details) {
    cellularGen = (state.details as any).cellularGeneration || null;
  }

  return {
    isConnected,
    isInternetReachable,
    type: state.type,
    details: {
      cellularGeneration: cellularGen
    }
  };
}

export async function checkNetworkState(): Promise<NetworkState> {
  const state = await NetInfo.fetch();
  return mapNetInfoState(state);
}

export function subscribeNetworkChanges(callback: (state: NetworkState) => void): () => void {
  const unsubscribe = NetInfo.addEventListener(state => {
    callback(mapNetInfoState(state));
  });
  return unsubscribe;
}
