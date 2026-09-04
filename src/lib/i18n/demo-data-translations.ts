/** Bilingual labels for seeded / demo application data (categories, orders, locations). */

export type Bilingual = { ru: string; en: string };

export const CATEGORY_LABELS: Record<string, Bilingual> = {
  repair: { ru: "Дом и быт", en: "Home & Household" },
  it: { ru: "IT и разработка", en: "IT & Software Development" },
  design: { ru: "Дизайн", en: "Design" },
  education: { ru: "Образование", en: "Education" },
  beauty: { ru: "Красота и здоровье", en: "Beauty & Wellness" },
  transport: { ru: "Транспорт и доставка", en: "Transport & Delivery" },
  photo: { ru: "Фото и видео", en: "Photo & Video" },
  legal: { ru: "Юридические услуги", en: "Legal Services" },
  other: { ru: "Другое", en: "Other" },
};

/** Compact Home grid line breaks (same labels as CATEGORY_LABELS). */
export const CATEGORY_LABEL_LINES: Record<string, { ru: string[]; en: string[] }> = {
  repair: {
    ru: ["Дом и", "быт"],
    en: ["Home &", "Household"],
  },
  it: {
    ru: ["IT и", "разработка"],
    en: ["IT & Software", "Development"],
  },
  design: { ru: ["Дизайн"], en: ["Design"] },
  education: { ru: ["Образование"], en: ["Education"] },
  beauty: {
    ru: ["Красота и", "здоровье"],
    en: ["Beauty &", "Wellness"],
  },
  transport: {
    ru: ["Транспорт и", "доставка"],
    en: ["Transport &", "Delivery"],
  },
  photo: {
    ru: ["Фото и", "видео"],
    en: ["Photo &", "Video"],
  },
  legal: {
    ru: ["Юридические", "услуги"],
    en: ["Legal", "Services"],
  },
  other: { ru: ["Другое"], en: ["Other"] },
};

/** Exact-match strings stored in the demo / test database. */
export const DEMO_STRINGS: Bilingual[] = [
  // Order titles
  { ru: "тестовый заказ", en: "Test Order" },
  { ru: "тестовый запрос", en: "Test Request" },
  { ru: "Тестовый заказ — финансовый контур", en: "Test Order — Financial Flow" },
  { ru: "Ремонт кухни 12 м²", en: "Kitchen Renovation 12 m²" },
  { ru: "Дизайн лендинга для стартапа", en: "Landing Page Design for Startup" },
  { ru: "Разработка Telegram-бота", en: "Telegram Bot Development" },
  { ru: "Фотосессия для каталога одежды", en: "Catalog Photo Shoot for Clothing" },
  // Order descriptions
  { ru: "проверка создания заказа", en: "Order Creation Test" },
  { ru: "проверка работы приложения LOOK", en: "LOOK Application Test" },
  {
    ru: "Demo-заказ для проверки тестовой оплаты, комиссии LOOK 15% и баланса исполнителя.",
    en: "Demo order to verify test payment, LOOK 15% commission, and provider balance.",
  },
  {
    ru: "Нужно заменить плитку, установить новую столешницу и повесить шкафы. Материалы уже куплены.",
    en: "Need to replace tiles, install a new countertop, and hang cabinets. Materials already purchased.",
  },
  {
    ru: "Ищу дизайнера для одностраничного сайта SaaS-продукта. Нужен современный минималистичный стиль, мобильная версия обязательна.",
    en: "Looking for a designer for a one-page SaaS product site. Modern minimalist style required, mobile version mandatory.",
  },
  {
    ru: "Нужен бот для записи клиентов в салон красоты: выбор мастера, услуги, напоминания.",
    en: "Need a bot for booking clients at a beauty salon: choose stylist, services, reminders.",
  },
  {
    ru: "30 позиций, нужен фотограф с опытом предметной съёмки. Студия предоставляется.",
    en: "30 items, need a photographer with product photography experience. Studio provided.",
  },
  // Offer messages
  {
    ru: "Здравствуйте! Занимаюсь ремонтом кухонь более 10 лет. Могу начать на следующей неделе, срок — 5–7 дней.",
    en: "Hello! I have been renovating kitchens for over 10 years. Can start next week, timeline 5–7 days.",
  },
  {
    ru: "Готова сделать дизайн в Figma с прототипом. Портфолио — behance.net/elena-smirnova. Срок — 10 дней.",
    en: "Ready to create Figma design with prototype. Portfolio — behance.net/elena-smirnova. Timeline — 10 days.",
  },
  {
    ru: "Принят отклик для тестирования финансового контура LOOK.",
    en: "Offer accepted to test the LOOK financial flow.",
  },
  // Chat messages (demo)
  {
    ru: "Здравствуйте! Посмотрел ваш запрос, готов взяться за работу.",
    en: "Hello! I reviewed your request and am ready to take on the job.",
  },
  { ru: "Отлично! Когда сможете приехать на замер?", en: "Great! When can you come for measurements?" },
  { ru: "Могу приехать на замер в субботу, удобно?", en: "I can come for measurements on Saturday, does that work?" },
  // Profile bios & skills
  {
    ru: "Ищу надёжных исполнителей для домашних задач",
    en: "Looking for reliable contractors for home tasks",
  },
  {
    ru: "Мастер по ремонту с 10-летним опытом. Работаю аккуратно, с гарантией на все виды работ.",
    en: "Repair specialist with 10 years of experience. Quality work with warranty on all services.",
  },
  {
    ru: "UI/UX дизайнер, работаю удалённо. Figma, брендинг, прототипирование.",
    en: "UI/UX designer, working remotely. Figma, branding, prototyping.",
  },
  { ru: "Ремонт, электрика, сантехника", en: "Repairs, electrical, plumbing" },
  { ru: "Figma, UI/UX, брендинг", en: "Figma, UI/UX, branding" },
  {
    ru: "Тестовый исполнитель для проверки migration 010",
    en: "Test provider for migration 010 verification",
  },
  // Portfolio
  { ru: "Ремонт кухни", en: "Kitchen Renovation" },
  {
    ru: "Полная замена плитки, установка столешницы и шкафов.",
    en: "Full tile replacement, countertop and cabinet installation.",
  },
  { ru: "Ванная комната", en: "Bathroom" },
  { ru: "Сантехника, плитка, освещение.", en: "Plumbing, tiles, lighting." },
  { ru: "SaaS лендинг", en: "SaaS Landing Page" },
  { ru: "UI/UX дизайн для B2B продукта.", en: "UI/UX design for a B2B product." },
  // Reviews
  {
    ru: "Отличный исполнитель! Всё сделал качественно и в срок.",
    en: "Excellent provider! Everything done with quality and on time.",
  },
  { ru: "Работа выполнена быстро, рекомендую.", en: "Work completed quickly, highly recommend." },
  { ru: "Потрясающий дизайн, всё понравилось!", en: "Amazing design, loved everything!" },
  // Locations
  { ru: "Москва", en: "Moscow" },
  { ru: "Бангкок", en: "Bangkok" },
  { ru: "Санкт-Петербург", en: "Saint Petersburg" },
  { ru: "Казань", en: "Kazan" },
  { ru: "Россия", en: "Russia" },
  { ru: "Удалённо", en: "Remote" },
  { ru: "Москва, м. Тверская", en: "Moscow, Tverskaya metro" },
  { ru: "САМУИ", en: "Koh Samui" },
  // Demo profile names (mock only)
  { ru: "Анна Петрова", en: "Anna Petrova" },
  { ru: "Дмитрий Козлов", en: "Dmitry Kozlov" },
  { ru: "Елена Смирнова", en: "Elena Smirnova" },
  { ru: "Иван Сидоров", en: "Ivan Sidorov" },
];

/** Build lookup maps once for O(1) translation. */
const ruToEn = new Map<string, string>();
const enToRu = new Map<string, string>();

for (const { ru, en } of DEMO_STRINGS) {
  ruToEn.set(ru, en);
  enToRu.set(en, ru);
}

for (const { ru, en } of Object.values(CATEGORY_LABELS)) {
  ruToEn.set(ru, en);
  enToRu.set(en, ru);
}

export function translateDemoString(text: string | null | undefined, locale: "ru" | "en"): string {
  if (text == null) return "";
  const trimmed = text.trim();
  if (!trimmed) return text;

  if (locale === "en") {
    return ruToEn.get(trimmed) ?? text;
  }
  return enToRu.get(trimmed) ?? text;
}

/** When searching in EN, also match Russian DB values. */
export function expandSearchTerms(query: string, locale: "ru" | "en"): string[] {
  const q = query.trim();
  if (!q) return [];

  const terms = new Set<string>([q]);
  if (locale === "en") {
    for (const { ru, en } of DEMO_STRINGS) {
      if (en.toLowerCase().includes(q.toLowerCase())) terms.add(ru);
      if (ru.toLowerCase().includes(q.toLowerCase())) terms.add(ru);
    }
    for (const { ru, en } of Object.values(CATEGORY_LABELS)) {
      if (en.toLowerCase().includes(q.toLowerCase())) terms.add(ru);
    }
    const direct = ruToEn.get(q);
    if (direct) terms.add(q);
    for (const [ru, en] of ruToEn) {
      if (en.toLowerCase().includes(q.toLowerCase())) terms.add(ru);
    }
  }
  return [...terms];
}
