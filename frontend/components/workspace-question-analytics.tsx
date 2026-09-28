'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, BarChart3, Clock3, Search, Target, X } from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import {
  countLabel,
  difficultyLabel,
  flagLabels,
  indexLabel,
  percentLabel,
  secondsLabel,
  type AnalyticsDetail,
  type AnalyticsFlag,
  type AnalyticsList,
} from '@/lib/question-analytics';
import { difficultyLabels, typeLabels } from '@/lib/questions';
import { Empty, ErrorBox, Loading, SectionTitle } from './ui';

const filters: { id: '' | AnalyticsFlag; label: string }[] = [
  { id: '', label: 'Tất cả' },
  { id: 'mismatch', label: 'Lệch độ khó' },
  { id: 'too_hard', label: 'Quá khó' },
  { id: 'too_easy', label: 'Quá dễ' },
  { id: 'weak_discrimination', label: 'Phân biệt kém' },
];

export function QuestionAnalytics() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [flag, setFlag] = useState<'' | AnalyticsFlag>('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  if (openId) return <AnalyticsDetail id={openId} back={() => setOpenId(null)} />;
  const params = new URLSearchParams({ page: String(page) });
  if (debounced) params.set('search', debounced);
  if (flag) params.set('flag', flag);
  return (
    <AnalyticsListView
      path={`/questions/analytics?${params}`}
      search={search}
      setSearch={setSearch}
      flag={flag}
      setFlag={(value) => {
        setFlag(value);
        setPage(1);
      }}
      page={page}
      setPage={setPage}
      open={setOpenId}
      filtered={!!(debounced || flag)}
      clear={() => {
        setSearch('');
        setDebounced('');
        setFlag('');
        setPage(1);
      }}
    />
  );
}

function AnalyticsListView({
  path,
  search,
  setSearch,
  flag,
  setFlag,
  page,
  setPage,
  open,
  filtered,
  clear,
}: {
  path: string;
  search: string;
  setSearch: (value: string) => void;
  flag: '' | AnalyticsFlag;
  setFlag: (value: '' | AnalyticsFlag) => void;
  page: number;
  setPage: (value: number) => void;
  open: (id: string) => void;
  filtered: boolean;
  clear: () => void;
}) {
  const list = useQuery<AnalyticsList>(path);
  return (
    <>
      <SectionTitle
        eyebrow="QUESTION QUALITY"
        title="Phân tích câu hỏi"
        description="Độ khó thực tế, độ phân biệt và phương án nhiễu được tính từ bài thi đã nộp. Luyện tập không làm thay đổi các chỉ số này."
      />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox message={list.error} retry={list.reload} />
      ) : !list.data?.summary.analyzed ? (
        <section className="panel">
          <Empty
            icon={<BarChart3 size={28} />}
            title="Chưa có bài đã nộp"
            description="Khi học sinh nộp bài, từng câu sẽ có tỷ lệ đúng, thời gian làm và cảnh báo nếu độ khó thực tế lệch với độ khó đã đặt."
            action={
              <Link href="/questions" className="btn btn-primary">
                Về ngân hàng câu hỏi
              </Link>
            }
          />
        </section>
      ) : (
        <>
          <div className="qb-stats qa-stats">
            <Stat label="Câu đã có lượt làm" value={countLabel(list.data.summary.analyzed)} />
            <Stat label="Lệch độ khó" value={countLabel(list.data.summary.mismatch)} />
            <Stat label="Quá khó" value={countLabel(list.data.summary.tooHard)} />
            <Stat label="Quá dễ" value={countLabel(list.data.summary.tooEasy)} />
          </div>
          <section className="panel qa-library">
            <div className="qa-toolbar">
              <div className="input-icon">
                <Search size={17} />
                <input
                  aria-label="Tìm câu hỏi"
                  placeholder="Tìm nội dung, môn học hoặc chủ đề…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="qa-filters" role="group" aria-label="Lọc theo cảnh báo">
                {filters.map((item) => (
                  <button
                    key={item.id || 'all'}
                    className={flag === item.id ? 'is-on' : ''}
                    onClick={() => setFlag(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {filtered && (
                <button className="qa-clear" onClick={clear}>
                  <X size={13} /> Xóa bộ lọc
                </button>
              )}
            </div>
            {list.data.truncated && <p className="qa-note">Đang dùng 2.000 bài nộp gần nhất.</p>}
            {!list.data.questions.length ? (
              <Empty
                icon={<Target size={28} />}
                title="Không có câu hỏi trong nhóm này"
                description="Thử bộ lọc khác hoặc xóa tìm kiếm để xem toàn bộ câu đã có lượt làm."
                action={
                  <button className="btn btn-secondary" onClick={clear}>
                    Xóa bộ lọc
                  </button>
                }
              />
            ) : (
              <div className="qa-list">
                {list.data.questions.map((question) => (
                  <article key={question.id} className="qa-card">
                    <div className="qa-card-top">
                      <span className="qb-badge">{typeLabels[question.type]}</span>
                      <span className="qa-topic">
                        {question.subject}
                        {question.topic !== question.subject ? ` · ${question.topic}` : ''}
                      </span>
                      {question.flags.map((item) => (
                        <span key={item} className={`qa-flag qa-flag-${item}`}>
                          {flagLabels[item]}
                        </span>
                      ))}
                    </div>
                    <button className="qa-title" onClick={() => open(question.id)}>
                      {question.question}
                    </button>
                    <div className="qa-metrics">
                      <Metric label="Lượt làm" value={countLabel(question.attempts)} />
                      <Metric label="Tỷ lệ đúng" value={percentLabel(question.correctRate)} />
                      <Metric label="Thời gian TB" value={secondsLabel(question.averageSeconds)} />
                      <Metric label="Kỳ vọng" value={difficultyLabels[question.difficulty]} />
                      <Metric label="Thực tế" value={difficultyLabel(question.actual)} />
                    </div>
                  </article>
                ))}
              </div>
            )}
            {list.data.pages > 1 && (
              <div className="qa-pager">
                <button
                  className="btn btn-secondary small"
                  disabled={page <= 1 || list.loading}
                  onClick={() => setPage(page - 1)}
                >
                  Trước
                </button>
                <span>
                  Trang {list.data.page} / {list.data.pages}
                </span>
                <button
                  className="btn btn-secondary small"
                  disabled={page >= list.data.pages || list.loading}
                  onClick={() => setPage(page + 1)}
                >
                  Sau
                </button>
              </div>
            )}
          </section>
          <p className="qa-footnote">
            Chỉ số độ khó P là tỷ lệ đúng: P cao nghĩa là câu dễ. Chỉ số phân biệt D so sánh 27% bài
            điểm cao với 27% bài điểm thấp. Kết luận cần ít nhất {list.data.sample} lượt đã chấm.
            Thời gian từng câu chỉ có với lượt thi bắt đầu sau khi bật tính năng này.
          </p>
        </>
      )}
    </>
  );
}

function AnalyticsDetail({ id, back }: { id: string; back: () => void }) {
  const report = useQuery<AnalyticsDetail>(`/questions/${id}/analytics`);
  if (report.loading) return <Loading />;
  if (report.error || !report.data)
    return <ErrorBox message={report.error || 'Không tải được phân tích.'} retry={report.reload} />;
  const data = report.data;
  const distributionTitle =
    data.distribution === 'slots'
      ? 'Độ chính xác từng mục'
      : data.distribution === 'answers'
        ? 'Câu trả lời sai thường gặp'
        : 'Phân bố đáp án';
  return (
    <>
      <button className="btn btn-secondary qa-back" onClick={back}>
        <ArrowLeft size={17} /> Danh sách phân tích
      </button>
      <SectionTitle
        eyebrow={data.subject}
        title={data.question}
        description={`${typeLabels[data.type]} · ${data.topic}`}
      />
      <div className="qb-stats qa-stats">
        <Stat label="Lượt làm" value={countLabel(data.attempts)} />
        <Stat label="Tỷ lệ đúng" value={percentLabel(data.correctRate)} />
        <Stat label="Thời gian trung bình" value={secondsLabel(data.averageSeconds)} />
        <Stat label="Chỉ số độ khó P" value={indexLabel(data.difficultyIndex)} />
      </div>
      <div className="qa-detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Độ khó</h2>
              <p>Kỳ vọng trên ngân hàng so với kết quả thật</p>
            </div>
          </div>
          <div className="qa-compare">
            <div>
              <span>Kỳ vọng</span>
              <b>{difficultyLabels[data.difficulty]}</b>
            </div>
            <div>
              <span>Thực tế</span>
              <b className={data.flags.includes('mismatch') ? 'is-alert' : ''}>
                {difficultyLabel(data.actual)}
              </b>
            </div>
          </div>
          <p className="qa-note">
            P = {indexLabel(data.difficultyIndex)}. P càng cao thì câu càng dễ.
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Chỉ số phân biệt</h2>
              <p>Nhóm điểm cao trừ nhóm điểm thấp</p>
            </div>
            <Target size={18} />
          </div>
          <p className="qa-index">
            <b>{indexLabel(data.discrimination)}</b>
            <span>{data.discriminationLabel || 'Chưa đủ mẫu'}</span>
          </p>
          <p className="qa-note">
            D từ −1 đến 1. Dưới 0,20 là phân biệt kém. Âm là tín hiệu câu hoặc đáp án gây hiểu nhầm.
          </p>
        </section>
        <section className="panel qa-warnings">
          <div className="panel-heading">
            <div>
              <h2>Cảnh báo chất lượng</h2>
              <p>Suy ra từ các chỉ số, không đổi điểm bài thi</p>
            </div>
            <AlertTriangle size={18} />
          </div>
          {data.warnings.length ? (
            <ul>
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="qa-note">
              Chưa thấy lệch độ khó, câu quá dễ/khó hay phương án nhiễu bất thường.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{distributionTitle}</h2>
              <p>
                {data.distribution === 'choices'
                  ? 'Số lượt chọn từng phương án'
                  : data.distribution === 'slots'
                    ? 'Số lượt đặt đúng vị trí hoặc ghép đúng cặp'
                    : 'Các đáp án không được chấp nhận'}
              </p>
            </div>
            <Clock3 size={18} />
          </div>
          {data.distribution === 'answers' ? (
            data.wrongAnswers.length ? (
              <ShareList
                items={data.wrongAnswers.map((item) => ({
                  key: item.text,
                  label: item.text,
                  value: item.count,
                  caption: countLabel(item.count),
                }))}
                max={Math.max(...data.wrongAnswers.map((item) => item.count), 1)}
              />
            ) : (
              <p className="qa-note">Chưa có câu trả lời sai để gom nhóm.</p>
            )
          ) : data.choices.length ? (
            <ShareList
              items={data.choices.map((item) => ({
                key: item.text,
                label: item.text,
                value: item.rate,
                caption: `${percentLabel(item.rate)} · ${countLabel(item.count)}`,
                mark:
                  item.role === 'key'
                    ? 'Đáp án'
                    : item.flag === 'attractive'
                      ? 'Nhiễu hút'
                      : item.flag === 'unused'
                        ? 'Ít dùng'
                        : '',
              }))}
              max={100}
            />
          ) : (
            <p className="qa-note">Dạng câu này chưa có phân bố phương án.</p>
          )}
          {data.omitted > 0 && <p className="qa-note">Bỏ trống {countLabel(data.omitted)} lượt.</p>}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="qb-stat-icon mint">
        <BarChart3 size={20} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span>{label}</span>
      <b>{value}</b>
    </p>
  );
}

function ShareList({
  items,
  max,
}: {
  items: { key: string; label: string; value: number; caption: string; mark?: string }[];
  max: number;
}) {
  const ceiling = Math.max(max, 1);
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.key}>
          <span title={item.label}>
            {item.mark ? <small className="qa-mark">{item.mark}</small> : null}
            {item.label}
          </span>
          <i>
            <b style={{ width: `${Math.max(2, (item.value / ceiling) * 100)}%` }} />
          </i>
          <strong>{item.caption}</strong>
        </div>
      ))}
    </div>
  );
}
