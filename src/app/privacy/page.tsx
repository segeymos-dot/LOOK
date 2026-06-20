import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = {
  title: "Privacy Policy — LOOK",
};

export default function PrivacyPolicyPage() {
  return (
    <AppLayout hideNav title="Privacy Policy">
      <div className="space-y-5 p-4 pb-8">
        <PageHeader title="Privacy Policy" subtitle="Политика конфиденциальности LOOK" backHref="/" />

        <div className="prose prose-sm max-w-none space-y-4 text-sm text-text-secondary">
          <p>
            <strong>Дата вступления в силу:</strong> июнь 2026
          </p>
          <p>
            LOOK («мы», «платформа») — beta-маркетплace услуг. Эта политика описывает, как мы
            обрабатываем персональные данные пользователей в рамках закрытого тестирования.
          </p>

          <h2 className="text-base font-semibold text-text-primary">1. Какие данные мы собираем</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Имя, email, телефон, город и страна (при регистрации и в профиле)</li>
            <li>Информация о заказах, предложениях и сообщениях в чате</li>
            <li>Технические данные: IP, тип устройства, cookies сессии авторизации</li>
            <li>Финансовые записи в тестовом режиме (без реальных платежей)</li>
          </ul>

          <h2 className="text-base font-semibold text-text-primary">2. Зачем мы используем данные</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Регистрация, вход и работа аккаунта</li>
            <li>Связь заказчиков и исполнителей</li>
            <li>Тестирование функций платформы в beta-режиме</li>
            <li>Улучшение сервиса и поддержка пользователей</li>
          </ul>

          <h2 className="text-base font-semibold text-text-primary">3. Хранение и безопасность</h2>
          <p>
            Данные хранятся в Supabase (PostgreSQL). Мы применяем row-level security и ограничиваем
            доступ к данным. В beta-версии не обрабатываются реальные банковские платежи.
          </p>

          <h2 className="text-base font-semibold text-text-primary">4. Передача третьим лицам</h2>
          <p>
            Мы не продаём персональные данные. Данные могут обрабатываться инфраструктурными
            провайдерами (хостинг, email-рассылка) только для работы сервиса.
          </p>

          <h2 className="text-base font-semibold text-text-primary">5. Ваши права</h2>
          <p>
            Вы можете запросить доступ, исправление или удаление данных, написав в поддержку LOOK.
            Вы можете удалить аккаунт, обратившись к администратору beta-теста.
          </p>

          <h2 className="text-base font-semibold text-text-primary">6. Контакты</h2>
          <p>
            По вопросам конфиденциальности:{" "}
            <a href="mailto:support@look.app" className="text-brand-600">
              support@look.app
            </a>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
