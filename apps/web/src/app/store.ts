import { create, type StoreApi } from 'zustand';

type SetHostStore = StoreApi<HostStore>['setState'];

export type ScreenSliceCreator<T> = (set: SetHostStore, get: () => HostStore) => T;

type HostStore = {
  slices: Record<string, unknown>;
  registerSlice<T>(name: string, creator: ScreenSliceCreator<T>): T;
};

export const useHostStore = create<HostStore>()((set, get) => ({
  slices: {},
  registerSlice<T>(name: string, creator: ScreenSliceCreator<T>) {
    if (Object.hasOwn(get().slices, name)) {
      throw new Error(`store slice ${name} is already registered`);
    }

    const slice = creator(set, get);
    set((state) => ({ slices: { ...state.slices, [name]: slice } }));
    return slice;
  },
}));
