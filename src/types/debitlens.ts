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
  | 'UNRESOLVED';

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
  | 'ONE_TIME';

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

export type GraphExecutionMode =
  | 'LIVE_NEO4J'
  | 'LOCAL_PREVIEW'
  | 'NOT_CONFIGURED'
  | 'CONNECTION_FAILED';

export type SarvamRuntimeStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_NOT_TESTED'
  | 'LIVE_SUCCESS'
  | 'REQUEST_FAILED'
  | 'RATE_LIMITED'
  | 'LOCAL_FALLBACK';

export interface TransactionRecord {
  id: string;
  transactionId: string;
  transactionDate: string;
  rawDescription: string;
  normalisedDescription: string;
  amount: number;
  currency: string;
  direction: 'DEBIT' | 'CREDIT';
  paymentRail: PaymentRailType;
  accountAlias: string;
  // Separate explicit identity fields (Part 5.2)
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

export interface CommitmentRecord {
  id: string;
  merchantId: string;
  merchantName: string;
  serviceName: string;
  category: CommitmentCategory;
  isFinancialObligation: boolean;
  obligationWarning?: string;
  paymentRail: PaymentRailType;
  mandateRef: string | null;
  processorName: string | null;
  recurrenceType: RecurrenceFrequency;
  recurrenceIntervalDays: number | null;
  typicalAmount: number;
  latestAmount: number;
  previousAmount: number | null;
  currency: string;
  annualisedAmount: number;
  monthlyEquivalent: number;
  totalHistoricalSpend: number;
  nextExpectedDate: string | null;
  lastPaymentDate: string;
  status: 'ACTIVE' | 'RESUMED_REVIEW' | 'CANCELLED_USER_CONFIRMED' | 'POST_CANCEL_ALERT' | 'NEEDS_REVIEW';
  relationshipStatus: RelationshipConfidenceStatus;
  confidenceScore: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceBreakdown: ConfidenceScoreBreakdown;
  detectionExplanation: string;
  supportingTransactionIds: string[];
  connectedDescriptors: string[];
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
}

export type AlertType =
  | 'PRICE_INCREASE'
  | 'UPCOMING_RENEWAL'
  | 'ANNUAL_RENEWAL'
  | 'TRIAL_CONVERSION'
  | 'RESUMED_PAYMENT'
  | 'POTENTIALLY_UNUSED'
  | 'UNIDENTIFIED_MERCHANT'
  | 'POST_CANCELLATION_DEBIT';

export interface DetectionAlertRecord {
  id: string;
  commitmentId: string | null;
  transactionId?: string | null;
  alertType: AlertType;
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
  cancellationSessionId: string;
  evidenceType: 'SERVICE_CONFIRMATION' | 'MANDATE_REVOCATION' | 'SUPPORT_TICKET' | 'MERCHANT_UNRESPONSIVE';
  description: string;
  referenceNumber: string;
  evidenceDate: string;
  verificationStatus: 'USER_REPORTED' | 'EVIDENCE_ATTACHED';
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
  initiatedAt: string | null;
  serviceCancelledAt: string | null;
  paymentAuthorisationRevokedAt: string | null;
  lastReviewedAt: string;
  steps: CancellationPlaybookStep[];
  evidence: CancellationEvidenceRecord[];
  postCancellationTransactionIds: string[];
}

// ============================================================================
// NEO4J COMMITMENT GRAPH TYPES (17 Node Labels, 18 Relationship Types)
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
  | 'Mandate'
  | 'PaymentRail'
  | 'NotificationEvent'
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
  sarvamMeta: {
    mode: 'LIVE_SARVAM' | 'LOCAL_FALLBACK';
    status: SarvamRuntimeStatus;
    chatModel: string;
    translationModel: string;
    endpointCalled: string;
    timestamp: string;
    fallbackReason?: string;
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
  sarvamMeta: {
    mode: 'LIVE_SARVAM' | 'LOCAL_FALLBACK';
    status: SarvamRuntimeStatus;
    modelUsed: string;
    endpointCalled: string;
    timestamp: string;
    fallbackReason?: string;
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
    mode: 'LIVE_SARVAM' | 'LOCAL_FALLBACK';
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
    driverStatus: 'LIVE_NEO4J' | 'LOCAL_PREVIEW' | 'NOT_CONFIGURED' | 'CONNECTION_FAILED';
    message: string;
    nodeCount: number;
    relationshipCount: number;
    constraintsVerified: boolean;
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
