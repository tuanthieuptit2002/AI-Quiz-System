'use client';
import { useState } from 'react';
import Image, { type ImageLoader } from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  GraduationCap,
  Lightbulb,
  PlayCircle,
  Presentation,
  Rocket,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Empty, SectionTitle } from '../ui';
import {
  cloudinaryUrl,
  docCategories,
  docsFor,
  docText,
  type DocArticle,
  type DocCategory,
} from '@/lib/docs';
import type { Role } from '@/lib/types';

const cloudinaryLoader: ImageLoader = ({ src, width, quality }) =>
  cloudinaryUrl(src, width, quality);

const categoryIcons: Record<DocCategory, typeof Rocket> = {
  'Bắt đầu': Rocket,
  'Quản trị': ShieldCheck,
  'Giáo viên': Presentation,
  'Học sinh': GraduationCap,
};

const groupDocs = (list: DocArticle[]) =>
  docCategories
    .map((category) => ({ category, docs: list.filter((doc) => doc.category === category) }))
    .filter((group) => group.docs.length > 0);

export function DocsPage({
  role,
  slug,
  openTour,
}: {
  role: Role;
  slug?: string;
  openTour: () => void;
}) {
  const list = docsFor(role);
  if (!slug) return <DocsHome list={list} openTour={openTour} />;
  const index = list.findIndex((doc) => doc.slug === slug);
  if (index < 0)
    return (
      <Empty
        icon={<BookOpenText size={28} />}
        title="Không tìm thấy bài hướng dẫn"
        description="Bài viết không tồn tại hoặc không dành cho vai trò của bạn."
        action={
          <Link href="/docs" className="btn btn-primary">
            Về trang hướng dẫn
          </Link>
        }
      />
    );
  return <DocView list={list} index={index} />;
}

function DocsHome({ list, openTour }: { list: DocArticle[]; openTour: () => void }) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLocaleLowerCase('vi');
  const groups = groupDocs(term ? list.filter((doc) => docText(doc).includes(term)) : list);
  return (
    <>
      <SectionTitle
        eyebrow="HƯỚNG DẪN SỬ DỤNG"
        title="Trung tâm hướng dẫn"
        description="Các bài viết từng bước cho những tính năng bạn dùng được trong QuizSpace."
        action={
          <button type="button" className="btn btn-secondary" onClick={openTour}>
            <PlayCircle size={17} /> Xem lại hướng dẫn nhanh
          </button>
        }
      />
      <div className="input-icon docs-search">
        <Search size={18} />
        <input
          type="search"
          placeholder="Tìm hướng dẫn, ví dụ: giao bài, mã lớp, chấm bài…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Tìm bài hướng dẫn"
        />
      </div>
      {groups.length === 0 ? (
        <Empty
          icon={<Search size={28} />}
          title="Không có bài phù hợp"
          description="Thử từ khóa khác hoặc xóa ô tìm kiếm để xem tất cả bài viết."
        />
      ) : (
        groups.map(({ category, docs }) => {
          const Icon = categoryIcons[category];
          return (
            <section key={category} className="docs-group">
              <h2>
                <Icon size={17} /> {category}
                <small>{docs.length} bài</small>
              </h2>
              <div className="docs-grid">
                {docs.map((doc) => (
                  <Link key={doc.slug} href={`/docs/${doc.slug}`} className="docs-card">
                    <b>{doc.title}</b>
                    <p>{doc.summary}</p>
                    <span>
                      Đọc hướng dẫn <ArrowRight size={14} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function DocView({ list, index }: { list: DocArticle[]; index: number }) {
  const router = useRouter();
  const doc = list[index];
  const prev = list[index - 1];
  const next = list[index + 1];
  const groups = groupDocs(list);
  return (
    <div className="docs-layout">
      <aside className="docs-nav">
        <Link href="/docs" className="docs-back">
          <ArrowLeft size={15} /> Tất cả hướng dẫn
        </Link>
        <select
          className="docs-select"
          value={doc.slug}
          onChange={(event) => router.push(`/docs/${event.target.value}`)}
          aria-label="Chọn bài hướng dẫn"
        >
          {groups.map((group) => (
            <optgroup key={group.category} label={group.category}>
              {group.docs.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {groups.map((group) => (
          <div key={group.category} className="docs-nav-group">
            <span>{group.category}</span>
            {group.docs.map((item) => (
              <Link
                key={item.slug}
                href={`/docs/${item.slug}`}
                className={item.slug === doc.slug ? 'active' : ''}
                aria-current={item.slug === doc.slug ? 'page' : undefined}
              >
                {item.title}
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <article className="docs-article">
        <span className="eyebrow">{doc.category.toLocaleUpperCase('vi')}</span>
        <h1>{doc.title}</h1>
        <p className="docs-summary">{doc.summary}</p>
        <div className="docs-links">
          {doc.links.map((link) => (
            <Link key={link.href} href={link.href} className="btn btn-secondary">
              {link.label} <ArrowUpRight size={15} />
            </Link>
          ))}
        </div>
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.text && <p>{section.text}</p>}
            {section.steps && (
              <ol className="docs-steps">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {section.points && (
              <ul className="docs-points">
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
            {section.images?.map((image) => (
              <figure key={image.src} className="docs-shot">
                <a
                  href={cloudinaryUrl(image.src)}
                  target="_blank"
                  rel="noopener"
                  title="Mở ảnh kích thước đầy đủ"
                >
                  <Image
                    loader={cloudinaryLoader}
                    src={image.src}
                    alt={image.alt}
                    width={image.width}
                    height={image.height}
                    sizes="(max-width: 1000px) 100vw, 820px"
                  />
                </a>
                <figcaption>{image.alt}</figcaption>
              </figure>
            ))}
          </section>
        ))}
        {doc.tips && (
          <div className="docs-tip">
            <Lightbulb size={19} />
            <div>
              <b>Mẹo</b>
              {doc.tips.map((tip) => (
                <p key={tip}>{tip}</p>
              ))}
            </div>
          </div>
        )}
        <nav className="docs-pager" aria-label="Bài trước và bài tiếp theo">
          {prev ? (
            <Link href={`/docs/${prev.slug}`}>
              <small>
                <ArrowLeft size={13} /> Bài trước
              </small>
              <b>{prev.title}</b>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="next">
              <small>
                Bài tiếp theo <ArrowRight size={13} />
              </small>
              <b>{next.title}</b>
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}
