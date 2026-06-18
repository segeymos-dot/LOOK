export type UserRole = "customer" | "provider" | "both";
export type RequestStatus = "open" | "in_progress" | "completed" | "cancelled";
export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  link: string | null;
}

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  city: string | null;
  country: string | null;
  phone: string | null;
  skills: string | null;
  portfolio: string | null;
  portfolio_items: PortfolioItem[];
  provider_category_slugs: string[];
  rating: number;
  reviews_count: number;
  completed_orders_count: number;
  phone_verified: boolean;
  is_platform_admin?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  provider_id: string;
  reviewer_id: string;
  request_id: string | null;
  rating: number;
  comment: string;
  created_at: string;
  reviewer?: Pick<Profile, "full_name" | "avatar_url">;
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

export interface CreateReviewInput {
  provider_id: string;
  request_id: string;
  rating: number;
  comment: string;
}

export interface ProviderVerification {
  phoneVerified: boolean;
  emailVerified: boolean;
  profileComplete: boolean;
}

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type TransactionType =
  | "order_payment"
  | "platform_commission"
  | "provider_earning"
  | "provider_payout"
  | "refund";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";
export type PayoutStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface Payment {
  id: string;
  request_id: string;
  offer_id: string;
  customer_id: string;
  provider_id: string;
  amount_gross: number;
  platform_fee: number;
  provider_amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string;
  paid_at: string | null;
  created_at: string;
}

export interface ProviderBalance {
  provider_id: string;
  available_balance: number;
  pending_payout: number;
  total_earned: number;
  currency: string;
  updated_at: string;
}

export interface PlatformSummary {
  commission_rate: number;
  total_commission: number;
  paid_orders_count: number;
  gross_volume: number;
  currency: string;
}

export interface FinanceTransaction {
  id: string;
  payment_id: string | null;
  payout_id: string | null;
  request_id: string | null;
  user_id: string | null;
  provider_id: string | null;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description: string;
  created_at: string;
}

export interface PaymentSimulationResult {
  payment_id: string;
  request_id: string;
  amount_gross: number;
  platform_fee: number;
  provider_amount: number;
  commission_rate: number;
  currency: string;
  status: PaymentStatus;
}
