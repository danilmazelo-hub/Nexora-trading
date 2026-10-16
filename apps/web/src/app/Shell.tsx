import { useEffect, useId, useRef, useState } from 'react';
import { matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AccountBalance } from '../modules/accounts/AccountBalance';
import { AssetPicker } from '../modules/instruments/AssetPicker';
import { useLeaveDemo, useSession } from '../modules/session/api';
import { Button, Dialog } from '../shared/ui';
import { Icon } from '../shared/ui/Icon';
import { BOTTOM_NAV, NAV_GROUPS, type NavGroup, ROUTES } from './routes';

function useRouteTitle() {
  const loc = useLocation();
  const r = ROUTES.find((x) => matchPath(x.path, loc.pathname));
  const title = r?.title ?? 'Страница не найдена';
  useEffect(() => {
    document.title = `${title} · NEXORA Trading`;
  }, [title]);
  return title;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = Object.keys(NAV_GROUPS) as NavGroup[];
  return (
    <>
      <aside id="sidebar" className={'sidebar' + (open ? ' open' : '')} aria-label="Основная навигация">
        <div className="brand">
          <img src="/logo-n.png" alt="" width={34} height={34} />
          <div>
            <div className="wordmark">NEXORA</div>
            <div className="muted small">TRADING · ДЕМО</div>
          </div>
        </div>
        <nav className="nav">
          {groups.map((g) => (
            <div key={g} className="nav-group">
              <div className="nav-label">{NAV_GROUPS[g]}</div>
              {ROUTES.filter((r) => r.nav?.group === g).map((r) => (
                <NavLink key={r.path} to={r.path} end={r.path === '/markets'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')} onClick={onClose}>
                  <Icon name={r.nav!.icon} />
                  <span>{r.nav!.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <p className="sidebar-foot muted small">Демо-платформа: виртуальные средства; котировки — симулятор или справочные цены провайдеров (источник указан у цены). Не является инвестиционной рекомендацией.</p>
      </aside>
      {open ? <div className="scrim" onClick={onClose} aria-hidden="true" /> : null}
    </>
  );
}

function AccountMenu() {
  const s = useSession();
  const leave = useLeaveDemo();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const name = s.data?.profile.displayName ?? 'Демо';
  const acc = s.data?.accounts[0];
  return (
    <div className="account" ref={ref}>
      <button ref={btnRef} type="button" className="account-chip" aria-haspopup="true" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
        <span className="avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-name">{name}</span>
      </button>
      {open ? (
        <div id={menuId} className="account-menu" role="group" aria-label="Меню аккаунта">
          <div className="account-menu-head">
            <b>{name}</b>
            <span className="muted small">Демосессия</span>
            {acc ? <AccountBalance accountId={acc.id} size="sm" /> : null}
          </div>
          <button type="button" className="menu-item" onClick={() => { setOpen(false); navigate('/demo'); }}>
            Демосчёт и сценарии
          </button>
          <button type="button" className="menu-item" onClick={() => { setOpen(false); navigate('/settings/profile'); }}>
            Настройки профиля
          </button>
          <button type="button" className="menu-item danger" onClick={() => leave.mutate(undefined, { onSuccess: () => navigate('/demo', { replace: true }) })}>
            <Icon name="logout" /> Выйти из демо
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} title="Поиск инструмента" onClose={onClose} initialFocusSelector="input[type=search]">
      <AssetPicker
        selectedId={null}
        onSelect={(i) => {
          onClose();
          navigate(`/markets/${i.market}?symbol=${encodeURIComponent(i.id)}`);
        }}
      />
    </Dialog>
  );
}

/** App frame: demo strip, sidebar (drawer ≤ 1024px), topbar, content outlet, bottom nav (≤ 768px). */
export function Shell() {
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const title = useRouteTitle();
  const loc = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const session = useSession();
  const locale = session.data?.profile.locale ?? 'ru';
  useEffect(() => {
    setDrawer(false);
  }, [loc.pathname]);
  // Saved profile preference drives the document language (screen readers, hyphenation).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <div className="shell">
      <a href="#content" className="skip-link">
        К содержимому
      </a>
      <div className="demo-strip" role="note">
        <b>ДЕМО</b> · виртуальные средства; котировки — симулятор или справочные цены провайдеров. Реальных сделок и платежей нет.
      </div>
      <Sidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="Открыть меню" aria-controls="sidebar" aria-expanded={drawer} onClick={() => setDrawer((v) => !v)}>
            <Icon name="menu" />
          </button>
          <div className="topbar-title" aria-live="polite">
            {title}
          </div>
          <div className="topbar-actions">
            <button type="button" className="search-btn" onClick={() => setSearch(true)}>
              <Icon name="search" />
              <span>Поиск инструмента</span>
            </button>
            <Button variant="ghost" size="sm" icon={<Icon name="bell" />} aria-label="Уведомления" disabled title="Уведомления появятся в задаче D40">
              <span className="sr-only">Уведомления (в разработке, D40)</span>
            </Button>
            <Button variant="ghost" size="sm" icon={<Icon name="support" />} aria-label="Поддержка" disabled title="Поддержка появится в задаче D41">
              <span className="sr-only">Поддержка (в разработке, D41)</span>
            </Button>
            <AccountMenu />
          </div>
        </header>
        <main id="content" ref={mainRef} className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <nav className="bottomnav" aria-label="Нижняя навигация">
        {BOTTOM_NAV.map((b) => (
          <NavLink key={b.to} to={b.to} className={({ isActive }) => 'bn-item' + (isActive || (b.to === '/markets' && loc.pathname.startsWith('/markets')) ? ' active' : '')}>
            <Icon name={b.icon} />
            <span>{b.label}</span>
          </NavLink>
        ))}
        <button type="button" className="bn-item" aria-controls="sidebar" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          <Icon name="more" />
          <span>Ещё</span>
        </button>
      </nav>
      <SearchDialog open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
