/* eslint-disable */
import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

let hasHydratedGlobally = false;

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(hasHydratedGlobally);

  useEffect(() => {
    if (!hasHydratedGlobally) {
      hasHydratedGlobally = true;
      setHasHydrated(true);
    }
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
