import React, { createContext, useContext } from 'react';

import { SharedItem, useShareIntent } from '@/hooks/useShareIntent';

type ShareIntentContextType = {
  pendingItems: SharedItem[];
  clearSharedItems: () => void;
};

const ShareIntentContext = createContext<ShareIntentContextType>({
  pendingItems: [],
  clearSharedItems: () => {},
});

export function ShareIntentProvider({ children }: { children: React.ReactNode }) {
  const share = useShareIntent();
  return (
    <ShareIntentContext.Provider value={share}>
      {children}
    </ShareIntentContext.Provider>
  );
}

export function useShareIntentContext() {
  return useContext(ShareIntentContext);
}
