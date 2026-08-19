import type { Locale } from "@/lib/i18n";
import type { PrivacySection } from "@/lib/legal/privacy-content";

export type TermsSection = PrivacySection;

export const TERMS_SECTIONS_RU = [
  {
    title: "intro",
    paragraphs: [
      "Настоящее Пользовательское соглашение (далее — «Соглашение») является юридически обязательным договором между Пользователем платформы LOOK и оператором платформы LOOK (далее — «Оператор», «LOOK», «Платформа»).",
      "Реквизиты Оператора (полное юридическое наименование, регистрационный номер, юридический адрес, контактные email) указываются в блоке оператора на этой странице и будут заполнены до production-релиза. На этапе staging фиктивные данные не подставляются.",
      "Используя LOOK, регистрируясь или иным образом получая доступ к сервису, Пользователь подтверждает согласие с условиями настоящего Соглашения, Политикой конфиденциальности LOOK и информацией об используемых лицензиях.",
    ],
  },
  {
    title: "1. Принятие условий",
    paragraphs: [
      "Регистрируясь в LOOK, Пользователь подтверждает, что: прочитал настоящее Соглашение; понимает его содержание; принимает его полностью; ознакомился с Политикой конфиденциальности LOOK; ознакомился с разделом используемых лицензий; соответствует возрастным требованиям (18+); предоставляет достоверные регистрационные данные; согласен соблюдать правила поведения и безопасности LOOK.",
      "Если Пользователь не согласен с этими условиями, он не может зарегистрироваться и использовать LOOK.",
    ],
  },
  {
    title: "2. Возраст — только 18+",
    paragraphs: [
      "Использование LOOK разрешается только лицам, достигшим 18 лет. Лица младше 18 лет не могут создавать аккаунт, выступать Заказчиками или Исполнителями, заключать сделки через LOOK или использовать чужой взрослый аккаунт для обхода возрастного ограничения.",
      "При регистрации Пользователь подтверждает: «Мне исполнилось 18 лет, и я обладаю полной правоспособностью для заключения сделок». LOOK вправе запросить подтверждение возраста или личности в случаях, необходимых для безопасности, предотвращения мошенничества или выполнения закона. При выявлении аккаунта несовершеннолетнего LOOK вправе ограничить или прекратить его использование.",
    ],
  },
  {
    title: "3. Что представляет собой LOOK",
    paragraphs: [
      "LOOK — цифровая платформа (marketplace), соединяющая Заказчиков, которым необходимы работы или услуги, и Исполнителей, готовых их выполнить.",
      "LOOK предоставляет технологическую инфраструктуру для создания профилей, поиска, размещения заказов, предложения услуг, общения, выбора Исполнителя, проведения сделок, платежей, отзывов, рейтингов, разрешения споров, поддержки, административного контроля и иных функций marketplace.",
      "Если прямо не предусмотрено иное, LOOK не является работодателем Исполнителя. Исполнитель не становится сотрудником LOOK только в результате использования Платформы.",
    ],
  },
  {
    title: "4. Регистрация",
    paragraphs: [
      "Для создания аккаунта Пользователь должен предоставить необходимые регистрационные сведения. В зависимости от текущей реализации LOOK это может включать полное имя, email, номер мобильного телефона, пароль, страну, город, роль и дополнительные сведения профиля. Все сведения должны быть достоверными.",
    ],
    items: [
      "запрещается регистрироваться под чужим именем;",
      "запрещается использовать чужой телефон;",
      "запрещается создавать фиктивную личность;",
      "запрещается предоставлять заведомо ложные сведения;",
      "запрещается создавать аккаунт для мошенничества;",
      "запрещается создавать новый аккаунт для обхода блокировки.",
    ],
  },
  {
    title: "5. Подтверждённый телефон",
    paragraphs: [
      "Для полноценной регистрации и/или активации аккаунта LOOK может требовать подтверждённый мобильный номер телефона (например, через SMS/OTP), когда такая функция будет включена.",
      "В текущей версии LOOK номер телефона может указываться Пользователем как контактные данные. Техническое SMS/OTP-подтверждение может быть ещё не активировано; в интерфейсе не следует считать номер «подтверждённым», пока не появится реальное подтверждение и поле phone_verified_at (или эквивалент).",
      "Один номер телефона не должен использоваться для массового создания мошеннических аккаунтов. Конкретные правила уникальности номера определяются архитектурой и политиками безопасности LOOK.",
    ],
  },
  {
    title: "6. Платёжный метод",
    paragraphs: [
      "Поскольку LOOK является marketplace, где Заказчики оплачивают услуги, а Исполнители получают выплаты, для финансовых функций Пользователь должен иметь подходящий подтверждённый платёжный/выплатной метод, когда такие функции доступны.",
      "Для Заказчика: банковская карта либо иной поддерживаемый LOOK платёжный метод. Для Исполнителя: подходящий способ получения выплаты (карта / счёт / payout method) в зависимости от платёжного провайдера и страны.",
      "КРИТИЧЕСКИ: LOOK не хранит самостоятельно полный номер банковской карты, CVV/CVC, PIN и полный набор чувствительных реквизитов карты. Работа с картой осуществляется через сертифицированного платёжного провайдера. В LOOK хранятся только безопасные идентификаторы (например, customer ID провайдера, token/ID метода оплаты, последние 4 цифры при разрешении провайдера, тип карты, срок действия при безопасном возврате провайдером, статус верификации).",
      "Наименование платёжного провайдера указывается в блоке оператора (на staging: Stripe при подключении). Самодельное хранилище банковских карт в LOOK запрещено.",
    ],
  },
  {
    title: "7. Роли пользователя",
    paragraphs: [
      "Пользователь может быть Заказчиком, Исполнителем либо иметь обе роли, если такая возможность предусмотрена LOOK. Один реальный пользователь не должен создавать множество аккаунтов только для искусственного влияния на рейтинги, отзывы, сделки, статистику, бонусы или промоакции.",
    ],
  },
  {
    title: "8. Обязанности Заказчика",
    paragraphs: [
      "Заказчик не вправе получать результат работы обманным способом и затем необоснованно уклоняться от оплаты.",
    ],
    items: [
      "корректно описывать заказ;",
      "указывать реальные требования;",
      "предоставлять необходимую информацию;",
      "согласовывать цену и сроки;",
      "своевременно оплачивать подтверждённые сделки;",
      "не требовать выполнения незаконных действий;",
      "уважительно относиться к Исполнителю;",
      "своевременно сообщать о существенных изменениях заказа.",
    ],
  },
  {
    title: "9. Обязанности Исполнителя",
    paragraphs: [
      "Исполнитель самостоятельно отвечает за наличие профессиональных лицензий и разрешений, если деятельность регулируется государством.",
    ],
    items: [
      "предоставлять достоверные сведения о себе;",
      "честно указывать квалификацию;",
      "принимать только задания, которые способен выполнить;",
      "соблюдать согласованные сроки;",
      "обеспечивать разумное качество услуги;",
      "соблюдать законодательство;",
      "иметь необходимые лицензии, разрешения и квалификацию, если они требуются законом;",
      "соблюдать правила безопасности.",
    ],
  },
  {
    title: "10. Нулевая терпимость к дискриминации",
    paragraphs: [
      "LOOK придерживается принципа равного и уважительного отношения ко всем людям. Дискриминация запрещена.",
    ],
    items: [
      "раса, цвет кожи, национальность, национальное или этническое происхождение, гражданство, язык;",
      "религия, убеждения, пол, беременность, семейное положение, возраст;",
      "инвалидность, состояние здоровья, сексуальная ориентация, гендерная идентичность;",
      "место происхождения и иные характеристики, защищённые применимым законодательством.",
    ],
  },
  {
    title: "11. Оскорбления, травля и угрозы",
    paragraphs: [
      "Запрещаются оскорбления, унижение, травля, преследование, угрозы, шантаж, вымогательство, сексуальные домогательства, агрессивное нежелательное общение и повторные контакты после явной просьбы прекратить общение. LOOK вправе применять санкции вплоть до блокировки аккаунта.",
    ],
  },
  {
    title: "12. Защита детей",
    paragraphs: [
      "LOOK — сервис только для совершеннолетних. Категорически запрещаются сексуальная эксплуатация несовершеннолетних, материалы сексуального насилия над детьми, сексуализированные изображения детей, grooming, предложение сексуальных действий с несовершеннолетним, поиск, покупка, продажа или распространение соответствующих материалов. Такие нарушения являются основанием для немедленной блокировки и иных действий, требуемых применимым законодательством.",
    ],
  },
  {
    title: "13. Порнография и сексуальные услуги",
    paragraphs: [
      "Через LOOK запрещается размещать незаконную порнографию, предлагать проституцию, предлагать сексуальную эксплуатацию, публиковать сексуальный контент, запрещённый правилами LOOK, использовать сервис для организации сексуальной эксплуатации людей. Допустимые профессиональные услуги медицинского, образовательного или творческого характера не должны ошибочно блокироваться только из‑за терминологии — правила применяются разумно и в соответствии с законом.",
    ],
  },
  {
    title: "14. Торговля людьми и эксплуатация",
    paragraphs: [
      "Абсолютно запрещены торговля людьми, принудительный труд, сексуальная эксплуатация, рабство, удержание документов, угрозы с целью заставить человека работать и любые формы эксплуатации человека.",
    ],
  },
  {
    title: "15. Незаконные товары и услуги",
    lead: "Запрещено использовать LOOK для противоправных действий. В частности нельзя предлагать или заказывать:",
    items: [
      "незаконные наркотические вещества;",
      "незаконное оружие;",
      "поддельные документы;",
      "украденные товары;",
      "мошеннические услуги;",
      "взлом систем;",
      "кражу аккаунтов;",
      "вредоносное ПО;",
      "отмывание денег;",
      "незаконный сбор персональных данных;",
      "иные услуги, запрещённые законодательством.",
    ],
  },
  {
    title: "16. Мошенничество",
    items: [
      "получать оплату без намерения выполнять заказ;",
      "создавать фиктивные заказы;",
      "использовать украденные платёжные средства;",
      "манипулировать возвратами;",
      "создавать фиктивные отзывы;",
      "искусственно повышать рейтинг;",
      "выдавать себя за другого человека;",
      "выдавать себя за администратора LOOK;",
      "использовать фишинг;",
      "запрашивать пароль или OTP другого пользователя.",
    ],
  },
  {
    title: "17. Платежи",
    paragraphs: [
      "Платежи должны осуществляться через поддерживаемые LOOK платёжные механизмы. Платёжная архитектура определяется фактическим PSP. Наименование провайдера указано в блоке оператора и не выдумывается произвольно. До production могут применяться тестовые платежи в непроизводственных средах при явном включении.",
    ],
  },
  {
    title: "18. Комиссия LOOK",
    paragraphs: [
      "LOOK вправе взимать комиссию с операций. До проведения сделки Пользователю должна быть доступна информация о стоимости услуги, комиссии, итоговой сумме и применимой валюте. Размер комиссии определяется действующими тарифами LOOK, отображаемыми Пользователю до подтверждения соответствующей операции, и может изменяться администратором. Постоянная ставка (например, «всегда 10%») в настоящем Соглашении не фиксируется.",
    ],
  },
  {
    title: "19. Возвраты и споры",
    paragraphs: [
      "LOOK может предусматривать механизмы отмены заказа, возврата, спора и рассмотрения претензии. Конкретные правила зависят от фактической платёжной архитектуры и статусов заказа. До production рекомендуется отдельная «Политика платежей, отмен и возвратов», если marketplace принимает деньги внутри системы.",
    ],
  },
  {
    title: "20. Валюта",
    paragraphs: [
      "LOOK может поддерживать одну или несколько валют. Пользователь понимает, что банк может применять собственный валютный курс, платёжный провайдер может взимать дополнительные сборы, а налоговые обязательства зависят от страны Пользователя.",
    ],
  },
  {
    title: "21. Налоги",
    paragraphs: [
      "Пользователь самостоятельно отвечает за свои налоговые обязательства, если законодательством не предусмотрено иное. LOOK может быть обязан собирать налоговую информацию, удерживать налог или передавать сведения налоговым органам, если это требуется применимым законодательством.",
    ],
  },
  {
    title: "22. Чаты",
    paragraphs: [
      "LOOK предоставляет инструменты общения. В чатах запрещаются угрозы, спам, домогательства, незаконный контент, вредоносные файлы, мошеннические ссылки и незаконный сбор данных.",
    ],
  },
  {
    title: "23. Фото, видео и контент",
    paragraphs: [
      "Пользователь несёт ответственность за размещаемый контент и подтверждает, что обладает необходимыми правами на фотографии, видео, тексты, портфолио и документы. Запрещено нарушать авторские права, товарные знаки, право на изображение, право на частную жизнь и иные интеллектуальные права.",
    ],
  },
  {
    title: "24. Отзывы",
    paragraphs: [
      "Отзывы должны быть основаны на реальном опыте. Запрещается покупать или продавать отзывы, создавать фиктивные сделки ради рейтинга и шантажировать отзывом.",
    ],
  },
  {
    title: "25. Безопасность аккаунта",
    paragraphs: [
      "Пользователь обязан защищать пароль, OTP, passkey, устройства, email и телефон. При подозрении на взлом нужно незамедлительно обратиться в LOOK.",
    ],
  },
  {
    title: "26. Проверка личности",
    paragraphs: [
      "Для безопасности LOOK вправе внедрить подтверждение телефона, email, возраста, личности, KYC и проверку платёжного метода. Если функции ещё не реализованы, LOOK не утверждает в интерфейсе, что они уже работают.",
    ],
  },
  {
    title: "27. Блокировка аккаунта",
    paragraphs: [
      "LOOK вправе временно ограничить или прекратить доступ при мошенничестве, серьёзных нарушениях, дискриминации, угрозах, незаконной деятельности, эксплуатации детей, торговле людьми, использовании украденных платёжных данных или систематическом нарушении правил. Где возможно, Пользователю предоставляется понятная информация о причине и механизм обращения/апелляции.",
    ],
  },
  {
    title: "28. Удаление аккаунта",
    paragraphs: [
      "Пользователь должен иметь возможность запросить удаление аккаунта. Некоторые сведения могут сохраняться, если этого требуют налоговое законодательство, финансовая отчётность, предотвращение мошенничества, расследование спора или законный запрос государственных органов.",
    ],
  },
  {
    title: "29. Ответственность сторон",
    paragraphs: [
      "Заказчики и Исполнители самостоятельно отвечают за договорённости, качество услуг, законность услуг и выполнение обязательств. LOOK несёт ответственность только в пределах, предусмотренных применимым законодательством и собственными обязательствами. Настоящее Соглашение не использует чрезмерные оговорки, незаконно лишающие потребителя обязательных прав.",
    ],
  },
  {
    title: "30. Изменение условий",
    paragraphs: [
      "LOOK может обновлять документы. Для существенных изменений используется versioning (CURRENT_TERMS_VERSION). Если требуется повторное принятие, версия изменяется и legal gate запрашивает новое подтверждение.",
    ],
  },
  {
    title: "31. Применимое право",
    paragraphs: [
      "Применимое право и юрисдикция (включая место разрешения споров) будут указаны до production-релиза и не выбираются произвольно на staging. До заполнения действуют общие правила настоящего Соглашения и применимое законодательство по месту фактической деятельности Оператора, когда оно будет определено.",
    ],
  },
  {
    title: "32. Используемые лицензии",
    paragraphs: [
      "Информация о стороннем программном обеспечении и лицензиях, используемых LOOK, доступна на странице «Используемые лицензии». При регистрации Пользователь подтверждает ознакомление с этим разделом.",
    ],
  },
] as const;

export const TERMS_SECTIONS_EN = [
  {
    title: "intro",
    paragraphs: [
      "These Terms of Service (the \"Agreement\") form a legally binding contract between the User of the LOOK platform and the LOOK platform operator (\"Operator\", \"LOOK\", \"Platform\").",
      "Operator details (full legal name, registration number, registered address, contact emails) appear in the operator block on this page and will be completed before the production release. Fictional values are not used on staging.",
      "By using LOOK, registering, or otherwise accessing the service, the User agrees to this Agreement, the LOOK Privacy Policy, and the third-party licenses notice.",
    ],
  },
  {
    title: "1. Acceptance of terms",
    paragraphs: [
      "By registering with LOOK, the User confirms that they have read this Agreement; understand it; accept it in full; have reviewed the LOOK Privacy Policy; have reviewed the licenses notice; meet the age requirement (18+); provide accurate registration data; and agree to follow LOOK conduct and safety rules.",
      "If the User does not agree, they may not register or use LOOK.",
    ],
  },
  {
    title: "2. Age — 18+ only",
    paragraphs: [
      "LOOK may only be used by persons aged 18 or older. Persons under 18 may not create an account, act as Customers or Providers, enter into deals through LOOK, or use another adult's account to bypass the age limit.",
      "At registration the User confirms: \"I am at least 18 years old and have full legal capacity to enter into contracts.\" LOOK may request age or identity verification for safety, fraud prevention, or legal compliance. If a minor account is discovered, LOOK may restrict or terminate it.",
    ],
  },
  {
    title: "3. What LOOK is",
    paragraphs: [
      "LOOK is a digital marketplace connecting Customers who need work or services with Providers willing to perform them.",
      "LOOK provides technology for profiles, search, order posting, service offers, messaging, provider selection, deals, payments, reviews, ratings, dispute handling, support, admin controls, and other marketplace functions.",
      "Unless expressly stated otherwise, LOOK is not the Provider's employer. Using the Platform alone does not make a Provider an employee of LOOK.",
    ],
  },
  {
    title: "4. Registration",
    paragraphs: [
      "To create an account the User must provide required registration information. Depending on the current LOOK implementation this may include full name, email, mobile phone number, password, country, city, role, and additional profile details. All information must be accurate.",
    ],
    items: [
      "registering under another person's name is prohibited;",
      "using another person's phone is prohibited;",
      "creating a fake identity is prohibited;",
      "providing knowingly false information is prohibited;",
      "creating an account for fraud is prohibited;",
      "creating a new account to evade a ban is prohibited.",
    ],
  },
  {
    title: "5. Verified phone",
    paragraphs: [
      "LOOK may require a verified mobile phone number for full registration and/or account activation (for example via SMS/OTP) when that feature is enabled.",
      "In the current LOOK version a phone number may be provided by the User as contact data. Technical SMS/OTP verification may not yet be active; the UI should not treat a number as \"verified\" until real verification exists and phone_verified_at (or equivalent) is set.",
      "One phone number must not be used to mass-create fraudulent accounts. Specific uniqueness rules follow LOOK architecture and security policies.",
    ],
  },
  {
    title: "6. Payment method",
    paragraphs: [
      "Because LOOK is a marketplace where Customers pay for services and Providers receive payouts, Users must have a suitable verified payment/payout method to use financial features when those features are available.",
      "For Customers: a card or other LOOK-supported payment method. For Providers: a suitable payout method (card / bank account / payout method) depending on the payment provider and country.",
      "CRITICAL: LOOK does not itself store full card numbers, CVV/CVC, PINs, or full sensitive card credentials. Cards are handled by a certified payment provider. LOOK stores only safe identifiers (e.g. provider customer ID, payment method token/ID, last 4 digits when allowed, card brand, expiry if safely returned, verification status).",
      "The payment provider name is shown in the operator block (on staging: Stripe when configured). Homegrown card vaults in LOOK are prohibited.",
    ],
  },
  {
    title: "7. User roles",
    paragraphs: [
      "A User may be a Customer, a Provider, or both if LOOK allows dual roles. One real person must not create multiple accounts solely to manipulate ratings, reviews, deals, statistics, bonuses, or promotions.",
    ],
  },
  {
    title: "8. Customer duties",
    paragraphs: [
      "Customers must not obtain work results by deception and then unreasonably avoid payment.",
    ],
    items: [
      "describe the order accurately;",
      "state real requirements;",
      "provide necessary information;",
      "agree price and deadlines;",
      "pay confirmed deals on time;",
      "not demand illegal acts;",
      "treat Providers respectfully;",
      "promptly report material order changes.",
    ],
  },
  {
    title: "9. Provider duties",
    paragraphs: [
      "Providers alone are responsible for professional licences and permits where the activity is regulated.",
    ],
    items: [
      "provide accurate information about themselves;",
      "state qualifications honestly;",
      "accept only jobs they can perform;",
      "meet agreed deadlines;",
      "deliver reasonable service quality;",
      "comply with law;",
      "hold required licences, permits and qualifications where legally required;",
      "follow safety rules.",
    ],
  },
  {
    title: "10. Zero tolerance for discrimination",
    paragraphs: [
      "LOOK requires equal and respectful treatment of all people. Discrimination is prohibited.",
    ],
    items: [
      "race, colour, nationality, national or ethnic origin, citizenship, language;",
      "religion, beliefs, sex, pregnancy, marital status, age;",
      "disability, health status, sexual orientation, gender identity;",
      "place of origin and other characteristics protected by applicable law.",
    ],
  },
  {
    title: "11. Abuse, harassment and threats",
    paragraphs: [
      "Insults, humiliation, bullying, harassment, threats, blackmail, extortion, sexual harassment, aggressive unwanted contact, and repeated contact after a clear request to stop are prohibited. LOOK may apply sanctions up to account blocking.",
    ],
  },
  {
    title: "12. Child protection",
    paragraphs: [
      "LOOK is for adults only. Child sexual exploitation, child sexual abuse material, sexualized images of children, grooming, offering sexual acts involving a minor, and seeking, buying, selling or distributing such material are strictly prohibited. Such violations are grounds for immediate blocking and other actions required by applicable law.",
    ],
  },
  {
    title: "13. Pornography and sexual services",
    paragraphs: [
      "LOOK must not be used to post illegal pornography, offer prostitution, offer sexual exploitation, publish sexual content prohibited by LOOK rules, or organize sexual exploitation of people. Legitimate medical, educational or creative professional services should not be wrongly blocked solely due to terminology — rules are applied reasonably and in accordance with law.",
    ],
  },
  {
    title: "14. Human trafficking and exploitation",
    paragraphs: [
      "Human trafficking, forced labour, sexual exploitation, slavery, withholding documents, threats to compel work, and any form of human exploitation are absolutely prohibited.",
    ],
  },
  {
    title: "15. Illegal goods and services",
    lead: "LOOK must not be used for unlawful acts. In particular, Users may not offer or order:",
    items: [
      "illegal narcotics;",
      "illegal weapons;",
      "forged documents;",
      "stolen goods;",
      "fraudulent services;",
      "system hacking;",
      "account theft;",
      "malware;",
      "money laundering;",
      "unlawful personal data collection;",
      "other services prohibited by law.",
    ],
  },
  {
    title: "16. Fraud",
    items: [
      "taking payment without intent to perform;",
      "creating fake orders;",
      "using stolen payment instruments;",
      "manipulating refunds;",
      "creating fake reviews;",
      "artificially inflating ratings;",
      "impersonating another person;",
      "impersonating a LOOK administrator;",
      "phishing;",
      "requesting another user's password or OTP.",
    ],
  },
  {
    title: "17. Payments",
    paragraphs: [
      "Payments must go through LOOK-supported payment mechanisms. Payment architecture is defined by the actual PSP. The provider name appears in the operator block and is not invented arbitrarily. Before production, gated test payments may be used in non-production environments when explicitly enabled.",
    ],
  },
  {
    title: "18. LOOK commission",
    paragraphs: [
      "LOOK may charge a commission on operations. Before a deal is confirmed, the User must be shown service price, commission, total amount and applicable currency. Commission is determined by LOOK tariffs shown to the User before confirmation and may be changed by an administrator. This Agreement does not fix a permanent rate (e.g. \"always 10%\").",
    ],
  },
  {
    title: "19. Refunds and disputes",
    paragraphs: [
      "LOOK may provide mechanisms for order cancellation, refunds, disputes and claims handling. Specific rules depend on the actual payment architecture and order statuses. Before production a separate Payments, Cancellations and Refunds Policy is recommended if the marketplace takes money inside the system.",
    ],
  },
  {
    title: "20. Currency",
    paragraphs: [
      "LOOK may support one or more currencies. The User understands that banks may apply their own exchange rates, payment providers may charge additional fees, and tax obligations depend on the User's country.",
    ],
  },
  {
    title: "21. Taxes",
    paragraphs: [
      "Users are solely responsible for their tax obligations unless law provides otherwise. LOOK may be required to collect tax information, withhold tax, or report to tax authorities where applicable law requires.",
    ],
  },
  {
    title: "22. Chats",
    paragraphs: [
      "LOOK provides messaging tools. Threats, spam, harassment, illegal content, malware, fraudulent links and unlawful data collection are prohibited in chats.",
    ],
  },
  {
    title: "23. Photos, video and content",
    paragraphs: [
      "Users are responsible for content they post and confirm they hold necessary rights in photos, videos, texts, portfolio and documents. Infringement of copyright, trademarks, image rights, privacy rights and other IP rights is prohibited.",
    ],
  },
  {
    title: "24. Reviews",
    paragraphs: [
      "Reviews must be based on real experience. Buying or selling reviews, creating fake deals for ratings, and blackmailing with reviews are prohibited.",
    ],
  },
  {
    title: "25. Account security",
    paragraphs: [
      "Users must protect passwords, OTP, passkeys, devices, email and phone. Suspected compromise must be reported to LOOK immediately.",
    ],
  },
  {
    title: "26. Identity checks",
    paragraphs: [
      "For safety LOOK may introduce phone, email, age, identity, KYC and payment-method verification. If features are not yet implemented, LOOK does not claim in the UI that they already work.",
    ],
  },
  {
    title: "27. Account suspension",
    paragraphs: [
      "LOOK may temporarily restrict or terminate access for fraud, serious violations, discrimination, threats, illegal activity, child exploitation, human trafficking, use of stolen payment data, or systematic rule breaches. Where possible, Users receive a clear reason and an appeal channel.",
    ],
  },
  {
    title: "28. Account deletion",
    paragraphs: [
      "Users must be able to request account deletion. Some data may be retained where required by tax law, financial reporting, fraud prevention, dispute investigation, or lawful government requests.",
    ],
  },
  {
    title: "29. Liability",
    paragraphs: [
      "Customers and Providers alone are responsible for their agreements, service quality, legality of services and performance. LOOK's liability is limited to what applicable law and LOOK's own obligations require. This Agreement does not use excessive clauses that unlawfully strip consumers of mandatory rights.",
    ],
  },
  {
    title: "30. Changes to terms",
    paragraphs: [
      "LOOK may update documents. Material changes use versioning (CURRENT_TERMS_VERSION). If re-acceptance is required, the version changes and the legal gate requests new confirmation.",
    ],
  },
  {
    title: "31. Governing law",
    paragraphs: [
      "Governing law and jurisdiction (including dispute venue) will be stated before the production release and are not chosen arbitrarily on staging. Until filled in, these Terms apply together with the law of the Operator's place of business once determined.",
    ],
  },
  {
    title: "32. Third-party licenses",
    paragraphs: [
      "Information about third-party software and licenses used by LOOK is available on the Licenses page. At registration the User acknowledges having reviewed that notice.",
    ],
  },
] as const;

export function getTermsSections(locale: Locale): readonly TermsSection[] {
  return locale === "en" ? TERMS_SECTIONS_EN : TERMS_SECTIONS_RU;
}
