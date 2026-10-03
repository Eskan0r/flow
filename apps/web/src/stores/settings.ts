import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  soundOn: boolean;
  reduceMotion: boolean;
  setSound: (on: boolean) => void;
  setReduceMotion: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: true,
      reduceMotion: false,
      setSound: (on) => set({ soundOn: on }),
      setReduceMotion: (on) => set({ reduceMotion: on }),
    }),
    { name: "flow.v2.settings", version: 3 }
  )
);
