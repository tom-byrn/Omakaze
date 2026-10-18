import {
  filtersToSearchParams,
  type ApiErrorBody,
  type Inquiry,
  type InquiryInput,
  type ListingDetail,
  type ListingFilters,
  type ListingSearchResult,
  type ListingSummary,
  type MarketStats,
  type MortgageRates,
  type Neighborhood,
  type Offer,
  type OfferInput,
  type OfferWithListing,
  type PriceEvent,
  type SavedSearch,
  type SearchCriteria,
  type TourDay,
  type TourRequest,
  type TourRequestInput,
} from '@hearth/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(response.status, error?.message ?? `Request failed (${response.status})`, error?.fields);
  }
  return body as T;
}

function send<T>(method: string, path: string, payload?: unknown): Promise<T> {
  return request<T>(path, { method, body: payload === undefined ? undefined : JSON.stringify(payload) });
}

export const api = {
  neighborhoods: () => request<Neighborhood[]>('/neighborhoods'),

  searchListings: (filters: ListingFilters, signal?: AbortSignal) =>
    request<ListingSearchResult>(`/listings?${filtersToSearchParams(filters)}`, { signal }),

  listing: (id: number, signal?: AbortSignal) => request<ListingDetail>(`/listings/${id}`, { signal }),

  sendInquiry: (listingId: number, input: Partial<InquiryInput>) =>
    send<Inquiry>('POST', `/listings/${listingId}/inquiries`, input),

  favorites: (signal?: AbortSignal) => request<ListingSummary[]>('/favorites', { signal }),

  addFavorite: (listingId: number) => send<{ listingId: number }>('PUT', `/favorites/${listingId}`),

  removeFavorite: (listingId: number) => send<void>('DELETE', `/favorites/${listingId}`),

  priceHistory: (listingId: number, signal?: AbortSignal) =>
    request<{ events: PriceEvent[] }>(`/listings/${listingId}/price-history`, { signal }),

  market: (neighborhood: string, signal?: AbortSignal) => request<MarketStats>(`/market/${neighborhood}`, { signal }),

  mortgageRates: () => request<{ rates: MortgageRates }>('/mortgage/rates'),

  makeOffer: (listingId: number, input: OfferInput) => send<Offer>('POST', `/listings/${listingId}/offers`, input),

  offers: (signal?: AbortSignal) => request<OfferWithListing[]>('/offers', { signal }),

  withdrawOffer: (offerId: number) => send<Offer>('PATCH', `/offers/${offerId}`, { status: 'withdrawn' }),

  tourAvailability: (listingId: number, signal?: AbortSignal) =>
    request<{ days: TourDay[] }>(`/listings/${listingId}/tours/availability`, { signal }),

  requestTour: (listingId: number, input: TourRequestInput) =>
    send<TourRequest>('POST', `/listings/${listingId}/tours`, input),

  savedSearches: (signal?: AbortSignal) => request<SavedSearch[]>('/saved-searches', { signal }),

  saveSearch: (criteria: SearchCriteria, alertFrequency: string) =>
    send<SavedSearch>('POST', '/saved-searches', {
      criteria: Object.fromEntries(filtersToSearchParams({ ...criteria, page: 1 })),
      alertFrequency,
    }),

  deleteSavedSearch: (id: number) => send<void>('DELETE', `/saved-searches/${id}`),
};
