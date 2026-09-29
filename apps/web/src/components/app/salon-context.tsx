"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role = "owner" | "manager" | "reception" | "staff";

export interface SalonInfo {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  plan_code: string;
  brand_color: string;
  verification_policy: "email" | "email_phone";
  logo_path: string | null;
  status: string;
  google_review_url: string | null;
}

export interface LocationInfo {
  id: string;
  name: string;
  slug: string;
}

export interface SalonContextValue {
  salon: SalonInfo;
  role: Role;
  locations: LocationInfo[];
  locationId: string;
  setLocationId: (id: string) => void;
  planName: string;
  limits: { staff: number; locations: number; sms_included: number; features: string[] };
  staffId: string | null;
  userId: string;
  userEmail: string;
  userName: string;
  can: (roles: Role[]) => boolean;
  hasFeature: (feature: string) => boolean;
}

const SalonContext = createContext<SalonContextValue | null>(null);

export function SalonProvider({
  children,
  salon,
  role,
  locations,
  planName,
  limits,
  staffId,
  userId,
  userEmail,
  userName,
}: Omit<SalonContextValue, "locationId" | "setLocationId" | "can" | "hasFeature"> & { children: ReactNode }) {
  const storageKey = `location:${salon.id}`;
  const [locationId, setLocationState] = useState(locations[0]?.id ?? "");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && locations.some((location) => location.id === stored)) setLocationState(stored);
    } catch {
      return;
    }
  }, [storageKey, locations]);

  const setLocationId = useCallback(
    (id: string) => {
      setLocationState(id);
      try {
        window.localStorage.setItem(storageKey, id);
      } catch {
        return;
      }
    },
    [storageKey],
  );

  const value = useMemo<SalonContextValue>(
    () => ({
      salon,
      role,
      locations,
      locationId,
      setLocationId,
      planName,
      limits,
      staffId,
      userId,
      userEmail,
      userName,
      can: (roles) => roles.includes(role),
      hasFeature: (feature) => limits.features.includes(feature),
    }),
    [salon, role, locations, locationId, setLocationId, planName, limits, staffId, userId, userEmail, userName],
  );

  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>;
}

export function useSalon(): SalonContextValue {
  const context = useContext(SalonContext);
  if (!context) {
    throw new Error("useSalon musí být uvnitř SalonProvider");
  }
  return context;
}
