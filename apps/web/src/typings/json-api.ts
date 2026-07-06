export interface ApiResponse<TData> {
  data?: TData;
}

type JsonSerializedDate<TValue> =
  Extract<TValue, Date> extends never ? TValue : Exclude<TValue, Date> | string;

/**
 * Converts selected database Date fields to their JSON API string form.
 */
export type JsonSerializedDates<TRecord, TKeys extends keyof TRecord> = Omit<
  TRecord,
  TKeys
> & {
  [TKey in TKeys]: JsonSerializedDate<TRecord[TKey]>;
};
