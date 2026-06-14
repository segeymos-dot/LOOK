-- LOOK Marketplace MVP Schema
-- Run via Supabase SQL Editor or: supabase db push

-- Enums
CREATE TYPE user_role AS ENUM ('customer', 'provider', 'both');
CREATE TYPE request_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  role user_role NOT NULL DEFAULT 'both',
  city TEXT,
  country TEXT,
  rating NUMERIC(3, 2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  reviews_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer requests (заказы / запросы)
CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_min NUMERIC(12, 2),
  budget_max NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  location TEXT,
  status request_status NOT NULL DEFAULT 'open',
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider offers (предложения исполнителей)
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  message TEXT NOT NULL,
  estimated_days INTEGER,
  status offer_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, provider_id)
);

-- Chat conversations (1 per request + accepted provider, or per offer negotiation)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, provider_id)
);

-- Chat messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_customer ON requests(customer_id);
CREATE INDEX idx_requests_category ON requests(category_id);
CREATE INDEX idx_offers_request ON offers(request_id);
CREATE INDEX idx_offers_provider ON offers(provider_id);
CREATE INDEX idx_conversations_customer ON conversations(customer_id);
CREATE INDEX idx_conversations_provider ON conversations(provider_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER requests_updated_at BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER offers_updated_at BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'role', '')::public.user_role,
      'both'::public.user_role
    )
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT ON TABLE public.profiles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- Update conversation last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_message_created
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Supabase auth admin can insert profiles"
  ON profiles FOR INSERT
  TO supabase_auth_admin
  WITH CHECK (true);

-- Categories policies
CREATE POLICY "Categories are viewable by everyone"
  ON categories FOR SELECT USING (true);

-- Requests policies
CREATE POLICY "Requests are viewable by everyone"
  ON requests FOR SELECT USING (true);
CREATE POLICY "Customers can create requests"
  ON requests FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Customers can update own requests"
  ON requests FOR UPDATE USING (auth.uid() = customer_id);

-- Offers policies
CREATE POLICY "Offers viewable by request owner and provider"
  ON offers FOR SELECT USING (
    auth.uid() = provider_id OR
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = offers.request_id
        AND r.customer_id = auth.uid()
    )
  );
CREATE POLICY "Providers can create offers"
  ON offers FOR INSERT WITH CHECK (auth.uid() = provider_id);
CREATE POLICY "Providers can update own offers"
  ON offers FOR UPDATE USING (auth.uid() = provider_id);
CREATE POLICY "Customers can update offer status on their requests"
  ON offers FOR UPDATE USING (
    auth.uid() IN (SELECT customer_id FROM requests WHERE id = request_id)
  );

-- Conversations policies
CREATE POLICY "Participants can view conversations"
  ON conversations FOR SELECT USING (
    auth.uid() = customer_id OR auth.uid() = provider_id
  );
CREATE POLICY "Participants can create conversations"
  ON conversations FOR INSERT WITH CHECK (
    auth.uid() = customer_id OR auth.uid() = provider_id
  );

-- Messages policies
CREATE POLICY "Conversation participants can view messages"
  ON messages FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE customer_id = auth.uid() OR provider_id = auth.uid()
    )
  );
CREATE POLICY "Conversation participants can send messages"
  ON messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    conversation_id IN (
      SELECT id FROM conversations
      WHERE customer_id = auth.uid() OR provider_id = auth.uid()
    )
  );

-- Seed categories
INSERT INTO categories (name, slug, icon, sort_order) VALUES
  ('Ремонт и строительство', 'repair', 'hammer', 1),
  ('IT и разработка', 'it', 'code', 2),
  ('Дизайн', 'design', 'palette', 3),
  ('Образование', 'education', 'book', 4),
  ('Красота и здоровье', 'beauty', 'heart', 5),
  ('Транспорт и доставка', 'transport', 'truck', 6),
  ('Фото и видео', 'photo', 'camera', 7),
  ('Юридические услуги', 'legal', 'scale', 8),
  ('Другое', 'other', 'more', 99);

-- Enable Realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
