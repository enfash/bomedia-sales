import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { ThemedTextInput } from '@/components/ui/themed-text-input';
import { useTheme } from '@/hooks/use-theme';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { Surface } from 'react-native-paper';

import type { BatchAdjustment, SalesBatch, SalesRecord } from '@/components/records/types';
import { MaxContentWidth } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useSettings } from '@/context/settings-context';
import { logActivity } from '@/services/activity';
import { fetchBatchesByReceiptIds, updateBatchDetails } from '@/services/sales-repository-pg';
import { formatCurrency } from '@/utils/currency';
import { formatDate, isOverdue } from '@/utils/date';
import { computePaymentStatus, STATUS_META } from '@/utils/payment-status';

/**
 * One invoice can cover several batches. Collapse their adjustment rows so the
 * customer sees "Delivery: +₦4,000" once rather than the same label repeated
 * per batch. Order is preserved from first appearance.
 *
 * NOTE: both renderers below (the HTML export and the on-screen view) read the
 * single `totals` state this feeds, so they cannot disagree on the numbers.
 * They still duplicate the *markup* — tracked in docs/AUDIT_2026-07.md under
 * "Noticed, not fixed".
 */
function mergeAdjustments(batches: SalesBatch[]): BatchAdjustment[] {
  const merged: BatchAdjustment[] = [];
  for (const batch of batches) {
    for (const adjustment of batch.adjustments || []) {
      const existing = merged.find(
        (m) => m.kind === adjustment.kind && m.label === adjustment.label,
      );
      if (existing) existing.amount += adjustment.amount;
      else merged.push({ ...adjustment });
    }
  }
  return merged.filter((m) => m.amount !== 0);
}

export default function InvoiceScreen() {
  const { batchId } = useLocalSearchParams();
  const router = useRouter();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { isAdmin, actor } = useAuth();
  const theme = useTheme();
  
  const [loading, setLoading] = useState(() => !!batchId);
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [batchPaths, setBatchPaths] = useState<string[]>([]);
  const [totals, setTotals] = useState<{
    subtotal: number;
    adjustments: BatchAdjustment[];
    totalAmount: number;
    totalPaid: number;
  }>({ subtotal: 0, adjustments: [], totalAmount: 0, totalPaid: 0 });
  const [clientName, setClientName] = useState('Unknown Client');
  const [contact, setContact] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isVoided, setIsVoided] = useState(false);

  useEffect(() => {
    if (!batchId) {
      return;
    }

    let isActive = true;

    const run = async () => {
      setLoading(true);
      try {
        const ids =
          typeof batchId === 'string' ? batchId.split(',') : Array.isArray(batchId) ? batchId : [];
        // The one caller that opts in: a voided sale still produces an invoice,
        // stamped VOIDED, because you may need to show a customer what was cancelled.
        const batches = await fetchBatchesByReceiptIds(ids, true);
        if (!isActive) return;

        const items = batches.flatMap((b) =>
          b.records.map((r) => ({
            ...r,
            clientName: b.clientName,
            contact: b.contact || '',
            createdAt: b.createdAt,
          })),
        );

        setIsVoided(batches.some((b) => b.isVoided));
        setRecords(items);
        setBatchPaths(batches.map((b) => b.id));
        setTotals({
          subtotal: batches.reduce((s, b) => s + (b.subtotal || 0), 0),
          adjustments: mergeAdjustments(batches),
          totalAmount: batches.reduce((s, b) => s + (b.totalAmount || 0), 0),
          totalPaid: batches.reduce((s, b) => s + (b.totalPaid || 0), 0),
        });

        const primary = batches[0];
        setClientName(primary?.clientName || 'Unknown Client');
        setContact(primary?.contact || '');
        setCreatedAt(primary?.createdAt || '');
        setNotes(primary?.notes || '');
        setDueDate(primary?.dueDate || '');
      } catch (err) {
        if (isActive) console.error('Error fetching invoice records', err);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    run();

    return () => {
      isActive = false;
    };
  }, [batchId]);

  if (loading || settingsLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ marginTop: 12, color: theme.onSurfaceVariant }}>Generating Invoice...</Text>
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.onSurfaceVariant }]}>Invoice not found.</Text>
        <SecondaryButton onPress={() => router.back()}>
          Go Back
        </SecondaryButton>
      </View>
    );
  }

  const dateStr = formatDate(createdAt || records[0].createdAt);
  const batchIds = typeof batchId === 'string' ? batchId.split(',') : (Array.isArray(batchId) ? batchId : []);
  const invoiceNo = `INV-${batchIds.map(id => id.slice(-6)).join('-').toUpperCase()}`;

  const { subtotal, adjustments, totalAmount, totalPaid } = totals;
  const balance = totalAmount - totalPaid;

  // Single source of truth for status + colour (shared with every other screen).
  const paymentStatus = computePaymentStatus(
    totalAmount,
    totalPaid,
    isOverdue(createdAt || records[0].createdAt),
  );
  const status = paymentStatus.toUpperCase();
  const statusColor = STATUS_META[paymentStatus].color;

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    try {
      await updateBatchDetails(batchPaths, { notes, dueDate });
      logActivity({
        type: 'sale_edited',
        actor: actor,
        message: `${actor.name} edited invoice details for ${clientName}`,
        meta: { receiptIds: batchIds, clientName },
      });
      Alert.alert('Saved', 'Details saved successfully.');
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const generateHTML = () => {
    const tableRows = records.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #1a1c1c;">${item.width}x${item.height} ${item.jobUnit} ${item.type || 'Print Job'}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #1a1c1c; text-align: center;">${item.material || 'N/A'}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #1a1c1c; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #1a1c1c; text-align: right;">₦${item.unitPrice?.toLocaleString() || 0}</td>
        <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #1a1c1c; text-align: right; font-weight: bold;">₦${item.total?.toLocaleString() || 0}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1a1c1c; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2e388d; padding-bottom: 30px; margin-bottom: 30px; }
            .company { color: #454651; font-size: 13px; line-height: 1.6; }
            .title { font-size: 32px; font-weight: 800; letter-spacing: 2px; margin-bottom: 16px; text-align: right; color: #2e388d; }
            .meta { font-size: 13px; text-align: right; margin-bottom: 6px; }
            .meta-label { color: #767683; margin-right: 10px; }
            .bill-to { margin-bottom: 40px; }
            .section-title { font-size: 12px; font-weight: 700; color: #2e388d; margin-bottom: 8px; letter-spacing: 1px; }
            .client-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; color: #1a1c1c; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
            th { background: #f3f3f3; color: #454651; font-size: 12px; font-weight: 700; padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
            .totals { display: flex; justify-content: flex-end; }
            .totals-box { width: 280px; }
            .total-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f3f3; }
            .balance-row { background: #f3f3f3; padding: 16px 12px; border-radius: 8px; margin-top: 8px; border: none; }
            .stamp { position: absolute; top: 100px; right: 40px; font-size: 64px; font-weight: 900; opacity: 0.1; transform: rotate(-15deg); border: 8px solid; border-radius: 12px; padding: 10px 20px; text-align: center; z-index: -1; }
          </style>
        </head>
        <body>
          ${isVoided ? `
          <div style="background:#8c0009;color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:24px;text-align:center;">
            <div style="font-size:22px;font-weight:800;letter-spacing:3px;">VOIDED</div>
            <div style="font-size:13px;opacity:.9;margin-top:4px;">This sale was cancelled. It is not a request for payment.</div>
          </div>
          <div style="position:fixed;top:38%;left:0;right:0;text-align:center;font-size:120px;font-weight:800;color:rgba(140,0,9,.10);transform:rotate(-24deg);pointer-events:none;z-index:0;">VOIDED</div>
          ` : ''}
          <div class="stamp" style="color: ${statusColor}; border-color: ${statusColor};">${status}</div>
          <div class="header">
            <div>
              ${settings.logoUrl ? `<img src="${settings.logoUrl}" style="height: 50px; margin-bottom: 10px;" />` : `<h2 style="margin: 0 0 10px 0; color: #2e388d;">${settings.businessName}</h2>`}
              <div class="company">${settings.address}</div>
              <div class="company">${settings.contactEmail} | ${settings.contactPhone}</div>
            </div>
            <div>
              <div class="title">INVOICE</div>
              <div class="meta"><span class="meta-label">Invoice #:</span> ${invoiceNo}</div>
              <div class="meta"><span class="meta-label">Date:</span> ${dateStr}</div>
              ${dueDate ? `<div class="meta"><span class="meta-label">Due Date:</span> ${dueDate}</div>` : ''}
            </div>
          </div>
          
          <div class="bill-to">
            <div class="section-title">BILL TO</div>
            <div class="client-name">${clientName}</div>
            ${contact ? `<div style="color: #454651; font-size: 14px;">${contact}</div>` : ''}
          </div>

          <table>
            <tr>
              <th>Description</th>
              <th style="text-align: center;">Material</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Amount</th>
            </tr>
            ${tableRows}
          </table>

          <div class="totals">
            <div class="totals-box">
              <div class="total-row"><span style="color: #454651;">Subtotal:</span> <span>${formatCurrency(subtotal)}</span></div>
              ${adjustments.map((a) => `<div class="total-row"><span style="color: #454651;">${a.label}:</span> <span>${a.amount < 0 ? '−' : '+'}${formatCurrency(Math.abs(a.amount))}</span></div>`).join('')}
              <div class="total-row"><span style="color: #454651;">Total:</span> <span>${formatCurrency(totalAmount)}</span></div>
              <div class="total-row"><span style="color: #454651;">Amount Paid:</span> <span>${formatCurrency(totalPaid)}</span></div>
              <div class="total-row balance-row"><span style="font-weight: 700; font-size: 16px;">Balance Due:</span> <span style="font-weight: 800; font-size: 16px; color: #2e388d;">${formatCurrency(balance)}</span></div>
            </div>
          </div>

          ${notes ? `
          <div style="margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
            <div class="section-title">NOTES</div>
            <div style="font-size: 13px; color: #1a1c1c;">${notes}</div>
          </div>
          ` : ''}

          <div style="margin-top: ${notes ? '20px' : '40px'}; border-top: 1px solid #e0e0e0; padding-top: 20px;">
            <div class="section-title">PAYMENT DETAILS</div>
            <div style="font-size: 13px; color: #1a1c1c; white-space: pre-wrap;">${settings.bankDetails}</div>
          </div>
          
          <div style="margin-top: 60px; text-align: center; color: #767683; font-size: 14px; font-style: italic;">
            Thank you for your business!
          </div>
        </body>
      </html>
    `;
  };

  const handleExport = async () => {
    if (Platform.OS === 'web') {
      try {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(generateHTML());
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 500);
        } else {
          Alert.alert('Popup blocked', 'Please allow popups to print the invoice on web.');
        }
      } catch (error: any) {
        Alert.alert('Could not generate PDF', error.message);
      }
    } else {
      // On mobile, generate the PDF file and present the share/save sheet.
      try {
        const { uri } = await Print.printToFileAsync({ html: generateHTML() });
        
        // Rename and move to document directory to prevent Android sharing URI access errors
        const newUri = `${FileSystem.documentDirectory}Invoice-${invoiceNo}.pdf`;
        await FileSystem.copyAsync({
          from: uri,
          to: newUri
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Save or Share Invoice' });
        } else {
          Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
        }
      } catch (error: any) {
        Alert.alert('Could not export PDF', error.message);
      }
    }
  };

  return (
    <PageContainer padHorizontalMobile>
          <View style={styles.controls}>
        <SecondaryButton onPress={() => router.back()} icon={() => <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} size={16} tintColor={theme.primary} />} style={{ marginBottom: 12 }}>
          Back
        </SecondaryButton>
        
        <PrimaryButton onPress={handleExport} icon={() => <SymbolView name={{ ios: 'square.and.arrow.down', android: 'download', web: 'download' }} size={16} tintColor="#FFF" />}>
          {Platform.OS === 'web' ? 'Save as PDF / Print' : 'Save / Share PDF'}
        </PrimaryButton>
      </View>

      <Surface elevation={2} style={[styles.invoiceSheet, { backgroundColor: theme.surface, borderColor: theme.surfaceVariant }]}>
        {isVoided && (
          <View style={styles.voidBand}>
            <Text style={styles.voidBandTitle}>VOIDED</Text>
            <Text style={styles.voidBandBody}>
              This sale was cancelled. It is not a request for payment.
            </Text>
          </View>
        )}
        {/* Status Stamp */}
        <View style={[styles.stampContainer, { borderColor: statusColor }]}>
          <Text style={[styles.stampText, { color: statusColor }]}>{status}</Text>
        </View>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.primary }]}>
          <View style={styles.logoContainer}>
            {settings.logoUrl ? (
              <Image 
                source={{ uri: settings.logoUrl }} 
                style={styles.logo} 
                contentFit="contain"
              />
            ) : (
              <Text style={{ fontSize: 24, fontWeight: '800', marginBottom: 8, color: theme.primary }}>{settings.businessName}</Text>
            )}
            <Text style={[styles.companyDetails, { color: theme.onSurfaceVariant }]}>{settings.address}</Text>
            <Text style={[styles.companyDetails, { color: theme.onSurfaceVariant }]}>{settings.contactEmail} | {settings.contactPhone}</Text>
          </View>
          
          <View style={styles.invoiceTitleContainer}>
            <Text style={[styles.invoiceTitle, { color: theme.primary }]}>INVOICE</Text>
            <Text style={[styles.metaLabel, { color: theme.onSurfaceVariant }]}>INV #: <Text style={[styles.metaValue, { color: theme.onSurface }]}>{invoiceNo}</Text></Text>
            <Text style={[styles.metaLabel, { color: theme.onSurfaceVariant }]}>Date: <Text style={[styles.metaValue, { color: theme.onSurface }]}>{dateStr}</Text></Text>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.billToSection}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>BILL TO</Text>
          <Text style={[styles.clientName, { color: theme.onSurface }]}>{clientName}</Text>
          {contact ? <Text style={[styles.clientContact, { color: theme.onSurfaceVariant }]}>{contact}</Text> : null}
        </View>

        {/* Mobile-Friendly Line Items (Cards instead of Table) */}
        <View style={styles.itemsContainer}>
          <Text style={[styles.sectionTitle, { marginBottom: 12, color: theme.primary }]}>LINE ITEMS</Text>
          {records.map((item, idx) => (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: theme.surfaceVariant, borderColor: theme.outlineVariant }]}>
              <View style={[styles.itemHeader, { borderBottomColor: theme.outlineVariant }]}>
                <Text style={[styles.itemDescription, { color: theme.onSurface }]} numberOfLines={2}>
                  {item.width}x{item.height} {item.jobUnit} {item.type || 'Print Job'}
                </Text>
                <Text style={[styles.itemAmount, { color: theme.onSurface }]}>{formatCurrency(item.total)}</Text>
              </View>
              <View style={styles.itemDetailsRow}>
                <View style={styles.itemDetailCol}>
                  <Text style={[styles.itemDetailLabel, { color: theme.onSurfaceVariant }]}>Material</Text>
                  <Text style={[styles.itemDetailValue, { color: theme.onSurface }]}>{item.material || 'N/A'}</Text>
                </View>
                <View style={styles.itemDetailCol}>
                  <Text style={[styles.itemDetailLabel, { color: theme.onSurfaceVariant }]}>Qty</Text>
                  <Text style={[styles.itemDetailValue, { color: theme.onSurface }]}>{item.quantity}</Text>
                </View>
                <View style={styles.itemDetailCol}>
                  <Text style={[styles.itemDetailLabel, { color: theme.onSurfaceVariant }]}>Unit Price</Text>
                  <Text style={[styles.itemDetailValue, { color: theme.onSurface }]}>{formatCurrency(item.unitPrice)}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={[styles.totalRow, { borderBottomColor: theme.outlineVariant }]}>
              <Text style={[styles.totalLabel, { color: theme.onSurfaceVariant }]}>Subtotal:</Text>
              <Text style={[styles.totalValue, { color: theme.onSurface }]}>{formatCurrency(subtotal)}</Text>
            </View>
            {adjustments.map((a, i) => (
              <View key={`${a.kind}-${i}`} style={[styles.totalRow, { borderBottomColor: theme.outlineVariant }]}>
                <Text style={[styles.totalLabel, { color: theme.onSurfaceVariant }]}>{a.label}:</Text>
                <Text style={[styles.totalValue, { color: theme.onSurface }]}>
                  {a.amount < 0 ? '−' : '+'}{formatCurrency(Math.abs(a.amount))}
                </Text>
              </View>
            ))}
            <View style={[styles.totalRow, { borderBottomColor: theme.outlineVariant }]}>
              <Text style={[styles.totalLabel, { color: theme.onSurfaceVariant }]}>Total:</Text>
              <Text style={[styles.totalValue, { color: theme.onSurface }]}>{formatCurrency(totalAmount)}</Text>
            </View>
            <View style={[styles.totalRow, { borderBottomColor: theme.outlineVariant }]}>
              <Text style={[styles.totalLabel, { color: theme.onSurfaceVariant }]}>Amount Paid:</Text>
              <Text style={[styles.totalValue, { color: theme.onSurface }]}>{formatCurrency(totalPaid)}</Text>
            </View>
            <View style={[styles.totalRow, styles.balanceRow, { backgroundColor: theme.surfaceVariant, borderBottomColor: 'transparent' }]}>
              <Text style={[styles.balanceLabel, { color: theme.onSurface }]}>Balance Due:</Text>
              <Text style={[styles.balanceValue, { color: theme.primary }]}>{formatCurrency(balance)}</Text>
            </View>
          </View>
        </View>

        {/* Editable Due Date & Notes — admin-only. Editing an existing sale's
            details is blocked for staff by the security rules, so we hide the
            controls rather than let them hit a permission error. */}
        {isAdmin && (
        <View style={[styles.editableSection, { borderTopColor: theme.outlineVariant }]}>
          <View style={styles.editableRow}>
            <Text style={[styles.sectionTitle, { color: theme.primary }]}>DUE DATE</Text>
            <ThemedTextInput
              dense
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="e.g. Net 30, Oct 15th"
            />
          </View>

          <View style={[styles.editableRow, { marginTop: 16 }]}>
            <Text style={[styles.sectionTitle, { color: theme.primary }]}>NOTES</Text>
            <ThemedTextInput
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add payment terms or special notes here..."
            />
          </View>

          <PrimaryButton 
            onPress={handleSaveDetails}
            loading={isSavingDetails}
            disabled={isSavingDetails}
            style={{ marginTop: 16 }}
          >
            Save Notes
          </PrimaryButton>
        </View>
        )}

        {/* Payment Details */}
        <View style={{ marginTop: 32 }}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>PAYMENT DETAILS</Text>
          <View style={[styles.paymentBox, { backgroundColor: theme.surfaceVariant, borderLeftColor: theme.primary }]}>
            <Text style={[styles.paymentText, { color: theme.onSurfaceVariant }]}>{settings.bankDetails}</Text>
          </View>
        </View>
        </Surface>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    width: '100%',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  controls: {
    width: '100%',
    maxWidth: 800,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8, // Round Eight
    borderWidth: 1,
    borderColor: '#e0e0e0', // Border subtle
    gap: 8,
  },
  printBtn: {
    backgroundColor: '#2e388d', // BOmedia Primary
    borderColor: '#2e388d',
  },
  controlText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2e388d',
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2e388d',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  // Both renderers stamp the same thing; the HTML export adds a rotated
  // watermark behind the body, which has no sensible RN equivalent.
  voidBand: {
    backgroundColor: '#8c0009',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  voidBandTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  voidBandBody: { color: '#fff', fontSize: 13, opacity: 0.9, marginTop: 4 },
  invoiceSheet: {
    width: '100%',
    maxWidth: 800,
    backgroundColor: '#FFF',
    padding: 24, // Optimized for mobile
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  stampContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    borderWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    transform: [{ rotate: '-15deg' }],
    opacity: 0.08,
    zIndex: 0,
  },
  stampText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#2e388d',
    paddingBottom: 24,
    marginBottom: 24,
    gap: 16,
    zIndex: 1,
  },
  logoContainer: {
    alignItems: 'flex-start',
  },
  logo: {
    width: 120,
    height: 40,
    marginBottom: 10,
  },
  companyDetails: {
    fontSize: 13,
    color: '#454651',
    lineHeight: 20,
  },
  invoiceTitleContainer: {
    alignItems: 'flex-start',
    marginTop: 16,
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#2e388d',
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 13,
    color: '#767683',
    marginBottom: 4,
  },
  metaValue: {
    color: '#1a1c1c',
    fontWeight: '600',
  },
  billToSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2e388d',
    marginBottom: 8,
    letterSpacing: 1,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c1c',
    marginBottom: 4,
  },
  clientContact: {
    fontSize: 14,
    color: '#454651',
  },
  itemsContainer: {
    marginBottom: 32,
  },
  itemCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  itemDescription: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c1c',
    marginRight: 12,
  },
  itemAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c1c',
  },
  itemDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemDetailCol: {
    flex: 1,
  },
  itemDetailLabel: {
    fontSize: 11,
    color: '#767683',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  itemDetailValue: {
    fontSize: 13,
    color: '#454651',
    fontWeight: '500',
  },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 24,
  },
  totalsBox: {
    width: '100%',
    maxWidth: 300,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  totalLabel: {
    fontSize: 14,
    color: '#454651',
  },
  totalValue: {
    fontSize: 14,
    color: '#1a1c1c',
    fontWeight: '600',
  },
  balanceRow: {
    borderBottomWidth: 0,
    marginTop: 8,
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
  },
  balanceLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c1c',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2e388d',
  },
  editableSection: {
    marginTop: 16,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    width: '100%',
  },
  editableRow: {
    gap: 8,
    width: '100%',
  },
  editableInput: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    minHeight: 48,
    fontSize: 14,
    color: '#1a1c1c',
    width: '100%',
  },
  saveDetailsBtn: {
    marginTop: 16,
    backgroundColor: '#2e388d',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  saveDetailsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  paymentBox: {
    backgroundColor: '#f3f3f3',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2e388d',
  },
  paymentText: {
    fontSize: 13,
    color: '#454651',
    lineHeight: 20,
  },
});
