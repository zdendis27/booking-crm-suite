export interface Snapshot {
  period: { from: string; to: string };
  bookings: {
    total: number;
    completed: number;
    upcoming: number;
    pending: number;
    cancelled: number;
    no_show: number;
    online: number;
  };
  revenue: {
    received: number;
    tips: number;
    earned: number;
    products: number;
    discounts: number;
    by_method: Record<string, number>;
  };
  expenses: { total: number; by_category: Record<string, number> } | null;
  clients: { new: number; active: number; returning: number };
  average_spend: number;
  occupancy: { booked_min: number; scheduled_min: number; ratio: number };
  by_service: { name: string; count: number; revenue: number }[];
  by_weekday: { weekday: number; bookings: number; booked_min: number; scheduled_min: number; ratio: number }[];
  by_staff:
    | {
        staff_id: string;
        name: string;
        revenue: number;
        bookings: number;
        clients: number;
        booked_min: number;
        scheduled_min: number;
        commission: number;
      }[]
    | null;
  daily: { day: string; received: number; bookings: number }[];
}

export interface BookingRow {
  id: string;
  status: string;
  source: string;
  starts_at: string;
  ends_at: string;
  price_total: number;
  discount_total: number;
  products_total: number;
  deposit_amount: number;
  client_note: string | null;
  internal_note: string | null;
  primary_staff_id: string | null;
  client_id: string;
  location_id: string;
  client: { id: string; first_name: string; last_name: string; full_name: string; phone: string | null; email: string | null } | null;
  items: { id: string; service_id: string; staff_id: string; position: number; starts_at: string; ends_at: string; name_snap: string; price_snap: number; duration_snap: number }[];
}
