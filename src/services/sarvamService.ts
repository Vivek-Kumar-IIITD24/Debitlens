import {
  LanguageCode,
  SupportedLanguage,
  BhashaMerchantExplanationResponse,
  BhashaCancellationExplanationResponse,
  BhashaAlertExplanationResponse,
  BhashaContextualQuestionResponse,
} from '../types/debitlens';

const merchantExplanationCache = new Map<string, BhashaMerchantExplanationResponse>();
const cancellationExplanationCache = new Map<string, BhashaCancellationExplanationResponse>();
const alertExplanationCache = new Map<string, BhashaAlertExplanationResponse>();
const contextualAskCache = new Map<string, BhashaContextualQuestionResponse>();

export const sarvamService = {
  async getSupportedLanguages(): Promise<{
    defaultLanguage: LanguageCode;
    languages: SupportedLanguage[];
  }> {
    const res = await fetch('/api/language/supported');
    if (!res.ok) throw new Error('Failed to load supported languages');
    return res.json();
  },

  async explainMerchantTransaction(
    transactionId: string,
    language: LanguageCode
  ): Promise<BhashaMerchantExplanationResponse> {
    const cacheKey = `${transactionId}:${language}`;
    if (merchantExplanationCache.has(cacheKey)) {
      return merchantExplanationCache.get(cacheKey)!;
    }
    const res = await fetch('/api/language/merchant-explanation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, language }),
    });
    if (!res.ok) throw new Error('Failed to generate merchant explanation');
    const data = (await res.json()) as BhashaMerchantExplanationResponse;
    merchantExplanationCache.set(cacheKey, data);
    return data;
  },

  async explainCancellationPlaybook(
    commitmentId: string,
    language: LanguageCode
  ): Promise<BhashaCancellationExplanationResponse> {
    const cacheKey = `${commitmentId}:${language}`;
    if (cancellationExplanationCache.has(cacheKey)) {
      return cancellationExplanationCache.get(cacheKey)!;
    }
    const res = await fetch('/api/language/cancellation-explanation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitmentId, language }),
    });
    if (!res.ok) throw new Error('Failed to generate cancellation explanation');
    const data = (await res.json()) as BhashaCancellationExplanationResponse;
    cancellationExplanationCache.set(cacheKey, data);
    return data;
  },

  async explainFinancialAlert(
    alertId: string,
    language: LanguageCode
  ): Promise<BhashaAlertExplanationResponse> {
    const cacheKey = `${alertId}:${language}`;
    if (alertExplanationCache.has(cacheKey)) {
      return alertExplanationCache.get(cacheKey)!;
    }
    const res = await fetch('/api/language/financial-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId, language }),
    });
    if (!res.ok) throw new Error('Failed to generate alert explanation');
    const data = (await res.json()) as BhashaAlertExplanationResponse;
    alertExplanationCache.set(cacheKey, data);
    return data;
  },

  async askContextualQuestion(params: {
    commitmentId: string;
    question: string;
    language: LanguageCode;
  }): Promise<BhashaContextualQuestionResponse> {
    const cacheKey = `${params.commitmentId}:${params.language}:${params.question}`;
    if (contextualAskCache.has(cacheKey)) {
      return contextualAskCache.get(cacheKey)!;
    }
    const res = await fetch('/api/sarvam/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to generate contextual Bhasha answer');
    const data = (await res.json()) as BhashaContextualQuestionResponse;
    contextualAskCache.set(cacheKey, data);
    return data;
  },

  clearCache() {
    merchantExplanationCache.clear();
    cancellationExplanationCache.clear();
    alertExplanationCache.clear();
    contextualAskCache.clear();
  },
};
