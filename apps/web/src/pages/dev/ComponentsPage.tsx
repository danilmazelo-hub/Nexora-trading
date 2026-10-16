import { useState } from 'react';
import { ApiError } from '../../shared/lib/api-client';
import { Badge, Button, type Column, Dialog, EmptyState, ErrorState, Field, Input, Money, Select, Skeleton, Table, Tabs, useToast } from '../../shared/ui';

const LONG = 'Очень длинное название инструмента или сообщение об ошибке, которое должно переноситься и не ломать вёрстку: ' + 'Сверхдлинноеслово'.repeat(6);

interface Row {
  id: string;
  name: string;
  amount: string;
}
const ROWS: Row[] = [
  { id: 'r1', name: 'Bitcoin', amount: '50000.00' },
  { id: 'r2', name: 'Малая сумма (−0,0001)', amount: '-0.0001' },
  { id: 'r3', name: LONG.slice(0, 80), amount: '12.5' },
];
const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Название', render: (r) => r.name },
  { key: 'amount', header: 'Сумма', align: 'right', render: (r) => <Money amount={r.amount} currency="USD" /> },
];

/** /dev/components — showcase of the base kit (D08): keyboard, focus, Escape, disabled reasons, long text. */
export function ComponentsPage() {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [tab, setTab] = useState<'one' | 'two' | 'three'>('one');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const nameError = submitted && name.trim().length < 2 ? 'Введите не менее 2 символов' : undefined;
  return (
    <div className="page">
      <header className="page-head">
        <h1>Компоненты интерфейса</h1>
        <Badge tone="info">Витрина D08</Badge>
      </header>

      <section className="panel" aria-labelledby="c-buttons">
        <h2 id="c-buttons">Кнопки</h2>
        <div className="row gap">
          <Button variant="primary" onClick={() => toast('Основное действие выполнено', 'success')}>
            Основная
          </Button>
          <Button onClick={() => toast('Информационное уведомление')}>Вторичная</Button>
          <Button variant="ghost">Прозрачная</Button>
          <Button variant="danger">Опасная</Button>
          <Button loading>Сохраняем…</Button>
          <Button disabledReason="Торговля появится в задаче D15: сейчас купить нельзя">Купить</Button>
        </div>
      </section>

      <section className="panel" aria-labelledby="c-form">
        <h2 id="c-form">Форма</h2>
        <form
          className="grid-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (name.trim().length >= 2) toast(`Сохранено: ${name.trim()}`, 'success');
          }}
        >
          <Field label="Имя профиля" hint="Видно только вам" error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </Field>
          <Field label="Язык интерфейса">
            <Select
              defaultValue="ru"
              options={[
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
                { value: 'uk', label: 'Українська (скоро)', disabled: true },
              ]}
            />
          </Field>
          <div>
            <Button type="submit" variant="primary">
              Сохранить
            </Button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="c-dialog">
        <h2 id="c-dialog">Диалог и вкладки</h2>
        <div className="row gap">
          <Button onClick={() => setDialog(true)}>Открыть диалог</Button>
        </div>
        <div style={{ marginTop: 16 }}>
          <Tabs
            label="Пример вкладок"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'one', label: 'Первая' },
              { id: 'two', label: 'Вторая' },
              { id: 'three', label: 'Недоступна', disabled: true },
            ]}
          />
          <div role="tabpanel" className="tab-panel" aria-label={tab === 'one' ? 'Первая' : 'Вторая'}>
            {tab === 'one' ? 'Содержимое первой вкладки. Стрелки ←/→ переключают вкладки.' : 'Содержимое второй вкладки.'}
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="c-table">
        <h2 id="c-table">Таблица и деньги</h2>
        <Table caption="Пример таблицы" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />
      </section>

      <section className="grid-2" aria-label="Состояния">
        <div className="panel">
          <EmptyState title="Пока пусто">Здесь появятся ваши позиции после первой сделки.</EmptyState>
        </div>
        <div className="panel">
          <ErrorState error={new ApiError(503, 'DB_UNAVAILABLE', 'База данных временно недоступна. Повторите позже.', 'req_demo1234')} onRetry={() => toast('Повтор запроса')} />
        </div>
        <div className="panel">
          <h3>Загрузка</h3>
          <Skeleton lines={3} />
        </div>
        <div className="panel">
          <h3>Длинный текст</h3>
          <p>{LONG}</p>
          <div className="row gap">
            <Badge>Нейтр.</Badge>
            <Badge tone="up">Рост</Badge>
            <Badge tone="down">Падение</Badge>
            <Badge tone="warn">Устарело</Badge>
          </div>
        </div>
      </section>

      <Dialog
        open={dialog}
        title="Пример диалога"
        onClose={() => setDialog(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => setDialog(false)}>
              Готово
            </Button>
          </>
        }
      >
        <p>Фокус перемещён внутрь. Tab и Shift+Tab не выходят за пределы окна, Escape закрывает его и возвращает фокус на кнопку.</p>
        <Field label="Поле внутри диалога">
          <Input />
        </Field>
      </Dialog>
    </div>
  );
}
