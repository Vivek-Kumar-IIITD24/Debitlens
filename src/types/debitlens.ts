export type LanguageCode =
  | 'en-IN'
  | 'hi-IN'
  | 'bn-IN'
  | 'ta-IN'
  | 'te-IN'
  | 'mr-IN'
  | 'gu-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'pa-IN'
  | 'or-IN'
  | 'ur-IN';

export interface SupportedLanguage {
  code: LanguageCode;
  name: string;
  nativeName: string;
  script: string;
  testedInDemo: boolean;
  supportedModels: ('sarvam-105b' | 'sarvam-translate:v1' | 'mayura:v1')[];
}

export type RelationshipConfidenceStatus =
  | 'CONFIRMED'
  | 'INFERRED'
  | 'USER_CONFIRMED'
  | 'IMPORTED_RECORD'
  | 'SYSTEM_GENERATED'
  | 'UNRESOLVED'
  | 'EVIDENCE_ATTACHED'
  | 'USER_REPORTED'
  | 'MERCHANT_CONFIRMED'
  | 'BANK_CONFIRMED'
  | 'UNKNOWN';

export type PaymentRailType =
  | 'UPI_AUTOPAY'
  | 'CARD_EMANDATE'
  | 'ENACH_NACH'
  | 'GOOGLE_PLAY'
  | 'APPLE_APP_STORE'
  | 'DIRECT_MERCHANT'
  | 'BANK_STANDING_INSTRUCTION'
  | 'UPI_ONE_TIME'
  | 'CARD_ONE_TIME'
  | 'UNKNOWN';

export type RecurrenceFrequency =
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY'
  | 'IRREGULAR'
  | 'RESUMED'
  | 'TRIAL_CONVERTED'
  | 'ONE_TIME'
  | 'UNKNOWN';

export type CommitmentCategory =
  | 'OTT_STREAMING'
  | 'MUSIC_AUDIO'
  | 'CLOUD_PRODUCTIVITY'
  | 'FITNESS_WELLNESS'
  | 'UTILITY_ESSENTIAL'
  | 'INSURANCE_POLICY'
  | 'LOAN_EMI'
  | 'EDTECH_AI'
  | 'CREATIVE_SAA_S'
  | 'UNIDENTIFIED';

export type CancellationWorkflowState =
  | 'NOT_STARTED'
  | 'SERVICE_CANCELLATION_PENDING'
  | 'SERVICE_CANCELLED_PAYMENT_PENDING'
  | 'PAYMENT_AUTHORITY_REVOKED_SERVICE_PENDING'
  | 'BOTH_USER_CONFIRMED'
  | 'NEEDS_MERCHANT_RESPONSE'
  | 'NEEDS_BANK_SUPPORT'
  | 'NEEDS_REVIEW';

// Section 10.1: Two independent lifecycle states
export type ServiceLifecycleStatus =
  | 'UNKNOWN'
  | 'ACTIVE'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLATION_REPORTED_BY_USER'
  | 'CANCELLATION_EVIDENCE_ATTACHED'
  | 'CANCELLED'
  | 'CANCELLATION_REJECTED'
  | 'CANCELLATION_DISPUTED'
  | 'MERCHANT_UNRESPONSIVE'
  | 'EXPIRED';

export type MandateLifecycleStatus =
  | 'UNKNOWN'
  | 'ACTIVE'
  | 'PAUSED'
  | 'PAUSED_REPORTED_BY_USER'
  | 'REVOCATION_REQUESTED'
  | 'REVOCATION_REPORTED_BY_USER'
  | 'REVOCATION_EVIDENCE_ATTACHED'
  | 'REVOKED'
  | 'REVOCATION_FAILED'
  | 'MANDATE_NOT_VISIBLE_IN_IMPORTED_DATA'
  | 'EXPIRED';

// Section 5.7: Truthful Neo4j execution modes
export type GraphExecutionMode =
  | 'LIVE_NEO4J'
  | 'LOCAL_PREVIEW'
  | 'NOT_CONFIGURED'
  | 'CONNECTION_FAILED'
  | 'EMPTY_LIVE_RESULT'
  | 'QUERY_FAILED';

export type SarvamRuntimeStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_NOT_TESTED'
  | 'LIVE_SUCCESS'
  | 'LIVE_SARVAM'
  | 'PARTIAL_SARVAM'
  | 'REQUEST_FAILED'
  | 'RATE_LIMITED'
  | 'LOCAL_FALLBACK';

// Section 7.3: Three-way reconciliation outcomes
export type ReconciliationOutcomeStatus =
  | 'MATCHED'
  | 'AMOUNT_DISCREPANCY'
  | 'FREQUENCY_DISCREPANCY'
  | 'TRANSACTION_WITHOUT_VISIBLE_MANDATE'
  | 'MANDATE_WITHOUT_RECENT_TRANSACTION'
  | 'SERVICE_TERMS_UNAVAILABLE'
  | 'POSSIBLE_DUPLICATE'
  | 'CONFLICTING_EVIDENCE'
  | 'UNRESOLVED';

export interface TransactionRecord {
  id: string;
  transactionId: string;
  transactionDate: string;
  rawDescription: string;
  normalisedDescription: string;
  amount: number;
  amountMinor?: number;
  currency: string;
  direction: 'DEBIT' | 'CREDIT';
  paymentRail: PaymentRailType;
  accountAlias: string;
  accountId?: string;
  // Separate explicit identity fields (Section 5.1)
  merchantIdentity: {
    merchantId: string | null;
    canonicalName: string | null;
    serviceName: string | null;
  };
  processorIdentity: {
    processorId: string | null;
    processorName: string | null;
  };
  paymentMechanism: PaymentRailType;
  // Backwards-compatible flat properties
  merchantId: string | null;
  merchantName: string | null;
  serviceName: string | null;
  processorId: string | null;
  processorName: string | null;
  resolutionStatus: RelationshipConfidenceStatus;
  matchingMethod:
    | 'EXACT_CANONICAL_MATCH'
    | 'EXACT_ALIAS_MATCH'
    | 'NORMALISED_DESCRIPTOR_MATCH'
    | 'PROCESSOR_PLUS_MERCHANT_MATCH'
    | 'SPECIFIC_PROCESSOR_MATCH'
    | 'GENERIC_MECHANISM_ONLY'
    | 'PARTIAL_MERCHANT_MATCH'
    | 'USER_CONFIRMED_MATCH'
    | 'PROCESSOR_ONLY_UNRESOLVED'
    | 'UNIDENTIFIED';
  confidenceScore: number;
  resolutionExplanation: string;
  sourceType: 'CSV_STATEMENT' | 'NOTIFICATION_JSON' | 'DEMO_SEED';
  importBatchId: string;
  externalReference: string;
  commitmentId: string | null;
  isPostCancellationDebit?: boolean;
  isHabitualNonCommitment?: boolean;
  isPaymentProcessorIsolated?: boolean;
}

export interface MerchantRecord {
  id: string;
  canonicalName: string;
  serviceName: string;
  category: CommitmentCategory;
  website: string | null;
  officialCancellationUrl: string | null;
  isDemoSyntheticService: boolean;
  description: string;
  isFinancialObligation: boolean;
  aliases: {
    alias: string;
    normalisedAlias: string;
    matchingRule: string;
    confidenceWeight: number;
    processorId?: string;
  }[];
}

export interface PaymentProcessorRecord {
  id: string;
  processorName: string;
  recognisedPrefixes: string[];
  description: string;
  website: string;
}

export interface ConfidenceScoreBreakdown {
  intervalConsistencyPoints: number; // max 30
  merchantIdentityPoints: number; // max 25
  occurrenceCountPoints: number; // max 20
  amountConsistencyPoints: number; // max 15
  mandateOrNotificationPoints: number; // max 10
  totalScore: number; // max 100
  label: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
}

// Section 3: RecurringCandidate vs FinancialCommitment
export interface CommitmentRecord {
  id: string;
  commitmentId?: string;
  userId?: string;
  merchantId: string;
  serviceId?: string;
  merchantName: string;
  serviceName: string;
  displayName?: string;
  commitmentType?: 'SUBSCRIPTION' | 'UTILITY_BILL' | 'INSURANCE_PREMIUM' | 'LOAN_EMI' | 'MEMBERSHIP' | 'RECURRING_SERVICE';
  entityClass?: 'RECURRING_CANDIDATE' | 'FINANCIAL_COMMITMENT';
  verificationStatus?: 'PENDING_REVIEW' | 'CONFIRMED' | 'USER_CONFIRMED' | 'REJECTED';
  category: CommitmentCategory;
  isFinancialObligation: boolean;
  obligationWarning?: string;
  paymentRail: PaymentRailType;
  mandateRef: string | null;
  processorName: string | null;
  recurrenceType: RecurrenceFrequency;
  expectedFrequency?: RecurrenceFrequency;
  observedFrequency?: RecurrenceFrequency;
  recurrenceIntervalDays: number | null;
  typicalAmount: number;
  expectedAmountMinor?: number;
  latestAmount: number;
  latestAmountMinor?: number;
  previousAmount: number | null;
  currency: string;
  annualisedAmount: number;
  monthlyEquivalent: number;
  totalHistoricalSpend: number;
  firstObservedDate?: string;
  nextExpectedDate: string | null;
  lastPaymentDate: string;
  status: 'ACTIVE' | 'RESUMED_REVIEW' | 'CANCELLED_USER_CONFIRMED' | 'POST_CANCEL_ALERT' | 'NEEDS_REVIEW' | 'REJECTED_CANDIDATE';
  relationshipStatus: RelationshipConfidenceStatus;
  confidenceScore: number;
  identityConfidence?: number;
  recurrenceConfidence?: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceBreakdown: ConfidenceScoreBreakdown;
  reconciliationStatus?: ReconciliationOutcomeStatus;
  detectionExplanation: string;
  supportingTransactionIds: string[];
  connectedDescriptors: string[];
  evidenceReferences?: string[];
  priceChangeDetected: boolean;
  priceChangeAmount: number | null;
  priceChangePercent: number | null;
  annualPriceIncreaseImpact: number | null;
  trialConverted: boolean;
  trialNotificationId: string | null;
  resumedAfterGap: boolean;
  missedCyclesCount: number;
  variableAmount: boolean;
  lastUsedDate: string | null;
  daysSinceLastUsed: number | null;
  usageStatus: 'ACTIVE_USE' | 'POTENTIALLY_UNUSED' | 'UNKNOWN';
  cancellationSessionId: string;
  cancellationState: CancellationWorkflowState;
  serviceLifecycleStatus?: ServiceLifecycleStatus;
  mandateLifecycleStatus?: MandateLifecycleStatus;
  createdAt?: string;
  updatedAt?: string;
}

export type AlertType =
  | 'PRICE_INCREASE'
  | 'UPCOMING_RENEWAL'
  | 'ANNUAL_RENEWAL'
  | 'TRIAL_CONVERSION'
  | 'RESUMED_PAYMENT'
  | 'POTENTIALLY_UNUSED'
  | 'UNIDENTIFIED_MERCHANT'
  | 'POST_CANCELLATION_DEBIT'
  | 'AMOUNT_DISCREPANCY'
  | 'POSSIBLE_DUPLICATE'
  | 'MISSING_MANDATE'
  | 'MISSING_SERVICE_TERMS';

export interface DetectionAlertRecord {
  id: string;
  commitmentId: string | null;
  transactionId?: string | null;
  alertType: AlertType;
  alertCategory?: 'ACTION_REQUIRED' | 'REVIEW_REQUIRED' | 'INFORMATION';
  title: string;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  detectedValue: string;
  previousValue: string | null;
  percentageChange: number | null;
  annualImpact: number | null;
  evidenceReference: string;
  suggestedAction: string;
  createdAt: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
}

// Section 7 & 8: Mandates, Service Terms / Documents, Reconciliation, Evidence Casebook
export interface MandateRecord {
  id: string;
  mandateReference: string;
  commitmentId: string | null;
  merchantId: string | null;
  merchantName: string;
  paymentRail: PaymentRailType | 'UNKNOWN';
  maxAmountMinor: number | null;
  maxAmount: number | null;
  currency: string;
  frequency: RecurrenceFrequency | 'UNKNOWN';
  startDate: string | null;
  endDate: string | null;
  mandateStatus:
    | 'ACTIVE'
    | 'PAUSED'
    | 'REVOCATION_REPORTED'
    | 'REVOKED'
    | 'EXPIRED'
    | 'UNKNOWN'
    | 'PENDING_VERIFICATION';
  sourceType: 'DEMO_SEED' | 'USER_IMPORTED';
  updatedAt: string;
  isIncomplete?: boolean;
  missingFields?: string[];
}

export interface ServiceTermsRecord {
  id: string;
  commitmentId: string;
  merchantName: string;
  serviceName: string;
  expectedAmountMinor: number | null;
  expectedAmount: number | null;
  currency: string;
  billingFrequency: RecurrenceFrequency;
  trialEndDate: string | null;
  renewalDate: string | null;
  cancellationNoticeDays: number | null;
  documentSource: 'PASTED_INVOICE_TEXT' | 'STRUCTURED_JSON' | 'MANUAL_ENTRY';
  rawDocumentText: string;
  extractionConfidence: number;
  extractedFields: {
    fieldName: string;
    extractedValue: string;
    confidence: number;
    sourceSnippet: string;
    userVerified: boolean;
  }[];
  userVerified: boolean;
  createdAt: string;
}

export interface ReconciliationFindingRecord {
  id: string;
  commitmentId: string;
  merchantName: string;
  serviceName: string;
  status: ReconciliationOutcomeStatus;
  expectedServiceAmountMinor: number | null;
  expectedServiceAmount: number | null;
  actualTransactionAmountMinor: number;
  actualTransactionAmount: number;
  mandateMaxAmountMinor: number | null;
  mandateMaxAmount: number | null;
  discrepancyAmountMinor: number | null;
  discrepancyAmount: number | null;
  discrepancyPercent: number | null;
  withinMandateLimit: boolean | null;
  latestTransactionId: string | null;
  mandateReference: string | null;
  serviceDocumentId: string | null;
  explanation: string;
  epistemicCaveat: string;
  evidenceRecordIds: string[];
  evaluatedAt: string;
  recommendedAction?: string;
  discrepancyDetails?: {
    missingMandateFields?: string[];
    missingTermsFields?: string[];
    discrepancyReason?: string;
    [key: string]: any;
  };
}

export type EvidenceCategoryType =
  | 'MANDATE_RECORD'
  | 'SERVICE_TERMS_DOCUMENT'
  | 'TRANSACTION_EVIDENCE'
  | 'SERVICE_CANCELLATION_EVENT'
  | 'MANDATE_REVOCATION_EVENT'
  | 'RECONCILIATION_FINDING'
  | 'POST_CANCELLATION_MONITORING'
  | 'USER_CUSTOM_EVIDENCE';

export interface EvidenceCasebookEntry {
  id: string;
  commitmentId: string;
  timestamp: string;
  category: EvidenceCategoryType;
  title: string;
  description: string;
  sourceReference: string;
  amountMinor: number | null;
  verificationStatus: RelationshipConfidenceStatus;
  actor: string;
}

export interface AuditEventRecord {
  id: string;
  commitmentId: string | null;
  timestamp: string;
  eventType?: AuditEventRecord['actionType'];
  actionType?:
    | 'IMPORT'
    | 'MERCHANT_CORRECTION'
    | 'IDENTITY_MATCH_CONFIRMED'
    | 'CANDIDATE_CONFIRMED'
    | 'CANDIDATE_REJECTED'
    | 'COMMITMENT_CONFIRMATION'
    | 'COMMITMENT_REJECTION'
    | 'SERVICE_TERM_ENTRY'
    | 'SERVICE_TERMS_ATTACHED'
    | 'MANDATE_IMPORT'
    | 'MANDATE_IMPORTED'
    | 'RECONCILIATION_RUN'
    | 'RECONCILIATION_EVALUATED'
    | 'CANCELLATION_ACTION'
    | 'SERVICE_STATUS_UPDATED'
    | 'MANDATE_STATUS_UPDATED'
    | 'EVIDENCE_ATTACHED'
    | 'POST_CANCELLATION_FINDING'
    | 'POST_CANCELLATION_DEBIT_DETECTED'
    | 'GUARDRAIL_UPDATE'
    | 'GUARDRAIL_UPDATED'
    | 'JUDGE_DEMO_SCENARIO_TRIGGERED';
  actor: string;
  summary: string;
  previousState?: string | null;
  newState?: string | null;
  evidenceReference?: string;
  evidenceReferences?: string[];
  createdAt?: string;
}

export interface DataCoverageSummary {
  importedTransactionCount: number;
  importedAccountAliases: string[];
  importedPaymentRails: PaymentRailType[];
  earliestTransactionDate: string | null;
  latestTransactionDate: string | null;
  importedMandatesCount: number;
  importedServiceDocumentsCount: number;
  importedNotificationsCount: number;
  commitmentsWithFullThreeWayCoverage: number;
  commitmentsMissingMandateRecord: number;
  commitmentsMissingServiceTerms: number;
  blindSpots: string[];
}

export interface FinancialGuardrailConfig {
  commitmentId: string;
  maxExpectedAmountMinor: number;
  alertOnAnyIncrease: boolean;
  preDebitReminderDays: number;
  requireTwoLayerCancellationConfirmation: boolean;
  updatedAt: string;
}

export interface CancellationPlaybookStep {
  id: string;
  layer: 'LAYER_A_SERVICE' | 'LAYER_B_MANDATE';
  stepNumber: number;
  title: string;
  instruction: string;
  officialUrl?: string;
  isDemoSyntheticRoute?: boolean;
  completed: boolean;
  completedAt: string | null;
}

export interface CancellationEvidenceRecord {
  id: string;
  cancellationSessionId?: string;
  evidenceType: 'SERVICE_CONFIRMATION' | 'MANDATE_REVOCATION' | 'SUPPORT_TICKET' | 'MERCHANT_UNRESPONSIVE';
  description: string;
  referenceNumber: string;
  evidenceDate: string;
  verificationStatus?: 'USER_REPORTED' | 'EVIDENCE_ATTACHED';
  createdAt: string;
}

export interface CancellationPlaybookRecord {
  id: string;
  commitmentId: string;
  merchantName: string;
  serviceName: string;
  paymentRail: PaymentRailType;
  isFinancialObligation: boolean;
  isDemoSyntheticService: boolean;
  contractualWarning: string | null;
  serviceCancellationSummary: string;
  mandateRevocationSummary: string;
  officialServiceUrl: string | null;
  officialRailSupportUrl: string;
  lastVerifiedDate: string;
  escalationGuidance: string[];
  evidenceToRetain: string[];
  steps: CancellationPlaybookStep[];
}

export interface CancellationSessionRecord {
  id: string;
  commitmentId: string;
  merchantName: string;
  serviceName: string;
  paymentRail: PaymentRailType;
  status: CancellationWorkflowState;
  serviceLifecycleStatus?: ServiceLifecycleStatus;
  mandateLifecycleStatus?: MandateLifecycleStatus;
  initiatedAt: string | null;
  serviceCancelledAt: string | null;
  paymentAuthorisationRevokedAt: string | null;
  lastReviewedAt: string;
  steps: CancellationPlaybookStep[];
  evidence: CancellationEvidenceRecord[];
  postCancellationTransactionIds: string[];
  monitoringStatus?: 'MONITORING_ACTIVE' | 'POST_CANCELLATION_DEBIT_DETECTED' | 'NO_SUBSEQUENT_DEBIT_IN_IMPORTED_RECORDS';
  monitoringSummary?: string;
}

// ============================================================================
// NEO4J COMMITMENT GRAPH TYPES
// ============================================================================
export type GraphNodeLabel =
  | 'User'
  | 'Account'
  | 'ImportBatch'
  | 'Transaction'
  | 'Descriptor'
  | 'Merchant'
  | 'PaymentProcessor'
  | 'Service'
  | 'Commitment'
  | 'FinancialCommitment'
  | 'RecurringCandidate'
  | 'Mandate'
  | 'PaymentRail'
  | 'NotificationEvent'
  | 'Document'
  | 'Evidence'
  | 'ReconciliationFinding'
  | 'CancellationPlaybook'
  | 'CancellationSession'
  | 'CancellationStep'
  | 'CancellationEvidence'
  | 'DetectionAlert';

export type GraphRelationshipType =
  | 'USER_OWNS_ACCOUNT'
  | 'ACCOUNT_HAS_TRANSACTION'
  | 'IMPORT_BATCH_CONTAINS_TRANSACTION'
  | 'TRANSACTION_HAS_DESCRIPTOR'
  | 'DESCRIPTOR_RESOLVES_TO_MERCHANT'
  | 'TRANSACTION_PROCESSED_BY'
  | 'MERCHANT_OFFERS_SERVICE'
  | 'TRANSACTION_SUPPORTS_COMMITMENT'
  | 'COMMITMENT_FOR_SERVICE'
  | 'COMMITMENT_AUTHORISED_BY'
  | 'MANDATE_USES_RAIL'
  | 'SERVICE_HAS_CANCELLATION_PLAYBOOK'
  | 'COMMITMENT_HAS_EVIDENCE'
  | 'COMMITMENT_HAS_RECONCILIATION'
  | 'DOCUMENT_DESCRIBES_COMMITMENT'
  | 'COMMITMENT_HAS_ALERT'
  | 'ALERT_SUPPORTED_BY'
  | 'COMMITMENT_HAS_CANCELLATION_SESSION'
  | 'SESSION_HAS_STEP'
  | 'SESSION_HAS_EVIDENCE'
  | 'NOTIFICATION_SUPPORTS_COMMITMENT';

export interface GraphNodeData {
  id: string;
  label: GraphNodeLabel;
  title: string;
  subtitle: string;
  status: RelationshipConfidenceStatus;
  confidence?: number;
  isCoreCommitmentPath?: boolean;
  properties: Record<string, string | number | boolean | null>;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  type: GraphRelationshipType;
  status: RelationshipConfidenceStatus;
  confidence: number;
  matchingMethod: string;
  evidenceType: string;
  sourceReference: string;
  createdAt: string;
  evidenceSummary: string;
  isCoreCommitmentPath?: boolean;
}

export interface CommitmentGraphResponse {
  focusCommitmentId: string | null;
  executionMode: GraphExecutionMode;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  pathExplanation: {
    whichRelationshipsConnected: string[];
    whyDescriptorsMerged: string;
    uncertainRelationships: string[];
    howGraphIdentifiedCommitment: string;
    supportingTransactionRecords: {
      id: string;
      date: string;
      rawDescriptor: string;
      amount: number;
      accountAlias: string;
    }[];
  };
  executedCypherQueries: {
    id: string;
    name: string;
    operationCode: string;
    description: string;
    cypher: string;
    parameters: Record<string, unknown>;
    executionMode: GraphExecutionMode;
    rowCount: number;
    sampleResults: Record<string, unknown>[];
    error?: string;
    errorMessage?: string;
  }[];
}

// ============================================================================
// SARVAM AI ("DEBITLENS BHASHA") TYPES
// ============================================================================
export interface RedactedPrivacyPayload {
  rawDescriptor: string;
  merchant: string | null;
  merchantVerified: boolean;
  processor: string | null;
  service: string | null;
  amount: number;
  currency: string;
  frequency: string;
  confidence: number;
  evidenceSummary: string[];
  resolutionStatus: RelationshipConfidenceStatus;
  paymentRail: string;
  maskedFields: string[];
}

export interface BhashaMerchantExplanationResponse {
  transactionId: string;
  rawDescriptor: string;
  resolvedMerchant: string | null;
  paymentProcessor: string | null;
  actualService: string | null;
  resolutionStatus: RelationshipConfidenceStatus;
  confidenceScore: number;
  language: LanguageCode;
  languageName: string;
  englishSource: {
    whyConfusing: string;
    whatIsIdentified: string;
    whatRemainsUncertain: string;
    recommendedAction: string;
    fullSummary: string;
  };
  localizedExplanation: {
    whyConfusing: string;
    whatIsIdentified: string;
    whatRemainsUncertain: string;
    recommendedAction: string;
    fullSummary: string;
  };
  privacyAudit: RedactedPrivacyPayload;
  fieldStatuses?: Record<string, 'LIVE_SARVAM' | 'LOCAL_FALLBACK' | SarvamRuntimeStatus>;
  sarvamMeta: {
    mode: 'LIVE_SARVAM' | 'PARTIAL_SARVAM' | 'LOCAL_FALLBACK' | 'LIVE_SARVAM_API' | 'PARTIAL_SARVAM_API' | 'CURATED_VERIFIED_FALLBACK';
    status: SarvamRuntimeStatus;
    chatModel: string;
    translationModel: string;
    endpointCalled: string;
    timestamp: string;
    fallbackReason?: string;
    fieldStatuses?: Record<string, SarvamRuntimeStatus>;
  };
}

export interface BhashaCancellationExplanationResponse {
  commitmentId: string;
  merchantName: string;
  serviceName: string;
  paymentRail: PaymentRailType;
  language: LanguageCode;
  languageName: string;
  isFinancialObligation: boolean;
  englishPlaybook: {
    contractualWarning: string | null;
    layerATitle: string;
    layerADescription: string;
    layerASteps: { stepNumber: number; title: string; instruction: string; officialUrl?: string }[];
    layerBTitle: string;
    layerBDescription: string;
    layerBSteps: { stepNumber: number; title: string; instruction: string; officialUrl?: string }[];
    safetyAndEscalationNotes: string[];
    confirmationExplanation: string;
    statusMessage: string;
  };
  localizedPlaybook: {
    contractualWarning: string | null;
    layerATitle: string;
    layerADescription: string;
    layerASteps: { stepNumber: number; title: string; instruction: string; officialUrl?: string }[];
    layerBTitle: string;
    layerBDescription: string;
    layerBSteps: { stepNumber: number; title: string; instruction: string; officialUrl?: string }[];
    safetyAndEscalationNotes: string[];
    confirmationExplanation: string;
    statusMessage: string;
  };
  preservedInvariants: {
    actionOrderPreserved: boolean;
    officialUrlsIntact: boolean;
    layerDistinctionMaintained: boolean;
    safetyWarningsPreserved: boolean;
    allStepsTranslated: boolean;
  };
  fieldStatuses?: Record<string, 'LIVE_SARVAM' | 'LOCAL_FALLBACK' | SarvamRuntimeStatus>;
  sarvamMeta: {
    mode: 'LIVE_SARVAM' | 'PARTIAL_SARVAM' | 'LOCAL_FALLBACK' | 'LIVE_SARVAM_API' | 'PARTIAL_SARVAM_API' | 'CURATED_VERIFIED_FALLBACK';
    status: SarvamRuntimeStatus;
    modelUsed: string;
    endpointCalled: string;
    timestamp: string;
    fallbackReason?: string;
    fieldStatuses?: Record<string, SarvamRuntimeStatus>;
  };
}

export interface BhashaAlertExplanationResponse {
  alertId: string;
  alertType: AlertType;
  language: LanguageCode;
  languageName: string;
  englishTitle: string;
  englishExplanation: string;
  englishAction: string;
  localizedTitle: string;
  localizedExplanation: string;
  localizedAction: string;
  sarvamMeta: {
    mode: 'LIVE_SARVAM' | 'PARTIAL_SARVAM' | 'LOCAL_FALLBACK' | 'LIVE_SARVAM_API' | 'PARTIAL_SARVAM_API' | 'CURATED_VERIFIED_FALLBACK';
    status: SarvamRuntimeStatus;
    modelUsed: string;
    timestamp: string;
    fallbackReason?: string;
    fieldStatuses?: Record<string, SarvamRuntimeStatus>;
  };
}

export interface BhashaContextualQuestionResponse {
  commitmentId: string;
  question: string;
  language: LanguageCode;
  languageName: string;
  englishAnswer: string;
  localizedAnswer: string;
  groundedFactsUsed: string[];
  evidenceRecordIds: string[];
  sarvamMeta: {
    mode: 'LIVE_SARVAM' | 'PARTIAL_SARVAM' | 'LOCAL_FALLBACK' | 'LIVE_SARVAM_API' | 'PARTIAL_SARVAM_API' | 'CURATED_VERIFIED_FALLBACK';
    status: SarvamRuntimeStatus;
    modelUsed: string;
    timestamp: string;
    fallbackReason?: string;
  };
}

export interface IntegrationStatusResponse {
  neo4j: {
    configured: boolean;
    connected: boolean;
    mode: GraphExecutionMode;
    lastSuccessfulCheck: string | null;
    uriMasked: string | null;
    database: string;
    driverStatus: GraphExecutionMode;
    message: string;
    nodeCount: number;
    relationshipCount: number;
    constraintsVerified: boolean;
    constraintCount?: number;
  };
  sarvam: {
    configured: boolean;
    lastSuccessfulRequest: string | null;
    lastRequestStatus: SarvamRuntimeStatus;
    lastError: string | null;
    baseUrl: string;
    chatModel: string;
    translationModel: string;
    defaultLanguage: LanguageCode;
    status: SarvamRuntimeStatus;
    message: string;
  };
}

// ============================================================================
// PART 4: UNRECOGNIZED DEBIT INVESTIGATION TYPES
// ============================================================================
export interface MerchantCandidate {
  candidateMerchantId: string;
  candidateMerchantName: string;
  candidateServiceName: string;
  candidateType:
    | 'EXACT_ALIAS'
    | 'NORMALISED_ALIAS'
    | 'PREVIOUS_OVERRIDE'
    | 'RELATED_HISTORY'
    | 'CATALOGUE_MATCH'
    | 'PROCESSOR_RELATIONSHIP'
    | 'GRAPH_RELATIONSHIP';
  matchReason: string;
  evidenceSource: string;
  confidenceScore: number;
  confidenceExplanation: string;
  merchantId?: string;
  merchantName?: string;
  serviceName?: string;
  category?: string;
  website?: string;
  isProcessorOnly?: boolean;
}

export type UnrecognizedDebitCaseStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'NEEDS_USER_INPUT'
  | 'IDENTIFIED'
  | 'UNRESOLVED'
  | 'CLOSED';

export interface UnrecognizedDebitCase {
  id: string;
  transactionId: string;
  originalDescriptor: string;
  amount: number;
  amountMinor: number;
  transactionDate: string;
  currency: string;
  paymentRail: PaymentRailType;
  accountAlias: string;
  externalReference?: string | null;
  possibleProcessor: string | null;
  currentAssessment: {
    merchantIdentity: string | null;
    serviceName: string | null;
    resolutionStatus: RelationshipConfidenceStatus;
    matchingMethod: string;
    explanation: string;
  };
  candidateMerchants: MerchantCandidate[];
  status: UnrecognizedDebitCaseStatus;
  userAssessment: 'UNRECOGNIZED' | 'RECOGNIZED' | 'NEEDS_MORE_INFO' | 'UNDER_INVESTIGATION' | null;
  userNotes: string;
  notes?: string;
  actionsTaken?: any[];
  evidenceIds: string[];
  recommendedNextAction: string;
  createdAt: string;
  updatedAt: string;
  resolutionSource: 'USER_CONFIRMED' | 'REJECTED_ALL' | 'KEPT_UNRESOLVED' | 'SYSTEM_DEFAULT' | null;
  resolvedMerchantId: string | null;
}

// ============================================================================
// PART 5: REVIEW & RESOLVE QUEUE TYPES
// ============================================================================
export type ReviewQueuePriority =
  | 'P0'
  | 'P1'
  | 'P2'
  | 'P3'
  | 'HIGH_ATTENTION'
  | 'REVIEW_REQUIRED'
  | 'UPCOMING'
  | 'INFORMATIONAL';

export type ReviewQueueStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'WAITING_FOR_USER'
  | 'RESOLVED'
  | 'DISMISSED';

export type ReviewQueueCategory =
  | 'POST_CANCEL_DEBIT'
  | 'PRICE_DISCREPANCY'
  | 'FREQUENCY_DISCREPANCY'
  | 'CONFLICTING_EVIDENCE'
  | 'SERVICE_TERMS_MISSING'
  | 'MANDATE_EXPIRY_RISK'
  | 'DORMANT_MANDATE'
  | 'UNRESOLVED_DEBIT'
  | 'TRIAL_CONVERSION'
  | 'UPCOMING_RENEWAL'
  | 'POSSIBLE_DUPLICATE'
  | 'MATCHED_RECONCILIATION';

export interface ReviewQueueItem {
  id: string;
  dedupKey: string;
  title: string;
  priority: ReviewQueuePriority;
  status: ReviewQueueStatus;
  category: ReviewQueueCategory;
  commitmentId: string | null;
  transactionId: string | null;
  mandateReference: string | null;
  serviceName: string;
  merchantName: string;
  amount: number | null;
  amountMinor: number | null;
  eventDate: string;
  whyItAppeared: string;
  supportingEvidenceCount: number;
  recommendedAction: string;
  actionType:
    | 'INVESTIGATE_DEBIT'
    | 'REVIEW_DISCREPANCY'
    | 'ADD_SERVICE_TERMS'
    | 'VERIFY_MANDATE'
    | 'OPEN_CANCELLATION'
    | 'VIEW_PASSPORT'
    | 'INSPECT_EVIDENCE';
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PART 6: COMMITMENT PASSPORT TYPES
// ============================================================================
export interface CommitmentPassport {
  commitmentId: string;
  generatedAt: string;
  sectionA_Identity: {
    serviceName: string;
    merchantName: string;
    merchantId?: string;
    legalEntityName?: string;
    category?: string;
    supportContact?: string | null;
    grievanceOfficer?: string | null;
    website?: string | null;
    confidenceScore: number;
    confidenceLabel: string;
    connectedDescriptors: string[];
    processorName: string | null;
    accountAlias?: string;
    provenance?: RelationshipConfidenceStatus | string;
    confirmedAt?: string | null;
  };
  sectionB_Mandate: {
    mandatePresent: boolean;
    rail?: string;
    mandateReference?: string | null;
    maxAmount?: number | null;
    mandateStatus?: string;
    frequency?: string;
    startDate?: string | null;
    endDate?: string | null;
  };
  sectionC_Terms: {
    termsPresent: boolean;
    serviceName?: string;
    expectedAmount?: number | null;
    billingFrequency?: string;
    renewalDate?: string | null;
    userVerified?: boolean;
    sourceDocument?: string | null;
  };
  sectionD_History: {
    totalDebitsCount: number;
    totalSpent: number;
    firstDebitDate?: string | null;
    latestDebitDate?: string | null;
    averageDebitAmount?: number;
    cadence?: string;
  };
  sectionE_Reconciliation: {
    reconciliationStatus: string;
    amountComparison?: string;
    cadenceComparison?: string;
    lifecycleComparison?: string;
    explanation?: string;
    outcome?: ReconciliationOutcomeStatus;
    expectedPrice?: number | null;
    actualAmount?: number;
    mandateCap?: number | null;
    discrepancyAmount?: number | null;
    discrepancyPercent?: number | null;
    evidenceRecordIds?: string[];
    recommendedAction?: string;
  };
  sectionF_Cancellation: {
    serviceLifecycleStatus?: string;
    mandateLifecycleStatus?: string;
    bothCancelled?: boolean;
    areBothStopped?: boolean;
    cancellationSummary?: string;
  };
  sectionG_Evidence: {
    evidenceRecordsCount: number;
    evidenceRecords: {
      id: string;
      title: string;
      description: string;
      date: string;
      verificationStatus: string;
      sourceReference?: string | null;
    }[];
  };
  dataCoverage: {
    coveragePercent: number;
    verifiedElementsCount: number;
    totalElementsCount: number;
    missingElements?: string[];
    qualitySummary?: string;
    statusBreakdown?: Record<string, number>;
    overallQualityPercent?: number;
    coverageStatement?: string;
    missingItems?: string[];
  };
  recordCoverage?: {
    percent: number;
    presentCount: number;
    totalCount: number;
    missingItems: string[];
  };
  verificationQuality?: {
    provenance: string;
    confidenceScore: number;
    confidenceLabel: string;
    isUserConfirmed: boolean;
    confirmedAt?: string | null;
  };
  financialReconciliationStatus?: {
    status: string;
    isDiscrepancy: boolean;
    explanation: string;
  };
  // Backwards compatibility sections
  sectionB_FinancialPattern?: any;
  sectionC_Authorisation?: any;
  sectionD_ServiceTerms?: any;
  sectionF_Lifecycle?: any;
  sectionG_EvidenceTimeline?: any;
}

// ============================================================================
// PART 7: EVIDENCE PACK DATA EXPORT
// ============================================================================
export interface EvidencePackData {
  commitmentId?: string;
  evidencePackVersion?: string;
  exportTimestamp?: string;
  header: {
    platformName: string;
    reportTitle: string;
    subtitle: string;
    reportId: string;
    generatedAt: string;
    syntheticNotice: string;
  };
  commitmentIdentity: {
    merchantName: string;
    serviceName: string;
    commitmentId: string;
    descriptors: string[];
    resolutionStatus: RelationshipConfidenceStatus | string;
    provenance: string;
  };
  transactions: {
    id: string;
    date: string;
    description: string;
    amount: number;
    direction: string;
    currency: string;
    reference: string | null;
    source: string;
  }[];
  serviceTerms: {
    documentedPrice: number | null;
    billingFrequency: string;
    currency: string;
    documentSource: string | null;
    documentId: string | null;
    verificationStatus: string;
    missingFields: string[];
  };
  paymentMandate: {
    mandateId: string | null;
    mandateReference: string | null;
    paymentRail: string;
    maxAuthorisedAmount: number | null;
    effectiveStatus: string;
    startDate: string | null;
    expiryDate: string | null;
    provenance: string;
    missingFields: string[];
  };
  reconciliation: {
    outcome: ReconciliationOutcomeStatus;
    explanation: string;
    expectedServicePrice: number | null;
    actualDebitAmount: number;
    mandateCap: number | null;
    discrepancyAmount: number | null;
    discrepancyPercent: number | null;
    recommendedAction: string;
  };
  cancellationEvidence: {
    serviceLifecycle: ServiceLifecycleStatus;
    mandateLifecycle: MandateLifecycleStatus;
    requestDates: { service?: string | null; mandate?: string | null };
    confirmationReferences: string[];
    evidenceSources: string[];
    verificationStatus: string;
  };
  postCancellationActivity: {
    subsequentDebitsDetected: boolean;
    subsequentDebits: { id: string; date: string; amount: number; description: string }[];
    monitoringStatement: string;
  };
  dataLimitations: {
    missingDocuments: boolean;
    missingMandateDetails: boolean;
    unconfirmedMerchant: boolean;
    unverifiedCancellation: boolean;
    evidenceGaps: string[];
  };
  provenanceNotice: string;
}

export type DateFormatOption =
  | 'DD/MM/YYYY'
  | 'DD-MM-YYYY'
  | 'MM/DD/YYYY'
  | 'MM-DD-YYYY'
  | 'YYYY-MM-DD'
  | 'AUTO';

// ============================================================================
// PART 8: CSV MAPPING WIZARD TYPES
// ============================================================================
export interface CsvMappingConfig {
  dateColumn: string;
  descriptionColumn: string;
  amountMode: 'SEPARATE_COLUMNS' | 'SINGLE_SIGNED_COLUMN' | 'SEPARATE_DEBIT_CREDIT' | 'SINGLE_AMOUNT';
  debitColumn?: string;
  creditColumn?: string;
  debitAmountColumn?: string;
  creditAmountColumn?: string;
  singleAmountColumn?: string;
  signedAmountColumn?: string;
  dateFormat: DateFormatOption;
  referenceColumn?: string;
  accountColumn?: string;
  currencyColumn?: string;
  defaultRail?: string;
  defaultAccountAlias?: string;
}

export interface CsvMappingPreviewRow {
  rowNumber: number;
  rawDate: string;
  parsedDate: string | null;
  rawDescription: string;
  rawAmount: string;
  interpretedAmount: number | null;
  direction: 'DEBIT' | 'CREDIT';
  isValid: boolean;
  rejectReason?: string;
  validationError?: string;
  mappedRow?: {
    transaction_date: string;
    raw_description: string;
    amount: string;
    currency: string;
    direction: string;
    account_alias?: string;
    payment_rail?: string;
    external_reference?: string;
  } | null;
}

export interface CsvMappingPreviewResult {
  headers: string[];
  suggestedMappings: CsvMappingConfig;
  detectedMapping: CsvMappingConfig;
  previewRows: CsvMappingPreviewRow[];
  totalRows: number;
  totalRowsFound?: number;
  validRowCount: number;
  validRowsCount: number;
  rejectedRowCount: number;
  duplicateRowCount: number;
  unmappedHeaders: string[];
  validationErrors: { row: number; reason: string }[];
}

