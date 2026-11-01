import {
  TransactionRecord,
  CommitmentRecord,
  DetectionAlertRecord,
  CancellationSessionRecord,
  MandateRecord,
  ServiceTermsRecord,
  ReconciliationFindingRecord,
  ReconciliationOutcomeStatus,
  EvidenceCasebookEntry,
  AuditEventRecord,
  DataCoverageSummary,
  FinancialGuardrailConfig,
  BhashaContextualQuestionResponse,
  LanguageCode,
  SarvamRuntimeStatus,
  ServiceLifecycleStatus,
  MandateLifecycleStatus,
  PaymentRailType,
  RecurrenceFrequency,
} from '../types/debitlens';
import { toMinorUnits, fromMinorUnits, formatMinorINR } from '../utils/currency';
import { SUPPORTED_LANGUAGES } from './referenceData';

// ============================================================================
// 1. INITIAL SEED MANDATES (Section 7 & 17)
// Demonstrates:
// - Active UPI AutoPay mandates with maxAmountMinor
// - Active Card Standing Instruction mandates
// - Active eNACH mandates (insurance, loan EMI)
// - Missing mandate scenario (CMT-FITCLUB has NO imported mandate record -> TRANSACTION_WITHOUT_VISIBLE_MANDATE)
// - Dormant mandate without recent transaction (MND-DORMANT-NEWSPLUS -> MANDATE_WITHOUT_RECENT_TRANSACTION)
// ============================================================================
export function buildInitialSeedMandates(): MandateRecord[] {
  return [
    {
      id: 'MND-STREAMBOX-01',
      mandateReference: 'UMN-STREAMBOX-9821@okaxis',
      commitmentId: 'CMT-STREAMBOX',
      merchantId: 'MERCH-STREAMBOX',
      merchantName: 'StreamBox Media Pvt Ltd',
      paymentRail: 'UPI_AUTOPAY',
      maxAmountMinor: 99900, // ₹999.00 maximum mandate limit (Section 22 Judge Demo)
      maxAmount: 999,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-06-10',
      endDate: '2028-06-10',
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'MND-MUSICFLOW-01',
      mandateReference: 'UMN-MUSICFLOW-4410@okicici',
      commitmentId: 'CMT-MUSICFLOW',
      merchantId: 'MERCH-MUSICFLOW',
      merchantName: 'MusicFlow India Ltd',
      paymentRail: 'UPI_AUTOPAY',
      maxAmountMinor: 50000, // ₹500.00 max limit
      maxAmount: 500,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-06-15',
      endDate: '2028-06-15',
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'MND-CLOUDNOTES-01',
      mandateReference: 'GPAY-SUB-CN8812',
      commitmentId: 'CMT-CLOUDNOTES',
      merchantId: 'MERCH-CLOUDNOTES',
      merchantName: 'CloudNotes Workspace',
      paymentRail: 'GOOGLE_PLAY',
      maxAmountMinor: 149900, // ₹1,499.00 annual
      maxAmount: 1499,
      currency: 'INR',
      frequency: 'YEARLY',
      startDate: '2024-10-12',
      endDate: null,
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    // Note: CMT-FITCLUB intentionally has NO imported MandateRecord so we demonstrate
    // TRANSACTION_WITHOUT_VISIBLE_MANDATE ("No matching mandate was found in the available imported records.")
    {
      id: 'MND-BESCOM-01',
      mandateReference: 'BBPS-KA-BESCOM-2291',
      commitmentId: 'CMT-BESCOM',
      merchantId: 'MERCH-BESCOM',
      merchantName: 'BESCOM Electricity',
      paymentRail: 'UPI_AUTOPAY',
      maxAmountMinor: 500000, // ₹5,000.00 utility auto-debit ceiling
      maxAmount: 5000,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-01-05',
      endDate: null,
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'MND-MAXLIFE-01',
      mandateReference: 'NACH-MAXL-772190',
      commitmentId: 'CMT-MAXLIFE',
      merchantId: 'MERCH-MAXLIFE',
      merchantName: 'Max Life Insurance Co Ltd',
      paymentRail: 'ENACH_NACH',
      maxAmountMinor: 1500000, // ₹15,000.00 NACH cap (covers ₹12,850 debit so cadence mismatch triggers FREQUENCY_DISCREPANCY)
      maxAmount: 15000,
      currency: 'INR',
      frequency: 'QUARTERLY',
      startDate: '2025-11-01',
      endDate: '2035-11-01',
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'MND-READCLOUD-01',
      mandateReference: 'SI-ICICI-RC-3318',
      commitmentId: 'CMT-READCLOUD',
      merchantId: 'MERCH-READCLOUD',
      merchantName: 'ReadCloud Digital Publishing',
      paymentRail: 'CARD_EMANDATE',
      maxAmountMinor: 29900, // ₹299.00
      maxAmount: 299,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-03-19',
      endDate: null,
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'MND-LEARNPRO-01',
      mandateReference: 'UMN-LEARNPRO-9991@okaxis',
      commitmentId: 'CMT-LEARNPRO',
      merchantId: 'MERCH-LEARNPRO',
      merchantName: 'LearnPro AI Labs',
      paymentRail: 'UPI_AUTOPAY',
      maxAmountMinor: 99900, // ₹999.00
      maxAmount: 999,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-10-08',
      endDate: '2027-10-08',
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'MND-BAJAJEMI-01',
      mandateReference: 'NACH-BAJAJ-EMI-55012',
      commitmentId: 'CMT-BAJAJEMI',
      merchantId: 'MERCH-BAJAJFIN',
      merchantName: 'Bajaj Finance Ltd',
      paymentRail: 'ENACH_NACH',
      maxAmountMinor: 845000, // ₹8,450.00
      maxAmount: 8450,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-01-05',
      endDate: '2028-01-05',
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
    {
      id: 'MND-DESIGNVAULT-01',
      mandateReference: 'SIHUB-REV-994012',
      commitmentId: 'CMT-DESIGNVAULT',
      merchantId: 'MERCH-DESIGNVAULT',
      merchantName: 'DesignVault Studio',
      paymentRail: 'CARD_EMANDATE',
      maxAmountMinor: 64900, // ₹649.00
      maxAmount: 649,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2026-06-14',
      endDate: '2026-09-10',
      mandateStatus: 'REVOCATION_REPORTED',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-09-10T14:35:00Z',
    },
    // Section 17.5: Mandate with no recent transactions (MANDATE_WITHOUT_RECENT_TRANSACTION)
    {
      id: 'MND-DORMANT-NEWSPLUS',
      mandateReference: 'UMN-NEWSPLUS-1088@okhdfcbank',
      commitmentId: null,
      merchantId: null,
      merchantName: 'NewsPlus Digital India',
      paymentRail: 'UPI_AUTOPAY',
      maxAmountMinor: 39900, // ₹399.00
      maxAmount: 399,
      currency: 'INR',
      frequency: 'MONTHLY',
      startDate: '2025-08-01',
      endDate: '2027-08-01',
      mandateStatus: 'ACTIVE',
      sourceType: 'DEMO_SEED',
      updatedAt: '2026-10-31T00:00:00Z',
    },
  ];
}

// ============================================================================
// 2. INITIAL SEED SERVICE TERMS / DOCUMENT INTELLIGENCE (Section 7, 8 & 17)
// Demonstrates:
// - StreamBox Premium 4K Invoice: ₹499.00/month
// - MusicFlow Family Plan Invoice: ₹199.00/month (while latest debit is ₹249.00 -> AMOUNT_DISCREPANCY)
// - CloudNotes Pro Annual Receipt: ₹1,499.00/year (MATCHED)
// - LearnPro AI Trial Terms: 14-day free trial converting to ₹999.00/month on 2026-10-22
// - Bajaj Finance EMI Sanction Schedule: ₹8,450.00/month (MATCHED)
// - DesignVault Cancellation Email Receipt: cancelled effective 2026-09-10 (CONFLICTING_EVIDENCE vs Oct 26 debit)
// - Max Life Insurance Quarterly Policy Schedule (₹12,850) vs Irregular NACH debits (FREQUENCY_DISCREPANCY)
// Note: CMT-READCLOUD and CMT-BESCOM have NO service terms record -> SERVICE_TERMS_UNAVAILABLE
// ============================================================================
export function buildInitialSeedServiceTerms(): ServiceTermsRecord[] {
  return [
    {
      id: 'DOC-STREAMBOX-01',
      commitmentId: 'CMT-STREAMBOX',
      merchantName: 'StreamBox Media Pvt Ltd',
      serviceName: 'StreamBox Ultra HD Plan',
      expectedAmountMinor: 49900, // ₹499.00 documented invoice price
      expectedAmount: 499,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      trialEndDate: null,
      renewalDate: '2026-11-10',
      cancellationNoticeDays: 2,
      documentSource: 'PASTED_INVOICE_TEXT',
      rawDocumentText:
        'INVOICE #SB-2026-0891 | StreamBox Media Pvt Ltd | Plan: StreamBox Ultra HD Monthly | Expected Cycle Charge: INR 499.00 (incl. GST) | Billing Cycle: Monthly on the 10th | Cancellation policy: Cancel at least 2 days before next billing date.',
      extractionConfidence: 96,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 499.00 (49900 paise)',
          confidence: 98,
          sourceSnippet: 'Expected Cycle Charge: INR 499.00 (incl. GST)',
          userVerified: true,
        },
        {
          fieldName: 'billingFrequency',
          extractedValue: 'MONTHLY',
          confidence: 96,
          sourceSnippet: 'Billing Cycle: Monthly on the 10th',
          userVerified: true,
        },
        {
          fieldName: 'cancellationNoticeDays',
          extractedValue: '2 days',
          confidence: 94,
          sourceSnippet: 'Cancel at least 2 days before next billing date',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-10-10T09:00:00Z',
    },
    {
      id: 'DOC-MUSICFLOW-01',
      commitmentId: 'CMT-MUSICFLOW',
      merchantName: 'MusicFlow India Ltd',
      serviceName: 'MusicFlow Family Plan',
      expectedAmountMinor: 19900, // ₹199.00 documented plan price vs ₹249.00 actual October debit!
      expectedAmount: 199,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      trialEndDate: null,
      renewalDate: '2026-11-15',
      cancellationNoticeDays: 1,
      documentSource: 'PASTED_INVOICE_TEXT',
      rawDocumentText:
        'MusicFlow India Subscription Receipt #MF-4410 | Plan: MusicFlow Family Monthly | Contracted Price: Rs. 199.00/month | Payment Rail: UPI AutoPay (Mandate limit Rs. 500.00) | Next renewal: 15-Nov-2026.',
      extractionConfidence: 95,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 199.00 (19900 paise)',
          confidence: 97,
          sourceSnippet: 'Contracted Price: Rs. 199.00/month',
          userVerified: true,
        },
        {
          fieldName: 'billingFrequency',
          extractedValue: 'MONTHLY',
          confidence: 95,
          sourceSnippet: 'Plan: MusicFlow Family Monthly',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-09-15T10:30:00Z',
    },
    {
      id: 'DOC-CLOUDNOTES-01',
      commitmentId: 'CMT-CLOUDNOTES',
      merchantName: 'CloudNotes Workspace',
      serviceName: 'CloudNotes Pro Annual',
      expectedAmountMinor: 149900, // ₹1,499.00
      expectedAmount: 1499,
      currency: 'INR',
      billingFrequency: 'YEARLY',
      trialEndDate: null,
      renewalDate: '2027-10-15',
      cancellationNoticeDays: 7,
      documentSource: 'STRUCTURED_JSON',
      rawDocumentText:
        'CloudNotes Pro Annual Renewal Receipt | Billed Yearly via Google Play: INR 1,499.00 | Next renewal date: 2027-10-15.',
      extractionConfidence: 98,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 1,499.00 (149900 paise)',
          confidence: 99,
          sourceSnippet: 'Billed Yearly via Google Play: INR 1,499.00',
          userVerified: true,
        },
        {
          fieldName: 'billingFrequency',
          extractedValue: 'YEARLY',
          confidence: 98,
          sourceSnippet: 'CloudNotes Pro Annual Renewal',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-10-15T12:00:00Z',
    },
    {
      id: 'DOC-FITCLUB-01',
      commitmentId: 'CMT-FITCLUB',
      merchantName: 'FitClub Wellness Membership',
      serviceName: 'FitClub Monthly Pass',
      expectedAmountMinor: 149900, // ₹1,499.00
      expectedAmount: 1499,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      trialEndDate: null,
      renewalDate: '2026-11-20',
      cancellationNoticeDays: 15,
      documentSource: 'PASTED_INVOICE_TEXT',
      rawDocumentText:
        'FitClub Pass Membership Agreement | Monthly Fee: INR 1,499.00 every month | Requires 15 days notice prior to renewal.',
      extractionConfidence: 93,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 1,499.00 (149900 paise)',
          confidence: 95,
          sourceSnippet: 'Monthly Fee: INR 1,499.00 every month',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-10-05T08:00:00Z',
    },
    {
      id: 'DOC-MAXLIFE-01',
      commitmentId: 'CMT-MAXLIFE',
      merchantName: 'Max Life Insurance Co Ltd',
      serviceName: 'Max Life Term Shield Policy',
      expectedAmountMinor: 1285000, // Documented ₹12,850.00 quarterly schedule vs observed IRREGULAR cadence (138d, 108d) -> FREQUENCY_DISCREPANCY
      expectedAmount: 12850,
      currency: 'INR',
      billingFrequency: 'QUARTERLY',
      trialEndDate: null,
      renewalDate: '2027-01-14',
      cancellationNoticeDays: 30,
      documentSource: 'PASTED_INVOICE_TEXT',
      rawDocumentText:
        'Max Life Term Shield Policy Schedule #ML-88912 | Documented Rider Schedule: INR 12,850.00 Quarterly | Collected via eNACH Mandate NACH-MAXL-772190.',
      extractionConfidence: 91,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 12,850.00 (1285000 paise)',
          confidence: 92,
          sourceSnippet: 'Documented Rider Schedule: INR 12,850.00 Quarterly',
          userVerified: true,
        },
        {
          fieldName: 'billingFrequency',
          extractedValue: 'QUARTERLY',
          confidence: 90,
          sourceSnippet: 'INR 12,850.00 Quarterly',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-10-14T11:00:00Z',
    },
    {
      id: 'DOC-LEARNPRO-01',
      commitmentId: 'CMT-LEARNPRO',
      merchantName: 'LearnPro AI Labs',
      serviceName: 'LearnPro AI Pro',
      expectedAmountMinor: 99900, // ₹999.00
      expectedAmount: 999,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      trialEndDate: '2026-10-22',
      renewalDate: '2026-11-22',
      cancellationNoticeDays: 1,
      documentSource: 'PASTED_INVOICE_TEXT',
      rawDocumentText:
        'LearnPro AI Pro Trial Confirmation | 14-Day Free Trial (2026-10-08 to 2026-10-22) | Auto-converts to INR 999.00/month on 2026-10-22 via UPI AutoPay unless cancelled before trial end.',
      extractionConfidence: 97,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 999.00 (99900 paise)',
          confidence: 98,
          sourceSnippet: 'Auto-converts to INR 999.00/month on 2026-10-22',
          userVerified: true,
        },
        {
          fieldName: 'trialEndDate',
          extractedValue: '2026-10-22',
          confidence: 99,
          sourceSnippet: '14-Day Free Trial (2026-10-08 to 2026-10-22)',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-10-08T10:00:00Z',
    },
    {
      id: 'DOC-BAJAJEMI-01',
      commitmentId: 'CMT-BAJAJEMI',
      merchantName: 'Bajaj Finance Ltd',
      serviceName: 'Bajaj Consumer Durable EMI',
      expectedAmountMinor: 845000, // ₹8,450.00
      expectedAmount: 8450,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      trialEndDate: null,
      renewalDate: '2026-11-02',
      cancellationNoticeDays: 30,
      documentSource: 'STRUCTURED_JSON',
      rawDocumentText:
        'Bajaj Finance Ltd Repayment Schedule | Fixed Monthly EMI: INR 8,450.00 on the 2nd of each month via NACH-BAJAJ-EMI-55012.',
      extractionConfidence: 99,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 8,450.00 (845000 paise)',
          confidence: 99,
          sourceSnippet: 'Fixed Monthly EMI: INR 8,450.00',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-06-05T09:00:00Z',
    },
    {
      id: 'DOC-DESIGNVAULT-01',
      commitmentId: 'CMT-DESIGNVAULT',
      merchantName: 'DesignVault Studio',
      serviceName: 'DesignVault Pro Subscription',
      expectedAmountMinor: 64900, // ₹649.00
      expectedAmount: 649,
      currency: 'INR',
      billingFrequency: 'MONTHLY',
      trialEndDate: null,
      renewalDate: null,
      cancellationNoticeDays: 1,
      documentSource: 'PASTED_INVOICE_TEXT',
      rawDocumentText:
        'DesignVault Studio Cancellation Confirmation #DV-CANC-20260910-881 | Plan: DesignVault Pro (INR 649.00/month) | Cancellation Effective Date: 2026-09-10 | Future billing terminated.',
      extractionConfidence: 97,
      extractedFields: [
        {
          fieldName: 'expectedAmount',
          extractedValue: 'INR 649.00 (64900 paise)',
          confidence: 97,
          sourceSnippet: 'Plan: DesignVault Pro (INR 649.00/month)',
          userVerified: true,
        },
        {
          fieldName: 'cancellationReference',
          extractedValue: 'DV-CANC-20260910-881 (Effective 2026-09-10)',
          confidence: 99,
          sourceSnippet: 'Cancellation Confirmation #DV-CANC-20260910-881 | Cancellation Effective Date: 2026-09-10',
          userVerified: true,
        },
      ],
      userVerified: true,
      createdAt: '2026-09-10T14:20:00Z',
    },
  ];
}

// ============================================================================
// 3. SERVICE DOCUMENT / INVOICE EXTRACTION PARSER (Section 8)
// Deterministic, explainable extraction of merchant, service, expectedAmountMinor,
// billingFrequency, trialEndDate, renewalDate, and cancellationNoticeDays from
// pasted invoice/receipt/confirmation text or structured JSON.
// ============================================================================
export function extractServiceTermsFromText(params: {
  commitmentId: string;
  merchantName?: string;
  serviceName?: string;
  rawText: string;
  documentSource?: ServiceTermsRecord['documentSource'];
  userVerified?: boolean;
}): ServiceTermsRecord {
  const {
    commitmentId,
    rawText,
    documentSource = 'PASTED_INVOICE_TEXT',
    userVerified = false,
  } = params;
  const text = rawText.trim();
  const isVerified = Boolean(userVerified);

  // Extract amount in INR / Rs / ₹ — never invent a fallback price when missing
  const amountRegex = /(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;
  const amountMatch = text.match(amountRegex);
  const parsedAmount = amountMatch
    ? parseFloat(amountMatch[1].replace(/,/g, ''))
    : null;
  const expectedAmountMinor =
    parsedAmount !== null && Number.isFinite(parsedAmount)
      ? toMinorUnits(parsedAmount)
      : null;
  const expectedAmount =
    expectedAmountMinor !== null ? fromMinorUnits(expectedAmountMinor) : null;

  // Extract billing frequency — missing billing frequency must remain UNKNOWN (never default to MONTHLY)
  let billingFrequency: RecurrenceFrequency = 'UNKNOWN';
  if (/annual|yearly|per\s+year|\/year|\/yr/i.test(text)) {
    billingFrequency = 'YEARLY';
  } else if (/quarter|quarterly|every\s+3\s+months/i.test(text)) {
    billingFrequency = 'QUARTERLY';
  } else if (/month|monthly|per\s+month|\/month|\/mo/i.test(text)) {
    billingFrequency = 'MONTHLY';
  } else if (/weekly|per\s+week/i.test(text)) {
    billingFrequency = 'WEEKLY';
  } else if (/fortnight/i.test(text)) {
    billingFrequency = 'FORTNIGHTLY';
  }

  // Extract dates (YYYY-MM-DD)
  const isoDates = text.match(/\b202[4-9]-[01]\d-[0-3]\d\b/g) || [];
  let trialEndDate: string | null = null;
  let renewalDate: string | null = null;
  if (/trial/i.test(text) && isoDates.length >= 1) {
    trialEndDate = isoDates[isoDates.length > 1 ? 1 : 0] ?? null;
  }
  if (/renewal|next\s+billing/i.test(text) && isoDates.length >= 1) {
    renewalDate = isoDates[isoDates.length - 1] ?? null;
  }

  // Extract cancellation notice days
  const noticeMatch = text.match(/(\d+)\s*days?\s*(?:before|prior|notice)/i);
  const cancellationNoticeDays = noticeMatch ? parseInt(noticeMatch[1], 10) : null;

  const merchantName = params.merchantName || 'Extracted Merchant';
  const serviceName = params.serviceName || 'Documented Service Plan';

  const extractedFields: ServiceTermsRecord['extractedFields'] = [
    {
      fieldName: 'expectedAmount',
      extractedValue:
        expectedAmountMinor !== null
          ? `${formatMinorINR(expectedAmountMinor)} (${expectedAmountMinor} paise)`
          : 'UNAVAILABLE (no currency token found in text)',
      confidence: expectedAmountMinor !== null ? 95 : 0,
      sourceSnippet: amountMatch
        ? amountMatch[0]
        : 'No INR / Rs. / ₹ currency token found in pasted text',
      userVerified: isVerified,
    },
    {
      fieldName: 'billingFrequency',
      extractedValue:
        billingFrequency !== 'UNKNOWN'
          ? billingFrequency
          : 'UNAVAILABLE (no cadence keyword found in text)',
      confidence: billingFrequency !== 'UNKNOWN' ? 92 : 0,
      sourceSnippet:
        billingFrequency !== 'UNKNOWN'
          ? `Detected cadence keyword -> ${billingFrequency}`
          : 'No monthly/yearly/quarterly/weekly cadence token found in text',
      userVerified: isVerified,
    },
  ];

  if (trialEndDate) {
    extractedFields.push({
      fieldName: 'trialEndDate',
      extractedValue: trialEndDate,
      confidence: 94,
      sourceSnippet: `Trial date token: ${trialEndDate}`,
      userVerified: isVerified,
    });
  }
  if (cancellationNoticeDays !== null) {
    extractedFields.push({
      fieldName: 'cancellationNoticeDays',
      extractedValue: `${cancellationNoticeDays} days`,
      confidence: 90,
      sourceSnippet: noticeMatch?.[0] || `${cancellationNoticeDays} days`,
      userVerified: isVerified,
    });
  }

  return {
    id: `DOC-${commitmentId}-${Date.now()}`,
    commitmentId,
    merchantName,
    serviceName,
    expectedAmountMinor,
    expectedAmount,
    currency: 'INR',
    billingFrequency,
    trialEndDate,
    renewalDate,
    cancellationNoticeDays,
    documentSource,
    rawDocumentText: text,
    extractionConfidence: expectedAmountMinor !== null ? 94 : 45,
    extractedFields,
    userVerified: isVerified,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// 4. THREE-WAY FINANCIAL RECONCILIATION ENGINE (Section 7)
// Compares:
//   (1) Actual Transactions (statement debits)
//   (2) Available Payment Authorisations (MandateRecord)
//   (3) Documented Service Terms / Invoices (ServiceTermsRecord)
//
// Produces all 9 mandatory statuses:
// - MATCHED
// - AMOUNT_DISCREPANCY
// - FREQUENCY_DISCREPANCY
// - TRANSACTION_WITHOUT_VISIBLE_MANDATE
// - MANDATE_WITHOUT_RECENT_TRANSACTION
// - SERVICE_TERMS_UNAVAILABLE
// - POSSIBLE_DUPLICATE
// - CONFLICTING_EVIDENCE
// - UNRESOLVED
//
// Epistemic Honesty (Section 1.2 & Section 7):
// - Never declares an amount discrepancy or post-cancellation debit as "fraud".
// - Never claims "no mandate exists" if no mandate was imported; states:
//   "No matching mandate was found in the available imported records."
// ============================================================================
export type EffectiveMandateStatus =
  | 'ACTIVE_VALID'
  | 'EXPIRED'
  | 'REVOKED'
  | 'PENDING'
  | 'UNKNOWN'
  | 'INCOMPLETE';

export function getMissingMandateFields(mandate: MandateRecord | null): string[] {
  if (!mandate) return ['mandate_record'];
  const missing: string[] = [];
  if (!mandate.mandateReference) missing.push('mandateReference');
  if (mandate.maxAmountMinor === null || mandate.maxAmountMinor === undefined) missing.push('maxAmount');
  if (!mandate.paymentRail || mandate.paymentRail === 'UNKNOWN') missing.push('paymentRail');
  if (!mandate.frequency || mandate.frequency === 'UNKNOWN') missing.push('frequency');
  if (!mandate.startDate) missing.push('startDate');
  if (!mandate.mandateStatus || mandate.mandateStatus === 'UNKNOWN') missing.push('mandateStatus');
  return missing;
}

export function getEffectiveMandateStatus(
  mandate: MandateRecord | null,
  evaluationDate: Date = new Date()
): EffectiveMandateStatus {
  if (!mandate) return 'UNKNOWN';
  if (
    mandate.maxAmountMinor === null ||
    mandate.maxAmountMinor === undefined ||
    mandate.maxAmountMinor <= 0 ||
    mandate.frequency === 'UNKNOWN' ||
    mandate.paymentRail === 'UNKNOWN' ||
    mandate.isIncomplete
  ) {
    return 'INCOMPLETE';
  }
  if (!mandate.mandateReference || mandate.mandateStatus === 'UNKNOWN') {
    return 'UNKNOWN';
  }
  if (mandate.mandateStatus === 'PENDING_VERIFICATION') {
    return 'PENDING';
  }
  if (
    mandate.mandateStatus === 'REVOKED' ||
    mandate.mandateStatus === 'REVOCATION_REPORTED'
  ) {
    return 'REVOKED';
  }
  if (mandate.mandateStatus === 'EXPIRED') {
    return 'EXPIRED';
  }
  if (mandate.endDate) {
    const endMs = Date.parse(mandate.endDate);
    if (!isNaN(endMs) && endMs < evaluationDate.getTime()) {
      return 'EXPIRED';
    }
  }
  if (mandate.mandateStatus === 'ACTIVE') {
    return 'ACTIVE_VALID';
  }
  return 'UNKNOWN';
}

export function reconcileCommitment(params: {
  commitment: CommitmentRecord;
  transactions: TransactionRecord[];
  mandate: MandateRecord | null;
  serviceTerms: ServiceTermsRecord | null;
  cancellationSession?: CancellationSessionRecord | null;
  session?: CancellationSessionRecord | null;
}): ReconciliationFindingRecord {
  const { commitment, transactions, mandate, serviceTerms } = params;
  const cancellationSession = params.cancellationSession ?? params.session ?? null;
  const evaluatedAt = new Date().toISOString();

  const cmtTxns = transactions
    .filter((t) => t.commitmentId === commitment.id && t.direction === 'DEBIT')
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  const cmtCreditTxns = transactions
    .filter(
      (t) =>
        (t.commitmentId === commitment.id ||
          (Boolean(t.merchantId) && t.merchantId === commitment.merchantId)) &&
        t.direction === 'CREDIT'
    )
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  const expectedServiceAmountMinor =
    serviceTerms && serviceTerms.expectedAmountMinor !== null
      ? serviceTerms.expectedAmountMinor
      : null;
  const expectedServiceAmount =
    expectedServiceAmountMinor !== null ? fromMinorUnits(expectedServiceAmountMinor) : null;

  const mandateMaxAmountMinor = mandate ? mandate.maxAmountMinor : null;
  const mandateMaxAmount =
    mandateMaxAmountMinor !== null ? fromMinorUnits(mandateMaxAmountMinor) : null;

  // Handle commitment with an active mandate but zero debit transactions in the imported statement period
  if (cmtTxns.length === 0) {
    const effectiveStatusForZeroTxns = getEffectiveMandateStatus(mandate, new Date(evaluatedAt));
    const isMandateActiveWithNoTxns =
      Boolean(mandate) && effectiveStatusForZeroTxns === 'ACTIVE_VALID';

    if (isMandateActiveWithNoTxns && mandate) {
      return {
        id: `REC-${commitment.id}`,
        commitmentId: commitment.id,
        merchantName: commitment.merchantName,
        serviceName: commitment.serviceName,
        status: 'MANDATE_WITHOUT_RECENT_TRANSACTION',
        expectedServiceAmountMinor,
        expectedServiceAmount,
        actualTransactionAmountMinor: 0,
        actualTransactionAmount: 0,
        mandateMaxAmountMinor,
        mandateMaxAmount,
        discrepancyAmountMinor: null,
        discrepancyAmount: null,
        discrepancyPercent: null,
        withinMandateLimit: true,
        latestTransactionId: null,
        mandateReference: mandate.mandateReference,
        serviceDocumentId: serviceTerms?.id ?? null,
        explanation: `Active ${mandate.paymentRail.replace(/_/g, ' ')} mandate ${
          mandate.mandateReference
        } for ${commitment.serviceName} (ceiling ${formatMinorINR(
          mandate.maxAmountMinor
        )}/${mandate.frequency.toLowerCase()}) is linked to ${
          commitment.id
        }, but no matching debit transactions occurred in the imported statement period.`,
        epistemicCaveat:
          'An active mandate without recent debits still permits future automated collection up to the authorised ceiling unless revoked.',
        recommendedAction:
          'Verify whether this subscription is still needed; if not, revoke the active mandate in your UPI/bank portal before the next billing cycle.',
        evidenceRecordIds: [
          mandate.id,
          mandate.mandateReference,
          ...(serviceTerms ? [serviceTerms.id] : []),
        ],
        evaluatedAt,
        discrepancyDetails: {
          missingMandateFields: getMissingMandateFields(mandate),
          missingTermsFields: !serviceTerms ? ['terms_document'] : expectedServiceAmountMinor === null ? ['expectedAmount'] : [],
          discrepancyReason: 'Mandate is active without matching debit transactions in imported period.',
        },
      };
    }

    return {
      id: `REC-${commitment.id}`,
      commitmentId: commitment.id,
      merchantName: commitment.merchantName,
      serviceName: commitment.serviceName,
      status: 'UNRESOLVED',
      expectedServiceAmountMinor,
      expectedServiceAmount,
      actualTransactionAmountMinor: 0,
      actualTransactionAmount: 0,
      mandateMaxAmountMinor,
      mandateMaxAmount,
      discrepancyAmountMinor: null,
      discrepancyAmount: null,
      discrepancyPercent: null,
      withinMandateLimit: null,
      latestTransactionId: null,
      mandateReference: mandate?.mandateReference ?? commitment.mandateRef ?? null,
      serviceDocumentId: serviceTerms?.id ?? null,
      explanation: `No debit transactions were found in the imported statement period for ${commitment.serviceName}.`,
      epistemicCaveat:
        'Reconciliation requires at least one statement debit or an active payment mandate in the imported records.',
      recommendedAction: 'Import statements covering the relevant billing period to evaluate this commitment.',
      evidenceRecordIds: [
        ...(mandate ? [mandate.id, mandate.mandateReference] : []),
        ...(serviceTerms ? [serviceTerms.id] : []),
      ],
      evaluatedAt,
      discrepancyDetails: {
        missingMandateFields: getMissingMandateFields(mandate),
        missingTermsFields: !serviceTerms ? ['terms_document'] : expectedServiceAmountMinor === null ? ['expectedAmount'] : [],
        discrepancyReason: `No debit transactions were found in the imported statement period for ${commitment.serviceName}.`,
      },
    };
  }

  const latestTxn = cmtTxns[cmtTxns.length - 1];
  const actualTransactionAmountMinor = toMinorUnits(latestTxn.amount);
  const actualTransactionAmount = fromMinorUnits(actualTransactionAmountMinor);
  const latestTxnDate = latestTxn.transactionDate || commitment.lastPaymentDate;

  const withinMandateLimit =
    mandateMaxAmountMinor !== null
      ? actualTransactionAmountMinor <= mandateMaxAmountMinor
      : null;

  const discrepancyAmountMinor =
    expectedServiceAmountMinor !== null
      ? actualTransactionAmountMinor - expectedServiceAmountMinor
      : null;
  const discrepancyAmount =
    discrepancyAmountMinor !== null ? fromMinorUnits(discrepancyAmountMinor) : null;

  const discrepancyPercent =
    expectedServiceAmountMinor && expectedServiceAmountMinor > 0 && discrepancyAmountMinor !== null
      ? Number(((discrepancyAmountMinor / expectedServiceAmountMinor) * 100).toFixed(2))
      : null;

  const evidenceRecordIds: string[] = [
    ...cmtTxns.map((t) => t.id),
    ...(mandate ? [mandate.id, mandate.mandateReference] : []),
    ...(serviceTerms ? [serviceTerms.id] : []),
    ...(cancellationSession?.evidence.map((e) => e.id) || []),
  ];

  // Check for duplicate debits on the same date or within 2 days with identical amount,
  // excluding pairs that have a matching CREDIT reversal or refund within 7 days.
  let hasPossibleDuplicate = false;
  let duplicatePairIds: [string, string] | null = null;
  const consumedCreditIds = new Set<string>();

  for (let i = 1; i < cmtTxns.length; i++) {
    const prev = cmtTxns[i - 1];
    const curr = cmtTxns[i];
    const prevMinor = toMinorUnits(prev.amount);
    const currMinor = toMinorUnits(curr.amount);
    const daysApart = Math.round(
      Math.abs(Date.parse(curr.transactionDate) - Date.parse(prev.transactionDate)) /
        (1000 * 60 * 60 * 24)
    );
    if (daysApart <= 2 && prevMinor === currMinor) {
      const matchingReversal = cmtCreditTxns.find((cred) => {
        if (consumedCreditIds.has(cred.id)) return false;
        if (toMinorUnits(cred.amount) !== currMinor) return false;
        const credTime = Date.parse(cred.transactionDate);
        const prevTime = Date.parse(prev.transactionDate);
        const daysSinceFirstDebit = (credTime - prevTime) / (1000 * 60 * 60 * 24);
        return daysSinceFirstDebit >= 0 && daysSinceFirstDebit <= 7;
      });

      if (matchingReversal) {
        consumedCreditIds.add(matchingReversal.id);
      } else {
        hasPossibleDuplicate = true;
        duplicatePairIds = [prev.id, curr.id];
        break;
      }
    }
  }

  // Verify mandate lifecycle status and effective validity against the latest debit date
  const evalDate = latestTxnDate ? new Date(latestTxnDate) : new Date(evaluatedAt);
  const effectiveMandateStatus = getEffectiveMandateStatus(mandate, evalDate);
  const missingMandateFields = getMissingMandateFields(mandate);
  const isMandateExpired = effectiveMandateStatus === 'EXPIRED';
  const isMandateActive = effectiveMandateStatus === 'ACTIVE_VALID';

  // Check for Post-Cancellation Debit / Conflicting Evidence (Section 17.4)
  const hasPostCancelDebit =
    (cancellationSession && cancellationSession.postCancellationTransactionIds.length > 0) ||
    commitment.status === 'POST_CANCEL_ALERT';

  let status: ReconciliationOutcomeStatus = 'MATCHED';
  let explanation = '';
  let epistemicCaveat =
    'Reconciliation compares imported statement transactions, available mandate records, and user-provided or seeded service terms.';
  let recommendedAction = 'No immediate intervention required; continue routine statement monitoring.';

  if (hasPostCancelDebit) {
    status = 'CONFLICTING_EVIDENCE';
    const postTxnId =
      cancellationSession?.postCancellationTransactionIds[0] || latestTxn.id;

    // Retrieve specific evidence records by evidenceType — never use generic fallback dates or fabricated references
    const serviceCancelEvidence =
      cancellationSession?.evidence.find((e) => e.evidenceType === 'SERVICE_CONFIRMATION') ||
      null;
    const mandateRevokeEvidence =
      cancellationSession?.evidence.find((e) => e.evidenceType === 'MANDATE_REVOCATION') ||
      null;

    const hasServiceCancellation = Boolean(
      cancellationSession?.serviceCancelledAt ||
        serviceCancelEvidence ||
        commitment.serviceLifecycleStatus === 'CANCELLED' ||
        commitment.serviceLifecycleStatus === 'CANCELLATION_REPORTED_BY_USER' ||
        commitment.serviceLifecycleStatus === 'CANCELLATION_EVIDENCE_ATTACHED'
    );
    const hasMandateRevocation = Boolean(
      cancellationSession?.paymentAuthorisationRevokedAt ||
        mandateRevokeEvidence ||
        mandate?.mandateStatus === 'REVOKED' ||
        mandate?.mandateStatus === 'REVOCATION_REPORTED' ||
        commitment.mandateLifecycleStatus === 'REVOKED' ||
        commitment.mandateLifecycleStatus === 'REVOCATION_REPORTED_BY_USER' ||
        commitment.mandateLifecycleStatus === 'REVOCATION_EVIDENCE_ATTACHED'
    );

    const serviceDateStr =
      cancellationSession?.serviceCancelledAt || serviceCancelEvidence?.evidenceDate || null;
    const serviceRefStr = serviceCancelEvidence?.referenceNumber || null;

    const mandateDateStr =
      cancellationSession?.paymentAuthorisationRevokedAt ||
      mandateRevokeEvidence?.evidenceDate ||
      null;
    const mandateRefStr =
      mandateRevokeEvidence?.referenceNumber || mandate?.mandateReference || null;

    let recordedLifecycleSummary = '';
    if (hasServiceCancellation && hasMandateRevocation) {
      const sPart = `service cancellation${serviceDateStr ? ` on ${serviceDateStr}` : ''}${
        serviceRefStr ? ` (Service Ref: ${serviceRefStr})` : ' (user-reported)'
      }`;
      const mPart = `mandate revocation${mandateDateStr ? ` on ${mandateDateStr}` : ''}${
        mandateRefStr ? ` (Mandate Ref: ${mandateRefStr})` : ' (user-reported)'
      }`;
      recordedLifecycleSummary = `Both ${sPart} and ${mPart} were recorded`;
    } else if (hasServiceCancellation) {
      recordedLifecycleSummary = `Service cancellation was recorded${
        serviceDateStr ? ` on ${serviceDateStr}` : ''
      }${
        serviceRefStr ? ` (Service Ref: ${serviceRefStr})` : ' (user-reported)'
      }, whereas mandate revocation is not recorded (${
        commitment.mandateLifecycleStatus || mandate?.mandateStatus || 'ACTIVE'
      })`;
    } else if (hasMandateRevocation) {
      recordedLifecycleSummary = `Mandate revocation was recorded${
        mandateDateStr ? ` on ${mandateDateStr}` : ''
      }${
        mandateRefStr ? ` (Mandate Ref: ${mandateRefStr})` : ' (user-reported)'
      }, whereas service cancellation is not recorded (${
        commitment.serviceLifecycleStatus || 'ACTIVE'
      })`;
    } else {
      recordedLifecycleSummary = 'A prior cancellation state was flagged on this commitment';
    }

    explanation = `Conflicting evidence detected: ${recordedLifecycleSummary}, but debit ${postTxnId} of ${formatMinorINR(
      actualTransactionAmountMinor
    )} occurred on ${latestTxnDate}.`;
    epistemicCaveat =
      'DebitLens does not declare this debit to be fraud. A post-cancellation debit may reflect a trailing billing period, delayed settlement, or an unrevoked standing instruction at the bank/card issuer.';
    recommendedAction =
      'Compare the cancellation effective date against the billing cycle cut-off and raise a dispute with your bank/card issuer citing your saved cancellation or mandate references.';
  } else if (mandate && effectiveMandateStatus === 'INCOMPLETE') {
    status = 'UNRESOLVED';
    explanation = `Payment mandate ${mandate.mandateReference || 'record'} has incomplete details (${missingMandateFields.join(
      ', '
    )}). Incomplete mandate records cannot establish a verified MATCHED outcome.`;
    epistemicCaveat =
      'Authorisation requires confirmed ceiling amount, billing frequency, and payment rail before full three-way reconciliation can be verified.';
    recommendedAction =
      'Verify missing mandate fields from your banking portal or card account to confirm collection limits.';
  } else if (mandate && isMandateExpired) {
    status = 'CONFLICTING_EVIDENCE';
    explanation = `Conflicting evidence detected: Debit ${latestTxn.id} of ${formatMinorINR(
      actualTransactionAmountMinor
    )} occurred on ${latestTxnDate}, whereas linked mandate ${
      mandate.mandateReference
    } expired on ${mandate.endDate} prior to the debit date.`;
    epistemicCaveat =
      'DebitLens flags a conflict between the imported mandate lifecycle/expiry record and the observed statement debit without claiming fraud.';
    recommendedAction =
      'Verify with your bank or UPI app whether the mandate was re-authorised under a new reference or settled from a pre-expiry presentation.';
  } else if (mandate && (effectiveMandateStatus === 'REVOKED' || mandate.mandateStatus === 'REVOKED' || mandate.mandateStatus === 'REVOCATION_REPORTED')) {
    status = 'CONFLICTING_EVIDENCE';
    explanation = `Actual debit occurred on ${latestTxn.transactionDate}, but payment mandate ${mandate.mandateReference} is recorded as ${mandate.mandateStatus}.`;
    epistemicCaveat =
      'Debits appearing after recorded mandate revocation represent an authorisation conflict.';
    recommendedAction =
      'Initiate a mandate dispute with your bank or contact the merchant to reverse the charge.';
  } else if (mandate && mandate.mandateStatus !== 'ACTIVE') {
    status = 'CONFLICTING_EVIDENCE';
    explanation = `Conflicting evidence detected: Debit ${latestTxn.id} of ${formatMinorINR(
      actualTransactionAmountMinor
    )} occurred on ${latestTxnDate}, whereas linked mandate ${
      mandate.mandateReference
    } has lifecycle status ${mandate.mandateStatus}.`;
    epistemicCaveat =
      'DebitLens flags a conflict between non-active mandate status and observed statement debit.';
    recommendedAction =
      'Verify with your bank whether mandate was paused or cancelled.';
  } else if (hasPossibleDuplicate) {
    status = 'POSSIBLE_DUPLICATE';
    explanation = `Detected two debits (${
      duplicatePairIds ? duplicatePairIds.join(' and ') : 'consecutive debits'
    }) of ${formatMinorINR(
      actualTransactionAmountMinor
    )} within 48 hours for ${commitment.serviceName} with no matching credit reversal in the imported statement.`;
    epistemicCaveat =
      'Could represent a retry after a failed settlement or an accidental double-billing event.';
    recommendedAction =
      'Check bank statement for a subsequent credit reversal or contact merchant billing support with both transaction references.';
  } else if (!mandate) {
    status = 'TRANSACTION_WITHOUT_VISIBLE_MANDATE';
    explanation = `Recurring debits of ${formatMinorINR(
      actualTransactionAmountMinor
    )} (${commitment.recurrenceType.toLowerCase()}) are present in statement records, but no matching mandate was found in the available imported records.`;
    epistemicCaveat =
      'Absence of a mandate in DebitLens means no matching mandate record was imported—it does NOT prove that no bank/card authorisation exists.';
    recommendedAction =
      'Import your card standing instruction / UPI AutoPay mandate list or inspect your card issuer SIHub portal to verify active collection authority.';
  } else if (!serviceTerms || expectedServiceAmountMinor === null || serviceTerms.billingFrequency === 'UNKNOWN') {
    status = 'SERVICE_TERMS_UNAVAILABLE';
    const missingReason = !serviceTerms
      ? `no invoice or service terms document has been attached for ${commitment.serviceName}`
      : expectedServiceAmountMinor === null
      ? `attached service document ${serviceTerms.id} does not contain an extractable expected billing amount`
      : `attached service document ${serviceTerms.id} does not specify a documented billing frequency`;
    explanation = `Actual debit (${formatMinorINR(
      actualTransactionAmountMinor
    )}) is within active mandate ${mandate.mandateReference} ceiling (${formatMinorINR(
      mandateMaxAmountMinor || 0
    )}), but ${missingReason}.`;
    epistemicCaveat =
      'Without a documented service price and verified billing frequency in the terms record, DebitLens can verify mandate ceiling compliance but cannot verify whether the billed amount and schedule match your contracted plan terms.';
    recommendedAction =
      'Attach or verify the contracted plan amount and billing frequency in the Service Terms panel to complete three-way reconciliation.';
  } else if (
    discrepancyAmountMinor !== null &&
    Math.abs(discrepancyAmountMinor) > 0 &&
    !commitment.variableAmount
  ) {
    status = 'AMOUNT_DISCREPANCY';
    const sign = discrepancyAmountMinor > 0 ? '+' : '';
    const mandateClause =
      mandateMaxAmountMinor !== null
        ? withinMandateLimit
          ? `The debit is within the active ${mandate.paymentRail.replace(
              /_/g,
              ' '
            )} mandate maximum limit of ${formatMinorINR(
              mandateMaxAmountMinor
            )} (${mandate.mandateReference}), which explains why the payment rail permitted collection.`
          : `The debit ALSO exceeds the imported mandate maximum limit of ${formatMinorINR(
              mandateMaxAmountMinor
            )} (${mandate.mandateReference}).`
        : '';
    explanation = `Documented service price in ${serviceTerms.id} is ${formatMinorINR(
      expectedServiceAmountMinor
    )}, whereas the latest actual debit (${latestTxn.id}) is ${formatMinorINR(
      actualTransactionAmountMinor
    )} — a difference of ${sign}${formatMinorINR(discrepancyAmountMinor)} (${sign}${discrepancyPercent}%). ${mandateClause}`;
    epistemicCaveat =
      'DebitLens reports an amount discrepancy between your documented service price and actual statement debit. It does not claim fraud—this difference could reflect a tier upgrade, promotional discount expiry, tax adjustment, or unannounced price revision.';
    recommendedAction =
      'Review your latest merchant invoice or plan tier; if the price revision was not agreed to, initiate the Two-Layer Cancellation workflow or lower your mandate cap.';
  } else if (
    serviceTerms &&
    serviceTerms.billingFrequency !== commitment.recurrenceType &&
    !(
      serviceTerms.billingFrequency === 'MONTHLY' &&
      (commitment.recurrenceType === 'TRIAL_CONVERTED' || commitment.recurrenceType === 'RESUMED')
    )
  ) {
    status = 'FREQUENCY_DISCREPANCY';
    explanation = `Documented service schedule in ${serviceTerms.id} specifies ${serviceTerms.billingFrequency} billing (${formatMinorINR(
      expectedServiceAmountMinor
    )}), whereas observed statement debits follow an ${commitment.recurrenceType} cadence (latest debit ${formatMinorINR(
      actualTransactionAmountMinor
    )}).`;
    epistemicCaveat =
      'Observed debit intervals differ from the documented billing cadence, which may happen when riders, manual top-ups, or off-cycle NACH presentations occur.';
    recommendedAction =
      'Inspect the policy or billing schedule endorsement with the merchant before altering the NACH/AutoPay mandate.';
  } else if (effectiveMandateStatus === 'INCOMPLETE') {
    status = 'UNRESOLVED';
    explanation = `Payment mandate ${mandate.mandateReference} has incomplete details (${missingMandateFields.join(
      ', '
    )}). Incomplete mandate records cannot establish a verified MATCHED outcome.`;
    epistemicCaveat =
      'Authorisation requires confirmed ceiling amount, billing frequency, and payment rail before full three-way reconciliation can be verified.';
    recommendedAction =
      'Verify missing mandate fields from your banking portal or card account to confirm collection limits.';
  } else if (effectiveMandateStatus === 'EXPIRED') {
    status = 'CONFLICTING_EVIDENCE';
    explanation = `Actual debit of ${formatMinorINR(
      actualTransactionAmountMinor
    )} occurred on ${latestTxn.transactionDate}, but payment mandate ${
      mandate.mandateReference
    } expired on ${mandate.endDate}. Continued automated debit under an expired authorisation requires immediate review.`;
    epistemicCaveat =
      'Expired mandates should not permit automated debit presentations under banking recurring regulations.';
    recommendedAction =
      'Verify with your bank/card issuer whether the recurring mandate was renewed or should be revoked.';
  } else if (effectiveMandateStatus === 'REVOKED') {
    status = 'CONFLICTING_EVIDENCE';
    explanation = `Actual debit occurred on ${latestTxn.transactionDate}, but payment mandate ${mandate.mandateReference} is recorded as ${mandate.mandateStatus}.`;
    epistemicCaveat =
      'Debits appearing after recorded mandate revocation represent an authorisation conflict.';
    recommendedAction =
      'Initiate a mandate dispute with your bank or contact the merchant to reverse the charge.';
  } else {
    status = 'MATCHED';
    explanation = `Three-way reconciliation matched: Actual debit of ${formatMinorINR(
      actualTransactionAmountMinor
    )} (${latestTxn.id}) matches documented service terms (${formatMinorINR(
      expectedServiceAmountMinor
    )} ${serviceTerms.billingFrequency.toLowerCase()}) and executes within active mandate ${
      mandate.mandateReference
    } ceiling (${formatMinorINR(mandateMaxAmountMinor || actualTransactionAmountMinor)}).`;
    epistemicCaveat =
      'All three layers (statement transaction, active payment mandate ceiling, and documented service price) are aligned across available imported records.';
    recommendedAction = 'Commitment is reconciled across statement, mandate, and service terms.';
  }

  return {
    id: `REC-${commitment.id}`,
    commitmentId: commitment.id,
    merchantName: commitment.merchantName,
    serviceName: commitment.serviceName,
    status,
    expectedServiceAmountMinor,
    expectedServiceAmount,
    actualTransactionAmountMinor,
    actualTransactionAmount,
    mandateMaxAmountMinor,
    mandateMaxAmount,
    discrepancyAmountMinor,
    discrepancyAmount,
    discrepancyPercent,
    withinMandateLimit,
    latestTransactionId: latestTxn.id,
    mandateReference: mandate?.mandateReference ?? commitment.mandateRef ?? null,
    serviceDocumentId: serviceTerms?.id ?? null,
    explanation,
    epistemicCaveat,
    recommendedAction,
    evidenceRecordIds,
    evaluatedAt,
    discrepancyDetails: {
      missingMandateFields,
      missingTermsFields: !serviceTerms ? ['terms_document'] : expectedServiceAmountMinor === null ? ['expectedAmount'] : [],
      discrepancyReason: explanation,
    },
  };
}

export function runFullReconciliation(params: {
  commitments: CommitmentRecord[];
  transactions: TransactionRecord[];
  mandates: MandateRecord[];
  serviceTerms: ServiceTermsRecord[];
  sessions: CancellationSessionRecord[];
}): ReconciliationFindingRecord[] {
  const { commitments, transactions, mandates, serviceTerms, sessions } = params;
  const findings: ReconciliationFindingRecord[] = [];
  const evaluatedAt = new Date().toISOString();

  for (const cmt of commitments) {
    const mandate =
      mandates.find(
        (m) =>
          m.commitmentId === cmt.id ||
          (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
      ) || null;
    const terms = serviceTerms.find((s) => s.commitmentId === cmt.id) || null;
    const sess = sessions.find((s) => s.commitmentId === cmt.id) || null;
    findings.push(
      reconcileCommitment({
        commitment: cmt,
        transactions,
        mandate,
        serviceTerms: terms,
        cancellationSession: sess,
      })
    );
  }

  // Also include MANDATE_WITHOUT_RECENT_TRANSACTION for any active mandate either not linked to a commitment
  // or linked to a commitment that had no debit transactions in the imported statement window (Section 17.5)
  for (const mnd of mandates) {
    const effStatus = getEffectiveMandateStatus(mnd, new Date(evaluatedAt));
    if (effStatus !== 'ACTIVE_VALID') continue;
    const alreadyReported = findings.some(
      (f) =>
        f.mandateReference === mnd.mandateReference &&
        f.status === 'MANDATE_WITHOUT_RECENT_TRANSACTION'
    );
    if (alreadyReported) continue;

    const linkedCommitment = mnd.commitmentId
      ? commitments.find((c) => c.id === mnd.commitmentId) || null
      : null;
    const hasRecentDebitForMandate = linkedCommitment
      ? transactions.some(
          (t) => t.commitmentId === linkedCommitment.id && t.direction === 'DEBIT'
        )
      : false;

    if (!linkedCommitment || !hasRecentDebitForMandate) {
      findings.push({
        id: `REC-${mnd.id}`,
        commitmentId: linkedCommitment ? linkedCommitment.id : mnd.id,
        merchantName: mnd.merchantName,
        serviceName: linkedCommitment
          ? linkedCommitment.serviceName
          : `${mnd.merchantName} (${mnd.paymentRail.replace(/_/g, ' ')})`,
        status: 'MANDATE_WITHOUT_RECENT_TRANSACTION',
        expectedServiceAmountMinor: null,
        expectedServiceAmount: null,
        actualTransactionAmountMinor: 0,
        actualTransactionAmount: 0,
        mandateMaxAmountMinor: mnd.maxAmountMinor,
        mandateMaxAmount: mnd.maxAmount,
        discrepancyAmountMinor: null,
        discrepancyAmount: null,
        discrepancyPercent: null,
        withinMandateLimit: true,
        latestTransactionId: null,
        mandateReference: mnd.mandateReference,
        serviceDocumentId: null,
        explanation: `Imported mandate ${mnd.mandateReference} for ${mnd.merchantName} (ceiling ${formatMinorINR(
          mnd.maxAmountMinor
        )}/${mnd.frequency.toLowerCase()}) remains ACTIVE since ${
          mnd.startDate
        }, but no recent debit transactions were found in the imported statement window.`,
        epistemicCaveat:
          'An active mandate without recent debits still permits future automated collection up to the authorised ceiling unless revoked.',
        recommendedAction:
          'If you no longer use this service, revoke the dormant UPI AutoPay / standing instruction mandate in your payment app so it cannot trigger an unexpected future debit.',
        evidenceRecordIds: [mnd.id, mnd.mandateReference],
        evaluatedAt,
      });
    }
  }

  // Also include UNRESOLVED finding summary for processor-only isolated transactions (Section 17.6)
  const unresolvedTxns = transactions.filter((t) => t.resolutionStatus === 'UNRESOLVED');
  if (unresolvedTxns.length > 0) {
    const latestUnres = unresolvedTxns[unresolvedTxns.length - 1];
    const amtMinor = toMinorUnits(latestUnres.amount);
    findings.push({
      id: 'REC-UNRESOLVED-POOL',
      commitmentId: 'UNRESOLVED-POOL',
      merchantName: 'Unresolved Processor / Mechanism Descriptors',
      serviceName: `${unresolvedTxns.length} Isolated Statement Records (${unresolvedTxns
        .map((t) => t.id)
        .join(', ')})`,
      status: 'UNRESOLVED',
      expectedServiceAmountMinor: null,
      expectedServiceAmount: null,
      actualTransactionAmountMinor: amtMinor,
      actualTransactionAmount: latestUnres.amount,
      mandateMaxAmountMinor: null,
      mandateMaxAmount: null,
      discrepancyAmountMinor: null,
      discrepancyAmount: null,
      discrepancyPercent: null,
      withinMandateLimit: null,
      latestTransactionId: latestUnres.id,
      mandateReference: null,
      serviceDocumentId: null,
      explanation: `${unresolvedTxns.length} transaction(s) (${unresolvedTxns
        .map((t) => `${t.id}: ${t.rawDescription}`)
        .join('; ')}) identify only a payment processor or generic rail marker without a verified merchant token.`,
      epistemicCaveat:
        'Strict Identity Guardrail: DebitLens never merges transactions sharing only a payment processor (e.g., Razorpay or BillDesk) into a recurring commitment without verified merchant evidence.',
      recommendedAction:
        'Inspect bank/UPI statement references or manually confirm the merchant identity in the Transactions Explorer if recognised.',
      evidenceRecordIds: unresolvedTxns.map((t) => t.id),
      evaluatedAt,
    });
  }

  return findings;
}

// ============================================================================
// 5. DEBITLENS EVIDENCE CASEBOOK & AUDIT TIMELINE (Section 9)
// Builds a chronological, dispute-ready evidence chain for any commitment.
// ============================================================================
export function buildCommitmentEvidenceCasebook(params: {
  commitment: CommitmentRecord;
  transactions: TransactionRecord[];
  mandate: MandateRecord | null;
  serviceTerms: ServiceTermsRecord | null;
  reconciliation: ReconciliationFindingRecord | null;
  alerts: DetectionAlertRecord[];
  session: CancellationSessionRecord | null;
  customEntries?: EvidenceCasebookEntry[];
  auditEvents?: AuditEventRecord[];
}): {
  commitmentId: string;
  entries: EvidenceCasebookEntry[];
  auditEvents: AuditEventRecord[];
} {
  const {
    commitment,
    transactions,
    mandate,
    serviceTerms,
    reconciliation,
    alerts,
    session,
    customEntries = [],
    auditEvents = [],
  } = params;

  const entries: EvidenceCasebookEntry[] = [];
  const cmtTxns = transactions
    .filter((t) => t.commitmentId === commitment.id)
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));

  // 1. Mandate record evidence (labelled IMPORTED_RECORD, never automatically CONFIRMED)
  if (mandate) {
    entries.push({
      id: `CB-MND-${mandate.id}`,
      commitmentId: commitment.id,
      timestamp: `${mandate.startDate}T09:00:00Z`,
      category: 'MANDATE_RECORD',
      title: `Payment Authorisation Record (${mandate.sourceType}): ${mandate.mandateReference}`,
      description: `${mandate.paymentRail.replace(/_/g, ' ')} mandate authorised up to ${formatMinorINR(
        mandate.maxAmountMinor
      )} (${mandate.frequency}) for ${mandate.merchantName}. Current mandate status: ${
        mandate.mandateStatus
      }.`,
      sourceReference: mandate.mandateReference,
      amountMinor: mandate.maxAmountMinor,
      verificationStatus: 'IMPORTED_RECORD',
      actor: mandate.sourceType === 'USER_IMPORTED' ? 'USER_MANDATE_IMPORT' : 'SEEDED_MANDATE_REGISTRY',
    });
  }

  // 2. Service Terms / Invoice evidence (USER_CONFIRMED if userVerified=true, otherwise INFERRED)
  if (serviceTerms) {
    const formattedPrice =
      serviceTerms.expectedAmountMinor !== null
        ? formatMinorINR(serviceTerms.expectedAmountMinor)
        : 'Price Unavailable';
    entries.push({
      id: `CB-DOC-${serviceTerms.id}`,
      commitmentId: commitment.id,
      timestamp: serviceTerms.createdAt,
      category: 'SERVICE_TERMS_DOCUMENT',
      title: `Documented Service Terms Attached: ${serviceTerms.serviceName}`,
      description: `Document ${serviceTerms.id} (${serviceTerms.documentSource}) specifies expected billing of ${formattedPrice} (${serviceTerms.billingFrequency}). Raw excerpt: "${serviceTerms.rawDocumentText.slice(
        0,
        140
      )}..."`,
      sourceReference: serviceTerms.id,
      amountMinor: serviceTerms.expectedAmountMinor,
      verificationStatus: serviceTerms.userVerified ? 'USER_CONFIRMED' : 'INFERRED',
      actor: serviceTerms.userVerified ? 'USER_VERIFIED_TERMS' : 'DOCUMENT_INTELLIGENCE_PARSER',
    });
  }

  // 3. Supporting transactions
  for (const txn of cmtTxns) {
    entries.push({
      id: `CB-TXN-${txn.id}`,
      commitmentId: commitment.id,
      timestamp: `${txn.transactionDate}T12:00:00Z`,
      category: 'TRANSACTION_EVIDENCE',
      title: `${txn.direction} ${formatMinorINR(toMinorUnits(txn.amount))} — ${txn.rawDescription}`,
      description: `Resolved to ${txn.merchantName || 'Unresolved'} via ${txn.matchingMethod} (${
        txn.confidenceScore
      }% confidence). Account: ${txn.accountAlias}. Rail: ${txn.paymentRail}.${
        txn.isPostCancellationDebit ? ' [FLAGGED: Occurred after recorded cancellation]' : ''
      }`,
      sourceReference: txn.id,
      amountMinor: toMinorUnits(txn.amount),
      verificationStatus: txn.resolutionStatus,
      actor: 'STATEMENT_IMPORT_ENGINE',
    });
  }

  // 4. Cancellation evidence
  if (session) {
    for (const ev of session.evidence) {
      entries.push({
        id: `CB-CANC-${ev.id}`,
        commitmentId: commitment.id,
        timestamp: ev.createdAt || `${ev.evidenceDate}T14:00:00Z`,
        category:
          ev.evidenceType === 'MANDATE_REVOCATION'
            ? 'MANDATE_REVOCATION_EVENT'
            : 'SERVICE_CANCELLATION_EVENT',
        title: `${ev.evidenceType.replace(/_/g, ' ')}: Ref ${ev.referenceNumber}`,
        description: ev.description,
        sourceReference: ev.referenceNumber,
        amountMinor: null,
        verificationStatus: (ev.verificationStatus as any) || 'EVIDENCE_ATTACHED',
        actor: 'USER_EVIDENCE_SUBMISSION',
      });
    }
  }

  // 5. Reconciliation finding (computed output -> SYSTEM_GENERATED)
  if (reconciliation) {
    entries.push({
      id: `CB-REC-${reconciliation.id}`,
      commitmentId: commitment.id,
      timestamp: reconciliation.evaluatedAt,
      category: 'RECONCILIATION_FINDING',
      title: `Three-Way Reconciliation Outcome: ${reconciliation.status.replace(/_/g, ' ')}`,
      description: `${reconciliation.explanation} | Caveat: ${reconciliation.epistemicCaveat}`,
      sourceReference: reconciliation.id,
      amountMinor: reconciliation.discrepancyAmountMinor ?? reconciliation.actualTransactionAmountMinor,
      verificationStatus: 'SYSTEM_GENERATED',
      actor: 'RECONCILIATION_ENGINE',
    });
  }

  // 6. Alerts (system-generated -> SYSTEM_GENERATED)
  for (const alert of alerts.filter((a) => a.commitmentId === commitment.id)) {
    entries.push({
      id: `CB-ALT-${alert.id}`,
      commitmentId: commitment.id,
      timestamp: `${alert.createdAt}T16:00:00Z`,
      category: 'POST_CANCELLATION_MONITORING',
      title: `Alert Raised [${alert.alertType}]: ${alert.title}`,
      description: `${alert.description} Evidence: ${alert.evidenceReference}`,
      sourceReference: alert.id,
      amountMinor: null,
      verificationStatus: 'SYSTEM_GENERATED',
      actor: 'TEMPORAL_ALERT_ENGINE',
    });
  }

  // 7. Custom user-attached casebook entries
  for (const custom of customEntries.filter((c) => c.commitmentId === commitment.id)) {
    entries.push(custom);
  }

  entries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const commitmentAudits = auditEvents
    .filter((a) => a.commitmentId === commitment.id)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return {
    commitmentId: commitment.id,
    entries,
    auditEvents: commitmentAudits,
  };
}

// ============================================================================
// 6. DATA COVERAGE & FINANCIAL VISIBILITY SUMMARY (Section 12)
// Explicitly shows what data sources have been imported and what blind spots
// remain so the system never overclaims completeness.
// ============================================================================
export function buildDataCoverageSummary(params: {
  transactions: TransactionRecord[];
  commitments: CommitmentRecord[];
  mandates: MandateRecord[];
  serviceTerms: ServiceTermsRecord[];
  notificationsCount: number;
}): DataCoverageSummary {
  const { transactions, commitments, mandates, serviceTerms, notificationsCount } = params;
  const accounts = Array.from(new Set(transactions.map((t) => t.accountAlias)));
  const rails = Array.from(new Set(transactions.map((t) => t.paymentRail)));

  const sortedDates = transactions
    .map((t) => t.transactionDate)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const earliestTransactionDate = sortedDates[0] || null;
  const latestTransactionDate = sortedDates[sortedDates.length - 1] || null;

  let commitmentsWithFullThreeWayCoverage = 0;
  let commitmentsMissingMandateRecord = 0;
  let commitmentsMissingServiceTerms = 0;

  for (const cmt of commitments) {
    const hasMandate = mandates.some(
      (m) => m.commitmentId === cmt.id || (cmt.mandateRef && m.mandateReference === cmt.mandateRef)
    );
    const hasTerms = serviceTerms.some((s) => s.commitmentId === cmt.id);
    if (!hasMandate) commitmentsMissingMandateRecord++;
    if (!hasTerms) commitmentsMissingServiceTerms++;
    if (hasMandate && hasTerms) commitmentsWithFullThreeWayCoverage++;
  }

  const blindSpots: string[] = [
    'DebitLens only analyses statement rows, mandate files, and service documents explicitly imported into the workspace; cash payments or unimported bank accounts are not visible.',
  ];
  if (commitmentsMissingMandateRecord > 0) {
    blindSpots.push(
      `${commitmentsMissingMandateRecord} commitment(s) have no matching mandate in the imported mandate registry (e.g. FitClub Card Standing Instruction). "No visible mandate" means not imported, not that no bank instruction exists.`
    );
  }
  if (commitmentsMissingServiceTerms > 0) {
    blindSpots.push(
      `${commitmentsMissingServiceTerms} commitment(s) lack an attached invoice or service terms document (e.g. ReadCloud Digital), so contracted plan price cannot be cross-checked until an invoice is provided.`
    );
  }

  return {
    importedTransactionCount: transactions.length,
    importedAccountAliases: accounts,
    importedPaymentRails: rails,
    earliestTransactionDate,
    latestTransactionDate,
    importedMandatesCount: mandates.length,
    importedServiceDocumentsCount: serviceTerms.length,
    importedNotificationsCount: notificationsCount,
    commitmentsWithFullThreeWayCoverage,
    commitmentsMissingMandateRecord,
    commitmentsMissingServiceTerms,
    blindSpots,
  };
}

// ============================================================================
// 7. FINANCIAL GUARDRAILS (Section 13)
// User-configurable thresholds & pre-debit warnings per commitment.
// ============================================================================
export function buildInitialSeedGuardrails(
  commitments: CommitmentRecord[]
): FinancialGuardrailConfig[] {
  return commitments.map((c) => ({
    commitmentId: c.id,
    maxExpectedAmountMinor: toMinorUnits(c.typicalAmount),
    alertOnAnyIncrease: true,
    preDebitReminderDays: 3,
    requireTwoLayerCancellationConfirmation: true,
    updatedAt: '2026-10-31T00:00:00Z',
  }));
}

// ============================================================================
// 8. INDEPENDENT TWO-LAYER CANCELLATION LIFECYCLE HELPERS (Section 10)
// Maps ServiceLifecycleStatus and MandateLifecycleStatus independently.
// ============================================================================
export function deriveIndependentLifecycleStatuses(
  session: CancellationSessionRecord,
  mandate: MandateRecord | null,
  overrideServiceStatus?: ServiceLifecycleStatus,
  overrideMandateStatus?: MandateLifecycleStatus
): {
  serviceLifecycleStatus: ServiceLifecycleStatus;
  mandateLifecycleStatus: MandateLifecycleStatus;
} {
  let serviceLifecycleStatus: ServiceLifecycleStatus = 'ACTIVE';
  if (overrideServiceStatus) {
    serviceLifecycleStatus = overrideServiceStatus;
  } else if (session.status === 'NEEDS_MERCHANT_RESPONSE') {
    serviceLifecycleStatus = 'MERCHANT_UNRESPONSIVE';
  } else if (session.serviceCancelledAt) {
    const hasServiceReceipt = session.evidence.some(
      (e) => e.evidenceType === 'SERVICE_CONFIRMATION'
    );
    serviceLifecycleStatus = hasServiceReceipt
      ? 'CANCELLATION_EVIDENCE_ATTACHED'
      : 'CANCELLATION_REPORTED_BY_USER';
  } else if (session.status === 'SERVICE_CANCELLATION_PENDING') {
    serviceLifecycleStatus = 'CANCELLATION_REQUESTED';
  }

  let mandateLifecycleStatus: MandateLifecycleStatus = 'ACTIVE';
  if (overrideMandateStatus) {
    mandateLifecycleStatus = overrideMandateStatus;
  } else if (!mandate) {
    mandateLifecycleStatus = 'MANDATE_NOT_VISIBLE_IN_IMPORTED_DATA';
  } else if (session.paymentAuthorisationRevokedAt || mandate.mandateStatus === 'REVOKED' || mandate.mandateStatus === 'REVOCATION_REPORTED') {
    const hasMandateReceipt = session.evidence.some(
      (e) => e.evidenceType === 'MANDATE_REVOCATION'
    );
    mandateLifecycleStatus = hasMandateReceipt
      ? 'REVOCATION_EVIDENCE_ATTACHED'
      : 'REVOCATION_REPORTED_BY_USER';
  } else if (mandate.mandateStatus === 'PAUSED') {
    mandateLifecycleStatus = 'PAUSED_REPORTED_BY_USER';
  }

  return { serviceLifecycleStatus, mandateLifecycleStatus };
}

// ============================================================================
// 9. CONTEXTUAL SARVAM BHASHA FINANCIAL ASSISTANT (Section 11)
// Grounded strictly in verified commitment, transaction, mandate, service terms,
// reconciliation finding, and cancellation records.
// Preserves merchant names, amounts, dates, mandate references, and transaction IDs.
// ============================================================================
export function buildGroundedContextualQuestionResponse(params: {
  commitment: CommitmentRecord;
  question: string;
  language: LanguageCode;
  transactions: TransactionRecord[];
  mandate: MandateRecord | null;
  serviceTerms: ServiceTermsRecord | null;
  reconciliation: ReconciliationFindingRecord | null;
  session: CancellationSessionRecord | null;
  sarvamStatus?: SarvamRuntimeStatus;
  sarvamMode?: 'LIVE_SARVAM_API' | 'CURATED_VERIFIED_FALLBACK';
  liveLocalizedAnswer?: string;
  fallbackReason?: string;
}): BhashaContextualQuestionResponse {
  const {
    commitment,
    question,
    language,
    transactions,
    mandate,
    serviceTerms,
    reconciliation,
    session,
    sarvamStatus = 'LOCAL_FALLBACK',
    sarvamMode = 'CURATED_VERIFIED_FALLBACK',
    liveLocalizedAnswer,
    fallbackReason,
  } = params;

  const langObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  const cmtTxns = transactions
    .filter((t) => t.commitmentId === commitment.id && t.direction === 'DEBIT')
    .sort((a, b) => Date.parse(a.transactionDate) - Date.parse(b.transactionDate));
  const latestTxn = cmtTxns[cmtTxns.length - 1];

  const actualFormatted = formatMinorINR(
    reconciliation?.actualTransactionAmountMinor ?? toMinorUnits(commitment.latestAmount)
  );
  const expectedFormatted =
    reconciliation?.expectedServiceAmountMinor != null
      ? formatMinorINR(reconciliation.expectedServiceAmountMinor)
      : formatMinorINR(toMinorUnits(commitment.typicalAmount));
  const mandateFormatted =
    reconciliation?.mandateMaxAmountMinor != null
      ? formatMinorINR(reconciliation.mandateMaxAmountMinor)
      : 'Not visible in imported records';
  const mandateRef = mandate?.mandateReference || commitment.mandateRef || 'No imported mandate ref';
  const docId = serviceTerms?.id || 'No attached invoice';
  const latestTxnId = latestTxn?.id || 'N/A';
  const latestDate = latestTxn?.transactionDate || commitment.lastPaymentDate || 'N/A';

  // Build deterministic, fact-grounded English answer addressing the user's question
  let englishAnswer = `Grounded Financial Summary for ${commitment.serviceName} (${commitment.merchantName}): `;

  if (reconciliation && reconciliation.status === 'AMOUNT_DISCREPANCY') {
    const diffFormatted = formatMinorINR(Math.abs(reconciliation.discrepancyAmountMinor || 0));
    englishAnswer += `Your latest statement debit ${latestTxnId} on ${latestDate} was ${actualFormatted}, whereas your documented service invoice (${docId}) states ${expectedFormatted} — an amount discrepancy of +${diffFormatted}. This debit succeeded automatically because your active ${commitment.paymentRail.replace(
      /_/g,
      ' '
    )} mandate (${mandateRef}) authorises collections up to a maximum limit of ${mandateFormatted}. DebitLens does not classify this as fraud; it may reflect a plan upgrade, promotional expiry, or rate revision. `;
  } else if (reconciliation && reconciliation.status === 'CONFLICTING_EVIDENCE') {
    const serviceCancelRef =
      session?.evidence.find((e) => e.evidenceType === 'SERVICE_CONFIRMATION')
        ?.referenceNumber || null;
    const mandateRevokeRef =
      session?.evidence.find((e) => e.evidenceType === 'MANDATE_REVOCATION')
        ?.referenceNumber || null;
    const refDetails = [
      ...(session?.serviceCancelledAt ? [`Service cancelled: ${session.serviceCancelledAt}`] : []),
      ...(serviceCancelRef ? [`Service Ref: ${serviceCancelRef}`] : []),
      ...(mandateRevokeRef ? [`Mandate Ref: ${mandateRevokeRef}`] : []),
    ].join(', ');
    englishAnswer += `Debit ${latestTxnId} of ${actualFormatted} occurred on ${latestDate}${
      refDetails ? ` after recorded cancellation/revocation details (${refDetails})` : ''
    }. DebitLens flags this as Conflicting Evidence for dispute review rather than declaring fraud. `;
  } else if (reconciliation && reconciliation.status === 'TRANSACTION_WITHOUT_VISIBLE_MANDATE') {
    englishAnswer += `Statement debit ${latestTxnId} of ${actualFormatted} on ${latestDate} matches documented service terms (${expectedFormatted}), but no matching mandate was found in the available imported records. `;
  } else {
    englishAnswer += `Latest debit ${latestTxnId} of ${actualFormatted} on ${latestDate} is aligned with documented service price (${expectedFormatted} in ${docId}) and active mandate ${mandateRef} (limit ${mandateFormatted}). `;
  }

  englishAnswer += `To stop future charges completely, you must complete both Layer A (cancel the service with ${commitment.merchantName}) and Layer B (revoke mandate ${mandateRef} in your ${commitment.paymentRail.replace(
    /_/g,
    ' '
  )} app/bank portal).`;

  // Curated fallback translations preserving exact identifiers & amounts
  const curatedTranslations: Partial<Record<LanguageCode, string>> = {
    'en-IN': englishAnswer,
    'hi-IN': `${commitment.serviceName} (${commitment.merchantName}) का प्रमाण-आधारित विवरण: आपका नवीनतम स्टेटमेंट डेबिट ${latestTxnId} (${latestDate}) ${actualFormatted} का था, जबकि आपके सेवा दस्तावेज़ (${docId}) में अपेक्षित मूल्य ${expectedFormatted} दर्ज है। यह भुगतान इसलिए पास हुआ क्योंकि आपके सक्रिय ${commitment.paymentRail.replace(
      /_/g,
      ' '
    )} मैंडेट (${mandateRef}) की अधिकतम सीमा ${mandateFormatted} है। भविष्य के ऑटो-डेबिट पूरी तरह रोकने के लिए Layer A (${commitment.merchantName} सेवा रद्दीकरण) और Layer B (${mandateRef} मैंडेट निरस्तीकरण) दोनों पूरे करें।`,
    'ta-IN': `${commitment.serviceName} (${commitment.merchantName}) ஆதார அடிப்படையிலான விளக்கம்: உங்கள் சமீபத்திய டெபிட் ${latestTxnId} (${latestDate}) ${actualFormatted} ஆகும், ஆனால் ஆவணப்படுத்தப்பட்ட சேவை கட்டணம் (${docId}) ${expectedFormatted} ஆகும். உங்கள் ${commitment.paymentRail.replace(
      /_/g,
      ' '
    )} ஆட்டோபே ஆணை (${mandateRef}) அதிகபட்ச வரம்பு ${mandateFormatted}க்குள் இருப்பதால் இந்த கட்டணம் அனுமதிக்கப்பட்டது. எதிர்கால கட்டணங்களை நிறுத்த Layer A மற்றும் Layer B இரண்டையும் முடிக்கவும்.`,
    'te-IN': `${commitment.serviceName} (${commitment.merchantName}) ఆధారిత వివరణ: మీ తాజా స్టేట్‌మెంట్ డెబిట్ ${latestTxnId} (${latestDate}) ${actualFormatted}, అయితే సేవా ఇన్‌వాయిస్ (${docId}) ప్రకారం ధర ${expectedFormatted}. మీ ${commitment.paymentRail.replace(
      /_/g,
      ' '
    )} మ్యాండేట్ (${mandateRef}) గరిష్ట పరిమితి ${mandateFormatted} లోపల ఉండటం వల్ల ఈ డెబిట్ అనుమతించబడింది. భవిష్యత్ చార్జీలను ఆపడానికి Layer A మరియు Layer B రెండింటినీ పూర్తి చేయండి.`,
    'kn-IN': `${commitment.serviceName} (${commitment.merchantName}) ದಾಖಲೆ ಆಧಾರಿತ ವಿವರಣೆ: ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಡೆಬಿಟ್ ${latestTxnId} (${latestDate}) ${actualFormatted} ಆಗಿದೆ, ಆದರೆ ಸೇವಾ ಇನ್‌ವాయిಸ್ (${docId}) ಪ್ರಕಾರ ಶುಲ್ಕ ${expectedFormatted} ಆಗಿದೆ. ನಿಮ್ಮ ${commitment.paymentRail.replace(
      /_/g,
      ' '
    )} ಮ್ಯಾಂಡೇಟ್ (${mandateRef}) ಗರಿಷ್ಠ ಮಿತಿ ${mandateFormatted} ಒಳಗೆ ಇರುವುದರಿಂದ ಈ ಕಡಿತ ಅನುಮತಿಸಲಾಗಿದೆ. ಮುಂದಿನ ಶುಲ್ಕ ನಿಲ್ಲಿಸಲು Layer A ಮತ್ತು Layer B ಎರಡನ್ನೂ ಪೂರ್ಣಗೊಳಿಸಿ.`,
    'bn-IN': `${commitment.serviceName} (${commitment.merchantName})-এর তথ্যভিত্তিক বিবরণ: আপনার সর্বশেষ ডেবিট ${latestTxnId} (${latestDate}) ছিল ${actualFormatted}, যেখানে নথিভুক্ত পরিষেবা মূল্য (${docId}) হলো ${expectedFormatted}। আপনার ${commitment.paymentRail.replace(
      /_/g,
      ' '
    )} ম্যান্ডেট (${mandateRef})-এর সর্বোচ্চ সীমা ${mandateFormatted} হওয়ায় এই লেনদেনটি অনুমোদিত হয়েছে। ভবিষ্যৎ চার্জ বন্ধ করতে Layer A এবং Layer B উভয়ই সম্পন্ন করুন।`,
    'mr-IN': `${commitment.serviceName} (${commitment.merchantName}) चा पुराव्यावर आधारित तपशील: तुमचा नवीनतम स्टेटमेंट डेबिट ${latestTxnId} (${latestDate}) ${actualFormatted} होता, तर तुमच्या सेवा बीजकात (${docId}) अपेक्षित शुल्क ${expectedFormatted} आहे. तुमचा ${commitment.paymentRail.replace(
      /_/g,
      ' '
    )} मँडेट (${mandateRef}) कमाल मर्यादा ${mandateFormatted} च्या आत असल्याने हे पेमेंट झाले. पुढील शुल्क थांबवण्यासाठी Layer A आणि Layer B दोन्ही पूर्ण करा.`,
  };

  const localizedAnswer =
    language === 'en-IN'
      ? englishAnswer
      : liveLocalizedAnswer || curatedTranslations[language] || englishAnswer;

  const groundedFactsUsed = [
    `Commitment ID: ${commitment.id} (${commitment.serviceName} by ${commitment.merchantName})`,
    `Latest Transaction: ${latestTxnId} on ${latestDate} for ${actualFormatted} (${
      latestTxn?.rawDescription || 'N/A'
    })`,
    `Documented Service Price: ${expectedFormatted} (Source: ${docId})`,
    `Payment Mandate Ceiling: ${mandateFormatted} (Ref: ${mandateRef})`,
    `Reconciliation Outcome: ${reconciliation?.status || 'MATCHED'}`,
  ];

  const evidenceRecordIds = Array.from(
    new Set([
      commitment.id,
      ...(latestTxn ? [latestTxn.id] : []),
      ...(mandate ? [mandate.id, mandate.mandateReference] : []),
      ...(serviceTerms ? [serviceTerms.id] : []),
      ...(reconciliation ? [reconciliation.id] : []),
    ])
  );

  return {
    commitmentId: commitment.id,
    question,
    language,
    languageName: `${langObj.name} (${langObj.nativeName})`,
    englishAnswer,
    localizedAnswer,
    groundedFactsUsed,
    evidenceRecordIds,
    sarvamMeta: {
      mode: sarvamMode,
      status: sarvamStatus,
      modelUsed:
        sarvamStatus === 'LIVE_SARVAM' || sarvamStatus === 'PARTIAL_SARVAM'
          ? 'Deterministic Grounded Engine + sarvam-translate:v1'
          : 'Curated Grounded Template',
      timestamp: new Date().toISOString(),
      fallbackReason,
    },
  };
}
