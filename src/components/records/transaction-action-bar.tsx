import React from 'react';
import { View } from 'react-native';
import { BottomActionBar } from '@/components/ui/bottom-action-bar';
import { PrimaryButton } from '@/components/ui/primary-button';
import { IconButton } from '@/components/ui/icon-button';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

interface TransactionActionBarProps {
  totalBalance: number;
  onPrintInvoice: () => void;
  onShare: () => void;
  onDelete: () => void;
  onRecordPayment: () => void;
}

export function TransactionActionBar({
  totalBalance,
  onPrintInvoice,
  onShare,
  onDelete,
  onRecordPayment,
}: TransactionActionBarProps) {
  const theme = useTheme();
  const { isAdmin } = useAuth();

  return (
    <BottomActionBar>
      <View style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <IconButton 
            icon="printer" 
            mode="outlined" 
            iconColor={theme.onSurfaceVariant} 
            size={24} 
            onPress={onPrintInvoice} 
          />
          <IconButton 
            icon="share-variant" 
            mode="outlined" 
            iconColor={theme.onSurfaceVariant} 
            size={24} 
            onPress={onShare} 
          />
          {/* Delete is admin-only (role-based), hidden for staff on every platform. */}
          {isAdmin && (
            <IconButton
              icon="delete"
              mode="outlined"
              iconColor={theme.error}
              size={24}
              onPress={onDelete}
            />
          )}
        </View>
        
        <View style={{ flex: 1 }} />

        {totalBalance > 0 && (
          <PrimaryButton 
            icon="cash-register"
            onPress={onRecordPayment}
          >
            Record Payment
          </PrimaryButton>
        )}
      </View>
    </BottomActionBar>
  );
}
