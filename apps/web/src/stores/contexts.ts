import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { readCurrentShop } from "@/utils/shop";

type FormDraftValue = boolean | number | string | string[] | null;
type FormDraft = Record<string, FormDraftValue>;

interface ContextsState {
  formDrafts: Record<string, FormDraft>;
  clearFormDraft: (formId: string) => void;
  resetFormDrafts: () => void;
  setFormDraft: (formId: string, draft: FormDraft) => void;
  setFormDraftField: (
    formId: string,
    field: string,
    value: FormDraftValue,
  ) => void;
}

export const useContextsStore = create<ContextsState>()(
  persist(
    immer((set) => ({
      formDrafts: {},

      clearFormDraft: (formId) =>
        set((state) => {
          delete state.formDrafts[formId];
        }),

      resetFormDrafts: () =>
        set((state) => {
          state.formDrafts = {};
        }),

      setFormDraft: (formId, draft) =>
        set((state) => {
          state.formDrafts[formId] = draft;
        }),

      setFormDraftField: (formId, field, value) =>
        set((state) => {
          state.formDrafts[formId] ??= {};
          state.formDrafts[formId][field] = value;
        }),
    })),
    {
      name: createShopScopedStorageKey("contexts:v1"),
      partialize: (state) => ({
        formDrafts: state.formDrafts,
      }),
      storage: createJSONStorage(() => sessionStorage),
      version: 1,
    },
  ),
);

function createShopScopedStorageKey(scope: string) {
  return `${globalThis.__PUBLIC_ENV__?.APP_NAME}:${readCurrentShop()}:${scope}`;
}
