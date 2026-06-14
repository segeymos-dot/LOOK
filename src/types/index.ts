export type UserRole = "customer" | "provider" | "both";
export type RequestStatus = "open" | "in_progress" | "completed" | "cancelled";
export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  city: string | null;
  country: string | null;
  rating: number;
  reviews_count: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface Request {
  id: string;
  customer_id: string;
  category_id: string | null;
  title: string;
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  location: string | null;
  status: RequestStatus;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer?: Profile;
  category?: Category;
  offers_count?: number;
}

export interface Offer {
  id: string;
  request_id: string;
  provider_id: string;
  price: number;
  currency: string;
  message: string;
  estimated_days: number | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
  // Joined fields
  provider?: Profile;
  request?: Request;
}

export interface Conversation {
  id: string;
  request_id: string;
  customer_id: string;
  provider_id: string;
  offer_id: string | null;
  last_message_at: string;
  created_at: string;
  // Joined fields
  customer?: Profile;
  provider?: Profile;
  request?: Request;
  last_message?: Message;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  // Joined fields
  sender?: Profile;
}

export interface CreateRequestInput {
  title: string;
  description: string;
  category_id?: string;
  budget_min?: number;
  budget_max?: number;
  currency?: string;
  location?: string;
  deadline?: string;
}

export interface CreateOfferInput {
  request_id: string;
  price: number;
  message: string;
  currency?: string;
  estimated_days?: number;
}

export interface SendMessageInput {
  conversation_id: string;
  content: string;
}
