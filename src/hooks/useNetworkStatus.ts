import { useState, useEffect } from 'react';
import { NetworkState } from '../types';
import { checkNetworkState, subscribeNetworkChanges } from '../services/network';

export function useNetworkStatus() {
  const [network, setNetwork] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown'
  });

  useEffect(() => {
    checkNetworkState().then(setNetwork);
    const unsubscribe = subscribeNetworkChanges(setNetwork);
    return () => {
      unsubscribe();
    };
  }, []);

  const is2G = network.details?.cellularGeneration === '2g';
  const isOnline = Boolean(network.isConnected);

  return {
    network,
    isOnline,
    is2G,
    connectionLabel: !isOnline ? 'Offline' : is2G ? 'Cellular (2G)' : network.type.toUpperCase()
  };
}
