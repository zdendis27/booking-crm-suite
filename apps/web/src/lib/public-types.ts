export interface PublicLocation {
  id: string;
  name: string;
  slug: string;
  street: string | null;
  city: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  hours: { weekday: number; opens: string; closes: string }[];
  settings: { slot_interval_min: number; min_notice_min: number; max_advance_days: number; confirmation_mode: "auto" | "manual"; cancel_deadline_h: number } | null;
}

export interface PublicService {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  duration_min: number;
  price: number;
  price_is_from: boolean;
}

export interface PublicStaff {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  photo_path: string | null;
  color: string | null;
  location_ids: string[];
  services: Record<string, { price: number; duration_min: number }>;
}

export interface PublicSalon {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  timezone: string;
  address: { street: string | null; city: string | null; zip: string | null };
  logo_path: string | null;
  cover_path: string | null;
  brand_color: string | null;
  google_review_url: string | null;
  verification_policy: "email" | "email_phone";
  locations: PublicLocation[];
  categories: { id: string; name: string }[];
  services: PublicService[];
  staff: PublicStaff[];
  loyalty: { threshold: number; reward_type: string; reward_value: number; reward_service: string | null } | null;
  photos: { path: string; caption: string | null }[];
  reviews: { author: string; rating: number; body: string }[];
}
