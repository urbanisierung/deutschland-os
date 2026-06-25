import type {
  ProviderCertification,
  ProviderMatch,
  ServiceFinderResult,
  ServiceRequest,
} from "@deutschland-os/shared";
import { ProviderCertificationSchema } from "@deutschland-os/shared";
import { create } from "zustand";

type Status = "idle" | "loading" | "success" | "error";

/** Job form fields use strings where inputs are free text; numbers parsed on submit. */
export type ServiceForm = {
  trade: ServiceRequest["trade"];
  postalCode: string;
  buildingType: ServiceRequest["building"]["type"];
  heatedAreaM2: string;
  currentHeating: ServiceRequest["building"]["currentHeating"];
  wantsKfW: boolean;
  notes: string;
};

type ServiceState = {
  form: ServiceForm;
  /** One provider per line: `Name; distanceKm; eligible(ja/nein); cert1, cert2`. */
  providersText: string;
  status: Status;
  error: string | null;
  result: ServiceFinderResult | null;
  setForm: <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => void;
  setProvidersText: (text: string) => void;
  submit: () => Promise<void>;
};

const defaultForm: ServiceForm = {
  trade: "waermepumpe",
  postalCode: "10115",
  buildingType: "altbau",
  heatedAreaM2: "140",
  currentHeating: "gas",
  wantsKfW: true,
  notes: "",
};

const exampleProviders = [
  "Wärme & Technik Berlin GmbH; 4.2; ja; meisterbetrieb, innung-shk",
  "Sonnen Heizbau GmbH; 28; nein; meisterbetrieb",
].join("\n");

const toNumber = (value: string): number => Number(value.trim().replace(",", "."));

function parseCertifications(raw: string): ProviderCertification[] {
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => ProviderCertificationSchema.safeParse(part))
    .filter((parsed) => parsed.success)
    .map((parsed) => (parsed as { success: true; data: ProviderCertification }).data);
}

/**
 * Parses the manual provider textarea into already-enriched {@link ProviderMatch}
 * rows. Location is irrelevant to ranking here (distance is supplied directly),
 * so it is set to a placeholder; the Places API fills real coordinates upstream.
 * Malformed lines (missing name or non-numeric distance) are skipped.
 */
export function parseProviderLines(text: string): ProviderMatch[] {
  const providers: ProviderMatch[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line) continue;
    const [name = "", distanceRaw = "", eligibleRaw = "", certsRaw = ""] = line.split(";");
    const trimmedName = name.trim();
    const distanceKm = toNumber(distanceRaw);
    if (!trimmedName || !distanceRaw.trim() || !Number.isFinite(distanceKm)) continue;

    providers.push({
      id: `manual-${i + 1}`,
      name: trimmedName,
      location: { lat: 0, lng: 0 },
      distanceKm,
      certifications: parseCertifications(certsRaw),
      fundingEligible: /^(ja|j|true|yes)$/i.test(eligibleRaw.trim()),
      url: null,
    });
  }

  return providers;
}

function formToRequest(form: ServiceForm): ServiceRequest {
  return {
    trade: form.trade,
    postalCode: form.postalCode.trim(),
    building: {
      type: form.buildingType,
      heatedAreaM2: toNumber(form.heatedAreaM2),
      currentHeating: form.currentHeating,
    },
    funding: { wantsKfW: form.wantsKfW },
    notes: form.notes.trim(),
  };
}

export const useServiceStore = create<ServiceState>((set, get) => ({
  form: defaultForm,
  providersText: exampleProviders,
  status: "idle",
  error: null,
  result: null,
  setForm: (key, value) => set((s) => ({ form: { ...s.form, [key]: value } })),
  setProvidersText: (text) => set({ providersText: text }),
  submit: async () => {
    const { form, providersText } = get();
    set({ status: "loading", error: null, result: null });

    const providers = parseProviderLines(providersText);
    if (providers.length === 0) {
      set({ status: "error", error: "Bitte mindestens einen Betrieb eingeben." });
      return;
    }

    try {
      const response = await fetch("/api/find-provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: formToRequest(form), providers }),
      });
      const data = (await response.json()) as ServiceFinderResult | { error: string };

      if (!response.ok || !("ranked" in data)) {
        const message = "error" in data ? data.error : "Unknown error.";
        set({ status: "error", error: message });
        return;
      }

      set({ status: "success", result: data });
    } catch (error) {
      set({ status: "error", error: (error as Error).message });
    }
  },
}));
