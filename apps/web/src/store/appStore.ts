import type { ApplicationResponse, Listing, UserProfile } from "@deutschland-os/shared";
import { create } from "zustand";

type Status = "idle" | "loading" | "success" | "error";
type SourceMode = "url" | "manual";

/** Manual listing form fields use strings so empty inputs map cleanly to null. */
export type ManualListing = {
  title: string;
  district: string;
  coldRent: string;
  additionalCosts: string;
  squareMeters: string;
  amenities: string;
  description: string;
};

type AppState = {
  profile: UserProfile;
  sourceMode: SourceMode;
  url: string;
  manual: ManualListing;
  status: Status;
  error: string | null;
  result: ApplicationResponse | null;
  listingUsed: Listing | null;
  setProfile: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => void;
  setManual: <K extends keyof ManualListing>(key: K, value: ManualListing[K]) => void;
  setSourceMode: (mode: SourceMode) => void;
  setUrl: (url: string) => void;
  submit: () => Promise<void>;
};

const emptyManual: ManualListing = {
  title: "",
  district: "",
  coldRent: "",
  additionalCosts: "",
  squareMeters: "",
  amenities: "",
  description: "",
};

const defaultProfile: UserProfile = {
  fullName: "Adam",
  profession: "Senior Cloud Platform & Software Developer",
  employmentStatus: "Unbefristet",
  householdSize: 3,
  hasChildren: true,
  hasPets: false,
  monthlyNetIncome: 6500,
  moveInDate: "Ab sofort / Flexibel",
  additionalNotes: "Ruhiger Mieter, Nichtraucher, handwerklich geschickt.",
};

const toNumberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export function manualToListing(manual: ManualListing): Listing {
  return {
    id: "",
    title: manual.title.trim(),
    district: manual.district.trim(),
    coldRent: toNumberOrNull(manual.coldRent),
    additionalCosts: toNumberOrNull(manual.additionalCosts),
    squareMeters: toNumberOrNull(manual.squareMeters),
    amenities: manual.amenities
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    description: manual.description.trim(),
    url: null,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  profile: defaultProfile,
  sourceMode: "url",
  url: "",
  manual: emptyManual,
  status: "idle",
  error: null,
  result: null,
  listingUsed: null,
  setProfile: (key, value) => set((s) => ({ profile: { ...s.profile, [key]: value } })),
  setManual: (key, value) => set((s) => ({ manual: { ...s.manual, [key]: value } })),
  setSourceMode: (mode) => set({ sourceMode: mode }),
  setUrl: (url) => set({ url }),
  submit: async () => {
    const { profile, sourceMode, url, manual } = get();
    set({ status: "loading", error: null, result: null, listingUsed: null });

    const source =
      sourceMode === "url"
        ? { type: "url" as const, url: url.trim() }
        : { type: "manual" as const, listing: manualToListing(manual) };

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile, source }),
      });
      const data = (await response.json()) as
        | { result: ApplicationResponse; listing: Listing }
        | { error: string };

      if (!response.ok || !("result" in data)) {
        const message = "error" in data ? data.error : "Unknown error.";
        set({ status: "error", error: message });
        return;
      }

      set({ status: "success", result: data.result, listingUsed: data.listing });
    } catch (error) {
      set({ status: "error", error: (error as Error).message });
    }
  },
}));
