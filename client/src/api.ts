import {
  filtersToSearchParams,
  type ApiErrorBody,
  type Inquiry,
  type InquiryInput,
  type ListingDetail,
  type ListingFilters,
  type ListingSearchResult,
  type ListingSummary,
  type Neighborhood,
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
};
