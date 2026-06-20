import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = {
  title: "Terms of Service — LOOK",
};

export default function TermsOfServicePage() {
  return (
    <AppLayout hideNav title="Terms of Service">
      <div className="space-y-5 p-4 pb-8">
        <PageHeader
          title="Terms of Service"
          subtitle="Условия использования LOOK"
          backHref="/"
        />

        <div className="prose prose-sm max-w-none space-y-4 text-sm text-text-secondary">
          <p>
            <strong>Дата вступления в силу:</strong> июнь 2026
          </p>
          <p>
            Используя LOOK в beta-версии, вы соглашаетесь с этими условиями. Если вы не согласны —
            не используйте сервис.
          </p>

          <h2 className="text-base font-semibold text-text-primary">1. Beta-режим</h2>
          <p>
            LOOK находится в стадии закрытого тестирования. Сервис предоставляется «как есть».
            Функции могут изменяться без предварительного уведомления.
          </p>

          <h2 className="text-base font-semibold text-text-primary">2. Тестовые платежи</h2>
          <p>
            Все платежи в beta-версии являются симуляцией. Реальные деньги не списываются и не
            переводятся между пользователями. LOOK не несёт ответственности за финансовые договорённости
            вне платформы.
          </p>

          <h2 className="text-base font-semibold text-text-primary">3. Роли пользователей</h2>
          <p>
            Заказчики публикуют запросы. Исполнители отправляют предложения. Пользователь обязан
            предоставлять достоверную информацию и не нарушать права других участников.
          </p>

          <h2 className="text-base font-semibold text-text-primary">4. Запрещённое поведение</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Мошенничество, спам, оскорбления, незаконный контент</li>
            <li>Создание фейковых заказов или откликов</li>
            <li>Попытки обхода ограничений безопасности платформы</li>
          </ul>

          <h2 className="text-base font-semibold text-text-primary">5. Ответственность</h2>
          <p>
            LOOK выступает посредником для связи сторон. Качество услуг исполнителей и обязательства
            сторон определяются ими самостоятельно. Платформа не гарантирует результат работ.
          </p>

          <h2 className="text-base font-semibold text-text-primary">6. Прекращение доступа</h2>
          <p>
            Мы можем ограничить или удалить аккаунт при нарушении условий или по решению
            администратора beta-теста.
          </p>

          <h2 className="text-base font-semibold text-text-primary">7. Изменения условий</h2>
          <p>
            Условия могут обновляться. Актуальная версия публикуется на этой странице.
          </p>

          <h2 className="text-base font-semibold text-text-primary">8. Контакты</h2>
          <p>
            По вопросам условий использования:{" "}
            <a href="mailto:support@look.app" className="text-brand-600">
              support@look.app
            </a>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
