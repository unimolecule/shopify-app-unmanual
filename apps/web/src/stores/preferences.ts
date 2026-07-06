import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { readCurrentShop } from "@/utils/shop";

interface PreferencesState {
  setupGuideCompleted: boolean;
  resetSetupGuide: () => void;
  setSetupGuideCompleted: (completed: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    immer((set) => ({
      setupGuideCompleted: false,

      resetSetupGuide: () =>
        set((state) => {
          state.setupGuideCompleted = false;
        }),

      setSetupGuideCompleted: (completed) =>
        set((state) => {
          state.setupGuideCompleted = completed;
        }),
    })),
    {
      name: createShopScopedStorageKey("preferences:v1"),
      partialize: (state) => ({
        setupGuideCompleted: state.setupGuideCompleted,
      }),
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

function createShopScopedStorageKey(scope: string) {
  return `${globalThis.__PUBLIC_ENV__?.APP_NAME}:${readCurrentShop()}:${scope}`;
}
