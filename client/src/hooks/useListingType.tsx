import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ListingType } from '@hearth/shared';

const ListingTypeContext = createContext<{
  type: ListingType;
  setType: (type: ListingType) => void;
}>({ type: 'rent', setType: () => undefined });

/** Remembers whether the visitor is renting or buying, so the header toggle follows them around. */
export function ListingTypeProvider({ children }: { children: ReactNode }) {
  const [type, setType] = useState<ListingType>('rent');
  return <ListingTypeContext.Provider value={{ type, setType }}>{children}</ListingTypeContext.Provider>;
}

export function useListingType(): ListingType {
  return useContext(ListingTypeContext).type;
}

/** Called by pages that know which kind of listing is on screen. */
export function useSyncListingType(type: ListingType | undefined): void {
  const { setType } = useContext(ListingTypeContext);
  useEffect(() => {
    if (type) setType(type);
  }, [type, setType]);
}
