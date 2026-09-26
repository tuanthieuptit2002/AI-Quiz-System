'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowUpRight, Layers3, LoaderCircle, X, Inbox, AlertCircle } from 'lucide-react';
import type { User } from '@/lib/types';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`logo ${light ? 'logo-light' : ''}`}
      aria-label="QuizSpace — trang chủ"
    >
      <span className="logo-symbol">
        <Layers3 size={23} strokeWidth={2.3} />
      </span>
      <span>
        quiz<span className="logo-weight">space</span>
        <span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
export function Avatar({
  user,
  size = 'md',
}: {
  user: Pick<User, 'name' | 'avatar'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <span className={`avatar avatar-${size}`}>
      {user.avatar ? (
        <Image src={user.avatar} alt={`Ảnh của ${user.name}`} width={96} height={96} unoptimized />
      ) : (
        initials
      )}
    </span>
  );
}
export function Spinner() {
  return <LoaderCircle size={18} className="spin" aria-label="Đang tải" />;
}
export function Loading() {
  return (
    <div className="loading-state">
      <Spinner />
      <span>Đang tải không gian của bạn…</span>
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && <button onClick={retry}>Thử lại</button>}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-orbit">
        <span>{icon || <Inbox size={28} />}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  close,
  wide = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="modal-content">
        <header>
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Đóng">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  icon,
  detail,
  tone = 'mint',
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  detail: string;
  tone?: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        <ArrowUpRight size={17} />
      </div>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
