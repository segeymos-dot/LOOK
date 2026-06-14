import type {
  Category,
  Conversation,
  Message,
  Offer,
  Profile,
  Request,
} from "@/types";

const now = new Date();
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 86400000).toISOString();

export const mockProfiles: Profile[] = [
  {
    id: "user-1",
    full_name: "Анна Петрова",
    avatar_url: null,
    bio: "Ищу надёжных исполнителей для домашних задач",
    role: "customer",
    city: "Москва",
    country: "Россия",
    rating: 4.8,
    reviews_count: 12,
    created_at: daysAgo(30),
    updated_at: daysAgo(1),
  },
  {
    id: "user-2",
    full_name: "Дмитрий Козлов",
    avatar_url: null,
    bio: "Мастер по ремонту с 10-летним опытом",
    role: "provider",
    city: "Москва",
    country: "Россия",
    rating: 4.9,
    reviews_count: 47,
    created_at: daysAgo(60),
    updated_at: daysAgo(2),
  },
  {
    id: "user-3",
    full_name: "Елена Смирнова",
    avatar_url: null,
    bio: "UI/UX дизайнер, работаю удалённо",
    role: "provider",
    city: "Санкт-Петербург",
    country: "Россия",
    rating: 5.0,
    reviews_count: 23,
    created_at: daysAgo(45),
    updated_at: daysAgo(3),
  },
  {
    id: "user-4",
    full_name: "Иван Сидоров",
    avatar_url: null,
    bio: null,
    role: "customer",
    city: "Казань",
    country: "Россия",
    rating: 0,
    reviews_count: 0,
    created_at: daysAgo(5),
    updated_at: daysAgo(5),
  },
];

export const mockCategories: Category[] = [
  { id: "cat-1", name: "Ремонт и строительство", slug: "repair", icon: "hammer", sort_order: 1, created_at: daysAgo(90) },
  { id: "cat-2", name: "IT и разработка", slug: "it", icon: "code", sort_order: 2, created_at: daysAgo(90) },
  { id: "cat-3", name: "Дизайн", slug: "design", icon: "palette", sort_order: 3, created_at: daysAgo(90) },
  { id: "cat-4", name: "Образование", slug: "education", icon: "book", sort_order: 4, created_at: daysAgo(90) },
  { id: "cat-5", name: "Красота и здоровье", slug: "beauty", icon: "heart", sort_order: 5, created_at: daysAgo(90) },
  { id: "cat-6", name: "Транспорт и доставка", slug: "transport", icon: "truck", sort_order: 6, created_at: daysAgo(90) },
  { id: "cat-7", name: "Фото и видео", slug: "photo", icon: "camera", sort_order: 7, created_at: daysAgo(90) },
  { id: "cat-8", name: "Юридические услуги", slug: "legal", icon: "scale", sort_order: 8, created_at: daysAgo(90) },
];

export const mockRequests: Request[] = [
  {
    id: "req-1",
    customer_id: "user-1",
    category_id: "cat-1",
    title: "Ремонт кухни 12 м²",
    description: "Нужно заменить плитку, установить новую столешницу и повесить шкафы. Материалы уже куплены.",
    budget_min: 50000,
    budget_max: 80000,
    currency: "RUB",
    location: "Москва, м. Тверская",
    status: "open",
    deadline: null,
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
    customer: mockProfiles[0],
    category: mockCategories[0],
    offers_count: 3,
  },
  {
    id: "req-2",
    customer_id: "user-4",
    category_id: "cat-3",
    title: "Дизайн лендинга для стартапа",
    description: "Ищу дизайнера для одностраничного сайта SaaS-продукта. Нужен современный минималистичный стиль, мобильная версия обязательна.",
    budget_min: 30000,
    budget_max: 60000,
    currency: "RUB",
    location: "Удалённо",
    status: "open",
    deadline: null,
    created_at: daysAgo(2),
    updated_at: daysAgo(2),
    customer: mockProfiles[3],
    category: mockCategories[2],
    offers_count: 5,
  },
  {
    id: "req-3",
    customer_id: "user-1",
    category_id: "cat-2",
    title: "Разработка Telegram-бота",
    description: "Нужен бот для записи клиентов в салон красоты: выбор мастера, услуги, напоминания.",
    budget_min: 20000,
    budget_max: 40000,
    currency: "RUB",
    location: "Удалённо",
    status: "open",
    deadline: null,
    created_at: daysAgo(3),
    updated_at: daysAgo(3),
    customer: mockProfiles[0],
    category: mockCategories[1],
    offers_count: 2,
  },
  {
    id: "req-4",
    customer_id: "user-4",
    category_id: "cat-7",
    title: "Фотосессия для каталога одежды",
    description: "30 позиций, нужен фотограф с опытом предметной съёмки. Студия предоставляется.",
    budget_min: 15000,
    budget_max: 25000,
    currency: "RUB",
    location: "Казань",
    status: "open",
    deadline: null,
    created_at: daysAgo(5),
    updated_at: daysAgo(5),
    customer: mockProfiles[3],
    category: mockCategories[6],
    offers_count: 1,
  },
];

export const mockOffers: Offer[] = [
  {
    id: "offer-1",
    request_id: "req-1",
    provider_id: "user-2",
    price: 72000,
    currency: "RUB",
    message: "Здравствуйте! Занимаюсь ремонтом кухонь более 10 лет. Могу начать на следующей неделе, срок — 5–7 дней.",
    estimated_days: 7,
    status: "pending",
    created_at: daysAgo(0),
    updated_at: daysAgo(0),
    provider: mockProfiles[1],
  },
  {
    id: "offer-2",
    request_id: "req-2",
    provider_id: "user-3",
    price: 45000,
    currency: "RUB",
    message: "Готова сделать дизайн в Figma с прототипом. Портфолио — behance.net/elena-smirnova. Срок — 10 дней.",
    estimated_days: 10,
    status: "pending",
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
    provider: mockProfiles[2],
  },
];

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    request_id: "req-1",
    customer_id: "user-1",
    provider_id: "user-2",
    offer_id: "offer-1",
    last_message_at: daysAgo(0),
    created_at: daysAgo(0),
    customer: mockProfiles[0],
    provider: mockProfiles[1],
    request: mockRequests[0],
    last_message: {
      id: "msg-3",
      conversation_id: "conv-1",
      sender_id: "user-2",
      content: "Могу приехать на замер в субботу, удобно?",
      read_at: null,
      created_at: daysAgo(0),
    },
    unread_count: 1,
  },
];

export const mockMessages: Message[] = [
  {
    id: "msg-1",
    conversation_id: "conv-1",
    sender_id: "user-2",
    content: "Здравствуйте! Посмотрел ваш запрос, готов взяться за работу.",
    read_at: daysAgo(0),
    created_at: daysAgo(0),
    sender: mockProfiles[1],
  },
  {
    id: "msg-2",
    conversation_id: "conv-1",
    sender_id: "user-1",
    content: "Отлично! Когда сможете приехать на замер?",
    read_at: daysAgo(0),
    created_at: daysAgo(0),
    sender: mockProfiles[0],
  },
  {
    id: "msg-3",
    conversation_id: "conv-1",
    sender_id: "user-2",
    content: "Могу приехать на замер в субботу, удобно?",
    read_at: null,
    created_at: daysAgo(0),
    sender: mockProfiles[1],
  },
];

export const mockCurrentUser = mockProfiles[0];

export function getMockRequest(id: string): Request | undefined {
  return mockRequests.find((r) => r.id === id);
}

export function getMockOffers(requestId: string): Offer[] {
  return mockOffers.filter((o) => o.request_id === requestId);
}

export function getMockOffer(offerId: string): Offer | undefined {
  return mockOffers.find((o) => o.id === offerId);
}

export function getMockConversation(id: string): Conversation | undefined {
  return mockConversations.find((c) => c.id === id);
}

export function getMockConversationForOffer(offerId: string): Conversation | undefined {
  return mockConversations.find((c) => c.offer_id === offerId);
}

export function getMockMessages(conversationId: string): Message[] {
  return mockMessages.filter((m) => m.conversation_id === conversationId);
}

export function searchMockRequests(query: string, categorySlug?: string | null): Request[] {
  let results = mockRequests.filter((r) => r.status === "open");

  if (categorySlug) {
    const cat = mockCategories.find((c) => c.slug === categorySlug);
    if (cat) results = results.filter((r) => r.category_id === cat.id);
  }

  if (query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }

  return results;
}
