import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db, whenFirebaseAuthed } from '@/lib/firebase';
import { ref, onValue, set, get } from 'firebase/database';

export interface MaterialItem {
  id: string;
  name: string;
  price: number;
}

export interface PrinterItem {
  id: string;
  name: string;
}

export interface AppSettings {
  businessName: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  invoicePrefix: string;
  taxPercentage: number;
  mov: number; // Minimum Order Value
  defaultTermsDays: number; // Payment terms when a sale has no explicit dueDate
  materials: MaterialItem[];
  eyeletCost: number; // Free by default
  wasteFactor: number; // % waste factor
  
  // New Additions
  logoUrl: string;
  bankDetails: string;
  laminationCost: number;
  laborCost: number;
  turnaroundStandard: number;
  turnaroundRush: number;
  turnaroundSameDay: number;
  printers: PrinterItem[];
}

/**
 * Exported so callers that must never price a real job against fallback
 * data (new-sales.tsx) can reference-compare `settings === DEFAULT_SETTINGS`
 * — see `loadError` on SettingsContextType for the primary signal; this is
 * the belt-and-braces second check for a settings object that's still
 * exactly this even after `isLoading` reports false.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  businessName: 'BoMedia Sales',
  address: '123 Main St, City, Country',
  contactEmail: 'contact@bomedia.com',
  contactPhone: '+234 000 0000',
  invoicePrefix: 'INV-',
  taxPercentage: 0,
  mov: 1000,
  defaultTermsDays: 7,
  materials: [
    { id: 'm1', name: 'FLEX-3FT', price: 150 },
    { id: 'm2', name: 'SAV-4FT', price: 200 },
    { id: 'm3', name: 'FLEX-4FT', price: 150 },
    { id: 'm4', name: 'FLEX-5FT', price: 150 },
    { id: 'm5', name: 'FLEX-6FT', price: 150 },
    { id: 'm6', name: 'FLEX-8FT', price: 150 },
    { id: 'm7', name: 'FLEX-10FT', price: 150 },
    { id: 'm8', name: 'CLEAR-STICKER-4FT', price: 300 },
    { id: 'm9', name: 'WINDOW-GRAPHICS-4FT', price: 350 },
    { id: 'm10', name: 'SAV-5FT', price: 200 },
    { id: 'm11', name: 'SOLITE-3FT', price: 400 },
  ],
  eyeletCost: 0,
  wasteFactor: 0,
  logoUrl: '',
  bankDetails: 'Bank: Example Bank\nAcct: 1234567890\nName: BoMedia Sales',
  laminationCost: 200,
  laborCost: 1000,
  turnaroundStandard: 1.0,
  turnaroundRush: 1.5,
  turnaroundSameDay: 2.0,
  printers: [
    { id: 'p1', name: 'HP Latex 360' },
    { id: 'p2', name: 'Roland XR-640' },
    { id: 'p3', name: 'Mimaki JV150' },
  ],
};



interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  isLoading: boolean;
  /**
   * True once `whenFirebaseAuthed` has waited past its timeout with no
   * Firebase Auth session — the mint-firebase-token bridge looks stuck or
   * down. `settings` is still whatever it was (DEFAULT_SETTINGS, on a cold
   * start) and MUST NOT be trusted for pricing while this is true — see
   * new-sales.tsx, which blocks order entry on it. Cleared automatically if
   * a real load lands after the timeout fired late.
   */
  loadError: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Helper to convert flat AppSettings to nested Firebase structure
const nestSettings = (flatSettings: AppSettings) => {
  return {
    businessProfile: {
      businessName: flatSettings.businessName,
      address: flatSettings.address,
      contactEmail: flatSettings.contactEmail,
      contactPhone: flatSettings.contactPhone,
      invoicePrefix: flatSettings.invoicePrefix,
      logoUrl: flatSettings.logoUrl,
      bankDetails: flatSettings.bankDetails,
    },
    materials: flatSettings.materials,
    metrics: {
      taxPercentage: flatSettings.taxPercentage,
      mov: flatSettings.mov,
      defaultTermsDays: flatSettings.defaultTermsDays,
      eyeletCost: flatSettings.eyeletCost,
      wasteFactor: flatSettings.wasteFactor,
      laminationCost: flatSettings.laminationCost,
      laborCost: flatSettings.laborCost,
      turnaroundStandard: flatSettings.turnaroundStandard,
      turnaroundRush: flatSettings.turnaroundRush,
      turnaroundSameDay: flatSettings.turnaroundSameDay,
    },
    printers: flatSettings.printers,
  };
};

// Helper to convert nested Firebase structure back to flat AppSettings
const flattenSettings = (nested: any): AppSettings => {
  return {
    ...DEFAULT_SETTINGS, // Fallback defaults
    ...nested.businessProfile,
    ...nested.metrics,
    materials: nested.materials || [],
    printers: nested.printers || [],
  };
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const settingsRef = ref(db, 'settings');

    // Waits for the mint-firebase-token bridge (see @/lib/firebase's
    // whenFirebaseAuthed) rather than attaching immediately on mount — RTDB
    // rules require a Firebase Auth session, and a listener attached before
    // that bridge finishes is cancelled by PERMISSION_DENIED permanently,
    // not retried, which is what silenced this screen's data before.
    const unsubscribe = whenFirebaseAuthed(
      () =>
        onValue(
          settingsRef,
          (snapshot) => {
            // A real load landed — even if the timeout below already fired
            // once, this is current data now, not the fallback.
            setLoadError(false);
            if (snapshot.exists()) {
              const nestedData = snapshot.val();
              const flatData = flattenSettings(nestedData);

              // Backward compatibility migration for materials
              if (flatData.materials && flatData.materials.length > 0 && typeof flatData.materials[0] === 'string') {
                flatData.materials = flatData.materials.map((m: any, i: number) => ({
                  id: `migrated-m-${i}-${Date.now()}`,
                  name: m as string,
                  price: 0
                }));
              }

              // Backward compatibility migration for printers
              if (flatData.printers && flatData.printers.length > 0 && typeof flatData.printers[0] === 'string') {
                flatData.printers = flatData.printers.map((p: any, i: number) => ({
                  id: `migrated-p-${i}-${Date.now()}`,
                  name: p as string
                }));
              }

              setSettings(flatData);
            } else {
              // First run or empty database, initialize with defaults
              const nestedDefaults = nestSettings(DEFAULT_SETTINGS);
              set(settingsRef, nestedDefaults).catch(console.error);
              setSettings(DEFAULT_SETTINGS);
            }
            setIsLoading(false);
          },
          (error) => {
            console.error('Failed to load settings from Firebase:', error);
            setLoadError(true);
            setIsLoading(false);
          },
        ),
      {
        // Hanging forever on DEFAULT_SETTINGS while never signalling anything
        // is wrong is the failure this exists to close — see
        // whenFirebaseAuthed's own comment. `isLoading` stays true and
        // `settings` stays fallback data until this fires.
        onTimeout: () => setLoadError(true),
      },
    );

    return () => unsubscribe();
  }, []);

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedFlat = { ...settings, ...newSettings };
      // Local state is updated optimisticly, but onValue will confirm
      setSettings(updatedFlat);
      
      const settingsRef = ref(db, 'settings');
      const nestedUpdated = nestSettings(updatedFlat);
      await set(settingsRef, nestedUpdated);
    } catch (error) {
      console.error('Failed to save settings to Firebase:', error);
    }
  };

  const resetSettings = async () => {
    try {
      setSettings(DEFAULT_SETTINGS);
      const settingsRef = ref(db, 'settings');
      const nestedDefaults = nestSettings(DEFAULT_SETTINGS);
      await set(settingsRef, nestedDefaults);
    } catch (error) {
      console.error('Failed to reset settings in Firebase:', error);
    }
  };

  const refreshSettings = async () => {
    setIsLoading(true);
    try {
      const settingsRef = ref(db, 'settings');
      const snapshot = await get(settingsRef);
      if (snapshot.exists()) {
        const nestedData = snapshot.val();
        const flatData = flattenSettings(nestedData);
        
        if (flatData.materials && flatData.materials.length > 0 && typeof flatData.materials[0] === 'string') {
          flatData.materials = flatData.materials.map((m: any, i: number) => ({
            id: `migrated-m-${i}-${Date.now()}`,
            name: m as string,
            price: 0
          }));
        }

        if (flatData.printers && flatData.printers.length > 0 && typeof flatData.printers[0] === 'string') {
          flatData.printers = flatData.printers.map((p: any, i: number) => ({
            id: `migrated-p-${i}-${Date.now()}`,
            name: p as string
          }));
        }

        setSettings(flatData);
        setLoadError(false);
      }
    } catch (error) {
      console.error('Failed to refresh settings from Firebase:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings, refreshSettings, isLoading, loadError }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
