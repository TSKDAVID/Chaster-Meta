export type MessagePlatform = "messenger" | "instagram";

export type ConversationStatus = "open" | "human" | "ended";

export type MessengerPage = {
  id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  facebook_user_id: string | null;
  connected_at: string;
  updated_at: string;
};

export type MessengerMessage = {
  id: string;
  page_id: string;
  sender_id: string;
  recipient_id: string;
  mid: string | null;
  message_text: string | null;
  direction: "incoming" | "outgoing";
  platform: MessagePlatform;
  reply_to_mid?: string | null;
  page_reaction?: string | null;
  customer_reaction?: string | null;
  raw_payload: unknown;
  created_at: string;
};

export type ConversationSummary = {
  peer_id: string;
  display_name: string | null;
  profile_pic: string | null;
  last_message_text: string | null;
  last_message_at: string;
  last_direction: "incoming" | "outgoing";
  message_count: number;
  platform: MessagePlatform;
  status: ConversationStatus;
};

export type BookingMode = "hourly" | "day" | "multi_day";

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

/** Weekday keys used for open_days (Mon–Sun labels in UI). */
export type WeekdayKey =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type BookingSettings = {
  page_id: string;
  enabled: boolean;
  booking_mode: BookingMode;
  slot_minutes: number;
  open_time: string;
  close_time: string;
  /** Days the Page is open (business timezone). */
  open_days: WeekdayKey[];
  timezone: string;
  buffer_minutes: number;
  max_advance_days: number;
  updated_at?: string;
};

export type ResourceKind = "staff" | "room" | "equipment" | "service" | "other";

/** Bookable unit (barber, room, service, …) — Resources module. */
export type BookableResource = {
  id: string;
  page_id: string;
  name: string;
  kind: ResourceKind;
  active: boolean;
  sort_order: number;
  notes: string | null;
  /** Lucide icon key for services/rooms (see service-icons). */
  icon: string | null;
  /** Null = inherit Page booking settings hours. */
  open_time: string | null;
  close_time: string | null;
  /** Null = inherit Page open_days. */
  open_days: WeekdayKey[] | null;
  /** Linked capacity units (e.g. staff under a service). */
  linked_ids: string[];
  /**
   * Non-staff units (room / equipment / other) must opt in before they can
   * be linked as capacity under a service. Staff default to true.
   */
  serviceable: boolean;
  created_at: string;
  updated_at: string;
};

/** Lightweight shape for AI ModuleContext / prompts. */
export type ResourceSummary = {
  id: string;
  name: string;
  kind: ResourceKind;
  linked_ids?: string[];
  serviceable?: boolean;
};

export type Booking = {
  id: string;
  page_id: string;
  peer_id: string | null;
  customer_name: string | null;
  service_label: string | null;
  notes: string | null;
  /** Primary booked resource (service, staff, room, …). */
  resource_id: string | null;
  /** Capacity unit reserved when primary has associations (e.g. staff for a service). */
  assigned_resource_id: string | null;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  source: "desk" | "ai";
  created_at: string;
  updated_at: string;
};

/** Hours & place profile for AI + desk (per Page). */
export type PageProfile = {
  page_id: string;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  maps_url: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  open_time: string;
  close_time: string;
  open_days: WeekdayKey[];
  hours_note: string | null;
  updated_at?: string;
};

/** Priced catalog / menu item. */
export type CatalogAvailability = "in_stock" | "seasonal" | "ask";

export type CatalogVariant = {
  id: string;
  name: string;
  price: number | null;
  unit: string | null;
};

export type CatalogItem = {
  id: string;
  page_id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  unit: string | null;
  category: string | null;
  image_url: string | null;
  availability: CatalogAvailability;
  tags: string[];
  variants: CatalogVariant[];
  /** True for services or unlimited inventory. */
  stock_unlimited: boolean;
  /** Units on hand when stock_unlimited is false. */
  stock_qty: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
