import type { Locale } from "@/lib/i18n";

export type PrivacySection = {
  title: string;
  lead?: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
};

export const PRIVACY_SECTIONS_RU = [
  {
    title: "intro",
    paragraphs: [
      "Настоящая Политика конфиденциальности описывает, каким образом платформа LOOK собирает, использует, хранит, передаёт и защищает персональные данные пользователей мобильного приложения, веб-сайта и иных сервисов LOOK.",
      "Используя LOOK и предоставляя свои персональные данные, Пользователь подтверждает, что ознакомился с настоящей Политикой конфиденциальности.",
      "Если Пользователь не согласен с условиями настоящей Политики, он не должен передавать LOOK свои персональные данные или продолжать регистрацию.",
    ],
  },
  {
    title: "1. Кто обрабатывает персональные данные",
    paragraphs: [
      "Оператором персональных данных является юридическое лицо LOOK. Реквизиты оператора (полное наименование, регистрационный номер, юридический адрес) будут указаны до production-релиза и не подставляются фиктивными данными на этапе staging.",
      "Контактный email по вопросам конфиденциальности и поддержки будет указан до production-релиза.",
    ],
  },
  {
    title: "2. На кого распространяется Политика",
    items: [
      "зарегистрированных заказчиков;",
      "зарегистрированных исполнителей;",
      "пользователей, совмещающих несколько ролей;",
      "посетителей сайта или приложения LOOK;",
      "пользователей, обращающихся в службу поддержки;",
      "пользователей, участвующих в заказах, платежах, спорах или иных операциях Платформы.",
    ],
  },
  {
    title: "3. Какие данные может собирать LOOK",
    lead: "LOOK собирает только те персональные данные, которые необходимы для работы Платформы, выполнения пользовательских запросов, обеспечения безопасности и исполнения юридических обязательств.",
  },
  {
    title: "3.1. Регистрационные данные",
    items: [
      "имя / отображаемое имя;",
      "адрес электронной почты;",
      "номер телефона (если указан; SMS OTP-подтверждение может быть ещё не реализовано);",
      "страна и город (если указаны);",
      "пароль в защищённой форме (хешируется Supabase Auth; LOOK не хранит пароль в открытом виде) или данные Passkey / WebAuthn;",
      "выбранная роль пользователя;",
      "идентификатор аккаунта;",
      "дата регистрации;",
      "факт и версия принятия Пользовательского соглашения, Политики конфиденциальности и подтверждения ознакомления с лицензиями;",
      "подтверждение возраста 18+ (adult_confirmed_at).",
    ],
  },
  {
    title: "4. Данные профиля",
    lead: "Пользователь может добровольно предоставить:",
    items: [
      "фотографию профиля;",
      "описание о себе;",
      "специализацию, навыки, портфолио;",
      "сведения об услугах, ценах, месте оказания услуг;",
      "иные сведения профиля, которые Пользователь добавляет самостоятельно.",
    ],
  },
  {
    title: "5. Данные заказов и сделок",
    lead: "При использовании LOOK могут обрабатываться:",
    items: [
      "описание и категория заказа;",
      "стоимость и предложения исполнителей;",
      "статус заказа и история изменений;",
      "файлы и ссылки, связанные с заказом;",
      "сведения о завершении, отмене, претензиях и спорах;",
      "отзывы и оценки.",
    ],
  },
  {
    title: "6. Платёжные данные",
    paragraphs: [
      "При использовании платёжных функций LOOK может обрабатывать сумму заказа и платежа, комиссию платформы, валюту, дату и статус операции, идентификаторы транзакций (в том числе Stripe Checkout Session / PaymentIntent), сведения о возвратах и выплатах.",
      "Если оплата производится через стороннего платёжного провайдера (в LOOK при подключении — Stripe), данные банковской карты обрабатываются таким провайдером. LOOK не хранит полный номер банковской карты, CVV/CVC и иные чувствительные платёжные реквизиты.",
      "Конкретное наименование платёжного провайдера и режим работы (тест / production) отражаются в настройках Платформы после подключения.",
    ],
  },
  {
    title: "7. Переписка и коммуникации",
    lead: "LOOK может хранить и обрабатывать сообщения между заказчиками и исполнителями, вложения в виде ссылок/метаданных, обращения в поддержку, жалобы и историю коммуникаций, необходимую для разрешения споров и обеспечения безопасности.",
  },
  {
    title: "8. Технические данные",
    lead: "При использовании приложения или сайта могут автоматически собираться:",
    items: [
      "IP-адрес (в журналах сессий и событий безопасности);",
      "User-Agent / сведения об устройстве и браузере;",
      "дата и время входа, данные сессии;",
      "идентификаторы посетителя и сессии приложения (cookies / local storage);",
      "журналы ошибок и технические журналы;",
      "сведения о посещениях и активности (включая presence / online heartbeat).",
    ],
  },
  {
    title: "9. Данные о местоположении",
    lead: "LOOK в текущей версии не запрашивает точную GPS-геолокацию устройства. Пользователь может указать город, страну или текстовое место оказания услуг вручную. Если в будущем будет добавлен доступ к геолокации, LOOK запросит разрешение устройства.",
  },
  {
    title: "10. Фото, камера, микрофон и файлы",
    paragraphs: [
      "Приложение может получать доступ к файлам устройства (выбор изображения) для загрузки аватара и портфолио в хранилище LOOK.",
      "Микрофон может использоваться только для отдельных административных функций (голосовая навигация), если пользователь инициирует их и система запрашивает разрешение.",
      "Прямой доступ к камере/видеопотоку в текущей версии не реализован. Вложения в чатах передаются как ссылки, а не как произвольная загрузка бинарных файлов с устройства без согласия пользователя.",
    ],
  },
  {
    title: "11. Для чего LOOK использует персональные данные",
    items: [
      "регистрация и авторизация;",
      "создание и ведение профиля;",
      "поиск заказчиков и исполнителей;",
      "создание и выполнение заказов;",
      "платежи и комиссия платформы;",
      "общение между пользователями;",
      "рейтинги, отзывы, жалобы и споры;",
      "предотвращение мошенничества и защита пользователей;",
      "техническая поддержка и сервисные уведомления;",
      "анализ работы приложения, исправление ошибок и улучшение функций;",
      "соблюдение законодательства и защита прав LOOK и пользователей.",
    ],
  },
  {
    title: "12. Правовые основания обработки",
    paragraphs: [
      "В зависимости от страны Пользователя LOOK может опираться на: необходимость исполнения договора; действия до заключения договора; выполнение юридической обязанности; законный интерес LOOK; защиту прав и безопасности Платформы; согласие Пользователя — когда оно требуется законом.",
      "Если обработка основана на согласии, Пользователь вправе отозвать его в предусмотренном законом порядке.",
    ],
  },
  {
    title: "13. Сервисные сообщения",
    lead: "LOOK может отправлять сообщения, необходимые для работы аккаунта: подтверждение регистрации, уведомления о заказах и платежах, сообщения о безопасности и важные изменения условий. Такие сообщения могут быть необходимой частью сервиса.",
  },
  {
    title: "14. Маркетинговые сообщения",
    lead: "Рекламные и маркетинговые сообщения отправляются только в случаях, разрешённых законом. Согласие на маркетинг не объединяется с обязательным принятием Политики конфиденциальности. Пользователь может отказаться от маркетинговых сообщений в настройках уведомлений (если функция включена).",
  },
  {
    title: "15. Передача данных другим пользователям",
    lead: "Для работы маркетплейса другим пользователям могут быть видны имя, фото, описание, специализация, рейтинг, отзывы, портфолио и иные сведения, которые Пользователь сделал публичными, а также сведения, необходимые для конкретной сделки. LOOK не публикует данные, не нужные для работы сервиса.",
  },
  {
    title: "16. Передача данных поставщикам услуг",
    paragraphs: [
      "LOOK может привлекать сторонние компании: облачный хостинг и базы данных (Supabase), платёжные системы (Stripe при подключении), сервисы электронной почты, уведомлений, мониторинга и безопасности, а также инфраструктуру хостинга приложения.",
      "Поставщикам передаются только данные, необходимые для соответствующей услуги. Перечень фактических поставщиков будет дополнен до production при необходимости по закону.",
    ],
  },
  {
    title: "17. Передача данных государственным органам",
    lead: "LOOK может раскрывать персональные данные по законному запросу суда или уполномоченных органов, для соблюдения закона, предотвращения преступления, защиты жизни и безопасности людей, а также для защиты законных прав LOOK — только в объёме, предусмотренном законодательством.",
  },
  {
    title: "18. Международная передача данных",
    lead: "Инфраструктура LOOK или сторонние поставщики могут находиться в разных странах. После определения страны регистрации компании и инфраструктуры этот раздел будет окончательно адаптирован. При международной передаче LOOK использует предусмотренные законом механизмы защиты.",
  },
  {
    title: "19. Срок хранения данных",
    paragraphs: [
      "LOOK хранит персональные данные не дольше, чем необходимо для целей сбора, если более длительный срок не требуется законом.",
      "Ориентиры: данные активного аккаунта — пока существует аккаунт; заказы и платежи — в сроки бухгалтерского/налогового учёта; споры — до завершения и разумный срок после; технические журналы — для безопасности и диагностики; данные удалённого аккаунта — удаляются или обезличиваются, кроме сведений, которые LOOK обязан сохранять по закону.",
      "Конкретные сроки по категориям будут зафиксированы до production-релиза.",
    ],
  },
  {
    title: "20. Удаление аккаунта",
    lead: "Пользователь вправе запросить удаление аккаунта через службу поддержки или предусмотренную функцию. При удалении LOOK удаляет или обезличивает данные, если дальнейшее хранение не требуется для соблюдения закона, финансовых обязательств, предотвращения мошенничества, споров или защиты прав.",
  },
  {
    title: "21. Права Пользователя",
    lead: "В зависимости от применимого законодательства Пользователь может иметь право узнать, какие данные обрабатываются; получить копию; исправить или дополнить данные; потребовать удаления или ограничения обработки; возразить против обработки; получить данные в переносимом формате; отозвать согласие; отказаться от маркетинга; подать жалобу в компетентный орган. Для реализации прав обращайтесь по контактам оператора (будут указаны до production).",
  },
  {
    title: "22. Автоматизированные решения",
    lead: "До внедрения автоматизированного принятия решений или профилирования с существенным влиянием на Пользователя LOOK не заявляет об использовании таких функций. При появлении они будут отдельно раскрыты в Политике.",
  },
  {
    title: "23. Безопасность персональных данных",
    lead: "LOOK применяет разумные технические и организационные меры: контроль доступа, RLS, защищённая авторизация, шифрование соединения, безопасное хранение паролей, журналирование событий безопасности. Абсолютная безопасность не гарантируется.",
  },
  {
    title: "24. Утечки и инциденты безопасности",
    lead: "При серьёзном инциденте LOOK принимает меры по ограничению последствий, устанавливает причины, восстанавливает безопасность и выполняет требования закона об уведомлении органов и, при необходимости, Пользователей.",
  },
  {
    title: "25. Данные несовершеннолетних",
    lead: "LOOK предназначен только для лиц 18+. LOOK не предназначен для сбора данных несовершеннолетних. При обнаружении аккаунта или данных несовершеннолетнего LOOK ограничивает доступ и удаляет/ограничивает данные с учётом применимого закона.",
  },
  {
    title: "26. Cookies и аналогичные технологии",
    lead: "В веб-версии LOOK могут использоваться cookies, local storage и session storage для авторизации, настроек, безопасности, технической работы и аналитики посещений. Если закон требует согласия на необязательные cookies, оно будет запрашиваться отдельно.",
  },
  {
    title: "27. Аналитика",
    lead: "LOOK использует собственные механизмы учёта посещений и активности (visitor/session identifiers, presence) для статистики и улучшения продукта. Сторонние аналитические SDK (например Vercel Analytics, Sentry) в текущей сборке не подключены; при подключении Политика будет обновлена.",
  },
  {
    title: "28. Сторонние ссылки и сервисы",
    lead: "LOOK может содержать ссылки на сторонние сайты или сервисы. LOOK не контролирует их политики конфиденциальности. Пользователь должен ознакомиться с ними самостоятельно.",
  },
  {
    title: "29. Изменения Политики конфиденциальности",
    lead: "LOOK вправе обновлять Политику. При существенных изменениях Пользователь уведомляется через приложение, email или иным способом, предусмотренным законом. Дата последнего обновления указывается в начале документа. Если закон требует нового согласия, LOOK запросит его повторно.",
  },
  {
    title: "30. Контакты",
    lead: "По вопросам персональных данных обращайтесь в LOOK Privacy. Реквизиты оператора и email будут указаны до production-релиза и не заполняются фиктивными значениями на staging.",
  },
  {
    title: "31. Подтверждение ознакомления",
    lead: "При регистрации Пользователь должен иметь возможность открыть и прочитать настоящую Политику, Пользовательское соглашение и раздел используемых лицензий. Текст обязательного подтверждения: «Я подтверждаю, что мне исполнилось 18 лет, я прочитал(а) и принимаю Пользовательское соглашение LOOK, ознакомился(ась) с Политикой конфиденциальности LOOK и информацией об используемых лицензиях». Это подтверждение не означает согласие на маркетинговую рассылку.",
  },
  {
    title: "32. Возраст и adult_confirmed_at",
    paragraphs: [
      "LOOK предназначен только для лиц 18+. При регистрации LOOK сохраняет факт подтверждения совершеннолетия (adult_confirmed_at) вместе с версиями юридических документов.",
      "Дата рождения не запрашивается без необходимости, пока продукт не использует DOB. Полноценная age/KYC verification может быть внедрена отдельно.",
    ],
  },
  {
    title: "33. Фактические cookies и storage LOOK",
    lead: "В текущей реализации LOOK использует, в частности:",
    items: [
      "cookies сессии Supabase Auth;",
      "cookie look_locale (язык);",
      "cookie look_visitor (аналитика посещений);",
      "localStorage: look_locale, look_visitor_id, look_session_id, look_presence_tabs, look_ui_mode, look_recent_login_emails; cookie look_last_login_email (email only, after successful login);",
      "sessionStorage: look_register_legal_consent (временное согласие до завершения регистрации).",
    ],
  },
  {
    title: "34. Что LOOK пока НЕ собирает",
    items: [
      "точную GPS-геолокацию устройства;",
      "живой видеопоток камеры;",
      "полный PAN банковской карты и CVV/CVC;",
      "данные сторонних маркетинговых SDK (не подключены);",
      "SMS OTP подтверждение телефона (пока не реализовано — номер может храниться как контактные данные).",
    ],
  },
] as const;

export const PRIVACY_SECTIONS_EN = [
  {
    title: "intro",
    paragraphs: [
      "This Privacy Policy describes how the LOOK platform collects, uses, stores, transfers and protects personal data of users of the LOOK mobile app, website and other services.",
      "By using LOOK and providing personal data, the User confirms that they have read this Privacy Policy.",
      "If the User does not agree with this Policy, they must not provide personal data to LOOK or continue registration.",
    ],
  },
  {
    title: "1. Who processes personal data",
    paragraphs: [
      "The data controller is the LOOK legal entity. Operator details (full legal name, registration number, registered address) will be filled in before the production release and are not replaced with fictional values on staging.",
      "Privacy and support contact emails will be published before the production release.",
    ],
  },
  {
    title: "2. Who this Policy covers",
    items: [
      "registered customers;",
      "registered providers;",
      "users with multiple roles;",
      "visitors of the LOOK website or app;",
      "users contacting support;",
      "users taking part in orders, payments, disputes or other Platform operations.",
    ],
  },
  {
    title: "3. What data LOOK may collect",
    lead: "LOOK collects only personal data needed to operate the Platform, fulfil user requests, ensure security and meet legal obligations.",
  },
  {
    title: "3.1. Registration data",
    items: [
      "name / display name;",
      "email address;",
      "phone number (if provided; SMS OTP verification may not yet be implemented);",
      "country and city (if provided);",
      "password in protected form (hashed by Supabase Auth; LOOK does not store plaintext passwords) or Passkey / WebAuthn data;",
      "selected user role;",
      "account identifier;",
      "registration date;",
      "acceptance timestamp and version of the Terms of Service, Privacy Policy and licenses acknowledgement;",
      "adult confirmation (adult_confirmed_at).",
    ],
  },
  {
    title: "4. Profile data",
    lead: "Users may voluntarily provide:",
    items: [
      "profile photo;",
      "bio;",
      "specialization, skills, portfolio;",
      "service details, prices, service location;",
      "other profile information added by the User.",
    ],
  },
  {
    title: "5. Order and deal data",
    lead: "When using LOOK we may process:",
    items: [
      "order description and category;",
      "price and provider offers;",
      "order status and change history;",
      "files and links related to the order;",
      "completion, cancellation, claims and disputes;",
      "reviews and ratings.",
    ],
  },
  {
    title: "6. Payment data",
    paragraphs: [
      "When payment features are used, LOOK may process order and payment amounts, platform commission, currency, date and status, transaction identifiers (including Stripe Checkout Session / PaymentIntent IDs), refunds and payouts.",
      "If payment is processed by a third-party provider (Stripe when configured), card data is handled by that provider. LOOK does not store full card numbers, CVV/CVC or other sensitive card credentials.",
      "The actual payment provider name and mode (test / production) are reflected in Platform configuration after connection.",
    ],
  },
  {
    title: "7. Messaging and communications",
    lead: "LOOK may store and process messages between customers and providers, attachment link metadata, support requests, complaints and communication history needed for disputes and security.",
  },
  {
    title: "8. Technical data",
    lead: "When using the app or website we may automatically collect:",
    items: [
      "IP address (in session and security event logs);",
      "User-Agent / device and browser information;",
      "sign-in time and session data;",
      "visitor and app session identifiers (cookies / local storage);",
      "error and technical logs;",
      "visit and activity data (including presence / online heartbeat).",
    ],
  },
  {
    title: "9. Location data",
    lead: "The current LOOK version does not request precise device GPS. Users may enter city, country or a text service location manually. If precise geolocation is added later, LOOK will request device permission.",
  },
  {
    title: "10. Photos, camera, microphone and files",
    paragraphs: [
      "The app may access device files (image picker) to upload avatars and portfolio images to LOOK storage.",
      "The microphone may be used only for certain admin features (voice navigation) when initiated by the user and permitted by the system.",
      "Live camera/video capture is not implemented in the current version. Chat attachments are link-based metadata rather than unrestricted binary uploads without user action.",
    ],
  },
  {
    title: "11. Why LOOK uses personal data",
    items: [
      "registration and authentication;",
      "creating and maintaining profiles;",
      "matching customers and providers;",
      "creating and fulfilling orders;",
      "payments and platform commission;",
      "user messaging;",
      "ratings, reviews, complaints and disputes;",
      "fraud prevention and user protection;",
      "support and service notifications;",
      "product analytics, bug fixing and improvements;",
      "legal compliance and protecting LOOK and user rights.",
    ],
  },
  {
    title: "12. Legal bases",
    paragraphs: [
      "Depending on the User's country, LOOK may rely on: contract performance; pre-contractual steps; legal obligation; legitimate interests; protection of rights and Platform security; User consent where required by law.",
      "Where processing is based on consent, the User may withdraw it as provided by law.",
    ],
  },
  {
    title: "13. Service messages",
    lead: "LOOK may send messages required for the account: registration confirmation, order and payment notices, security alerts and material terms changes. Such messages may be necessary to provide the service.",
  },
  {
    title: "14. Marketing messages",
    lead: "Marketing messages are sent only where allowed by law. Marketing consent is not bundled with mandatory Privacy Policy acceptance. Users may opt out of marketing in notification settings (when enabled).",
  },
  {
    title: "15. Sharing with other users",
    lead: "For marketplace operation, other users may see name, photo, bio, specialization, rating, reviews, portfolio and other information the User made public, plus details needed for a specific deal. LOOK does not publicly disclose data that is not needed for the service.",
  },
  {
    title: "16. Sharing with service providers",
    paragraphs: [
      "LOOK may use third parties: cloud hosting and databases (Supabase), payment processors (Stripe when configured), email/notification providers, monitoring and security vendors, and application hosting infrastructure.",
      "Providers receive only data needed for their service. The list of actual providers will be completed before production where required by law.",
    ],
  },
  {
    title: "17. Sharing with authorities",
    lead: "LOOK may disclose personal data pursuant to lawful court or authority requests, to comply with law, prevent crime, protect life and safety, or protect LOOK's legitimate rights — only to the extent required by law.",
  },
  {
    title: "18. International transfers",
    lead: "LOOK infrastructure or vendors may be located in different countries. After the company registration country and infrastructure are finalized, this section will be updated. LOOK will use legally required transfer safeguards.",
  },
  {
    title: "19. Retention",
    paragraphs: [
      "LOOK retains personal data no longer than needed for the purposes collected, unless a longer period is required by law.",
      "Guidance: active account data — while the account exists; orders and payments — accounting/tax periods; disputes — until resolved plus a reasonable period; technical logs — for security and diagnostics; deleted-account data — erased or anonymized except where LOOK must retain it by law.",
      "Specific retention periods by category will be fixed before production.",
    ],
  },
  {
    title: "20. Account deletion",
    lead: "Users may request account deletion via support or an in-app function when available. Upon deletion LOOK erases or anonymizes data unless retention is required for legal compliance, financial obligations, fraud prevention, disputes or rights protection.",
  },
  {
    title: "21. User rights",
    lead: "Depending on applicable law, Users may have rights to know what data is processed; obtain a copy; correct or complete data; request erasure or restriction; object to processing; receive data in a portable format; withdraw consent; opt out of marketing; lodge a complaint with a supervisory authority. Contact the operator using details published before production.",
  },
  {
    title: "22. Automated decisions",
    lead: "Until LOOK introduces automated decision-making or profiling with significant effects on Users, LOOK does not claim to use such features. If introduced, they will be disclosed separately in this Policy.",
  },
  {
    title: "23. Security",
    lead: "LOOK applies reasonable technical and organizational measures: access control, RLS, secure authentication, encrypted transport, protected password storage and security event logging. Absolute security cannot be guaranteed.",
  },
  {
    title: "24. Security incidents",
    lead: "In a serious incident LOOK will contain impact, investigate causes, restore security and meet legal notification duties to authorities and, where required, affected Users.",
  },
  {
    title: "25. Children's data",
    lead: "LOOK is for persons aged 18+ only and is not intended to collect minors' data. If a minor account or data is discovered, LOOK restricts access and deletes/limits data as required by applicable law.",
  },
  {
    title: "26. Cookies and similar technologies",
    lead: "The LOOK web app may use cookies, local storage and session storage for authentication, preferences, security, technical operation and visit analytics. If law requires consent for non-essential cookies, it will be requested separately.",
  },
  {
    title: "27. Analytics",
    lead: "LOOK uses first-party visit and activity tracking (visitor/session identifiers, presence) for statistics and product improvement. Third-party analytics SDKs (e.g. Vercel Analytics, Sentry) are not in the current build; this Policy will be updated if they are added.",
  },
  {
    title: "28. Third-party links",
    lead: "LOOK may contain links to third-party sites or services. LOOK does not control their privacy practices. Users should review those policies themselves.",
  },
  {
    title: "29. Policy changes",
    lead: "LOOK may update this Policy. Material changes will be communicated via the app, email or another legally required method. The last-updated date appears at the top. If law requires fresh consent, LOOK will request it again.",
  },
  {
    title: "30. Contact",
    lead: "For personal data questions contact LOOK Privacy. Operator details and email will be published before production and are not filled with fictional values on staging.",
  },
  {
    title: "31. Acknowledgement",
    lead: "At registration the User must be able to open and read this Policy, the Terms of Service and the licenses notice. Mandatory acknowledgement text: \"I confirm that I am at least 18 years old, I have read and accept the LOOK Terms of Service, and I have reviewed the LOOK Privacy Policy and the third-party licenses information\". This acknowledgement is not marketing consent.",
  },
  {
    title: "32. Age and adult_confirmed_at",
    paragraphs: [
      "LOOK is for persons aged 18+ only. At registration LOOK stores adult confirmation (adult_confirmed_at) together with legal document versions.",
      "Date of birth is not requested unless the product needs DOB. Full age/KYC verification may be added separately later.",
    ],
  },
  {
    title: "33. Actual LOOK cookies and storage",
    lead: "In the current implementation LOOK uses, among others:",
    items: [
      "Supabase Auth session cookies;",
      "look_locale cookie (language);",
      "look_visitor cookie (visit analytics);",
      "localStorage: look_locale, look_visitor_id, look_session_id, look_presence_tabs, look_ui_mode, look_recent_login_emails; cookie look_last_login_email (email only, after successful login);",
      "sessionStorage: look_register_legal_consent (temporary consent until registration completes).",
    ],
  },
  {
    title: "34. What LOOK does NOT currently collect",
    items: [
      "precise device GPS;",
      "live camera video stream;",
      "full card PAN and CVV/CVC;",
      "third-party marketing SDK data (not connected);",
      "SMS OTP phone verification (not yet implemented — phone may be stored as contact data only).",
    ],
  },
] as const;

export function getPrivacySections(locale: Locale): readonly PrivacySection[] {
  return locale === "en" ? PRIVACY_SECTIONS_EN : PRIVACY_SECTIONS_RU;
}
