import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, Filter, Hash, LoaderCircle, Trash2 } from "lucide-react";
import { getHistory, deleteSession, getInterviewTopics } from "../api/interview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 15;
const PAGE_CLASS = "flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 md:px-7 md:py-8 xl:px-10 2xl:px-12";

const MODE_BADGES = {
  resume: { text: "简历面试", variant: "default" },
  topic_drill: { text: "专项训练", variant: "success" },
  jd_prep: { text: "JD 备面", variant: "blue" },
  recording: { text: "录音复盘", variant: "blue" },
};

const FILTER_OPTIONS = [
  { key: "all", label: "全部" },
  { key: "resume", label: "简历面试" },
  { key: "topic_drill", label: "专项训练" },
  { key: "jd_prep", label: "JD 备面" },
  { key: "recording", label: "录音复盘" },
];

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modeFilter, setModeFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [topics, setTopics] = useState([]);
  const hasLoadedOnceRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    getInterviewTopics().then(setTopics).catch(() => {});
  }, []);

  const runHistoryQuery = useCallback(async ({ offset, reset }) => {
    const requestId = ++requestIdRef.current;

    if (reset) {
      if (hasLoadedOnceRef.current) setIsRefreshing(true);
      else setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const mode = modeFilter === "all" ? null : modeFilter;
    const topic = topicFilter === "all" ? null : topicFilter;

    try {
      const data = await getHistory(PAGE_SIZE, offset, mode, topic);
      if (requestId !== requestIdRef.current) return;
      setSessions((prev) => (reset ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
    } catch {
      if (requestId !== requestIdRef.current) return;
      if (reset) setSessions([]);
    } finally {
      if (requestId === requestIdRef.current) {
        if (reset) {
          setLoading(false);
          setIsRefreshing(false);
          hasLoadedOnceRef.current = true;
        } else {
          setLoadingMore(false);
        }
      }
    }
  }, [modeFilter, topicFilter]);

  useEffect(() => {
    runHistoryQuery({ offset: 0, reset: true });
  }, [runHistoryQuery]);

  const handleModeChange = (mode) => {
    if (mode !== "all" && mode !== "topic_drill") setTopicFilter("all");
    setModeFilter(mode);
  };

  const handleTopicChange = (value) => {
    setTopicFilter(value);
  };

  const handleDelete = async (event, sessionId) => {
    event.stopPropagation();
    if (!window.confirm("确定要删除这条记录吗？")) return;

    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((item) => item.session_id !== sessionId));
      setTotal((prev) => prev - 1);
    } catch (error) {
      alert("删除失败: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className={cn(PAGE_CLASS, "space-y-3")}>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-32 w-full rounded-[28px]" />
        {[...Array(5)].map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-[20px]" />
        ))}
      </div>
    );
  }

  const hasFilters = modeFilter !== "all" || topicFilter !== "all";
  const showTopicFilter = (modeFilter === "all" || modeFilter === "topic_drill") && topics.length > 0;
  const activeFilterCount = Number(modeFilter !== "all") + Number(topicFilter !== "all");

  return (
    <div className={PAGE_CLASS}>
      <Card className="overflow-hidden border-primary/15 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.11),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.97),rgba(255,248,235,0.9))] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.11),transparent_28%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(39,39,42,0.93))]">
        <CardContent className="p-4 md:p-5 xl:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <div className="text-3xl font-display font-bold tracking-tight md:text-4xl">历史记录</div>
                <div className="mt-1.5 max-w-3xl text-sm leading-6 text-dim">
                  把每次训练当作一个工作条目来筛选和回看，重点直接落在模式、领域、得分和时间，不再拆成松散的大卡片。
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <HistorySummaryChip label="总记录" value={total} hint="已完成" />
                <HistorySummaryChip label="当前列表" value={sessions.length} hint="已加载" />
                <HistorySummaryChip
                  label="筛选"
                  value={activeFilterCount}
                  hint={hasFilters ? "进行中" : "未启用"}
                />
              </div>
            </div>

            <div className="grid gap-4 border-t border-border/70 pt-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-dim/80">
                  <Filter size={13} />
                  模式筛选
                </div>
                <div className="flex flex-wrap gap-2">
                  {FILTER_OPTIONS.map((option) => (
                    <Button
                      key={option.key}
                      variant={modeFilter === option.key ? "secondary" : "ghost"}
                      size="sm"
                      className={cn(
                        "h-9 rounded-full px-4",
                        modeFilter === option.key && "border border-primary/40 bg-primary/10 text-text"
                      )}
                      onClick={() => handleModeChange(option.key)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {showTopicFilter && (
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/82 px-3 py-2.5 text-sm">
                    <span className="shrink-0 text-dim">领域</span>
                    <select
                      className="min-w-0 flex-1 bg-transparent text-right text-text outline-none"
                      value={topicFilter}
                      onChange={(event) => handleTopicChange(event.target.value)}
                    >
                      <option value="all">全部领域</option>
                      {topics.map((topic) => (
                        <option key={topic} value={topic}>{topic}</option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-border/80 bg-card/82 px-3 py-1.5 text-sm text-dim">
                    {buildFilterSummary(modeFilter, topicFilter)}
                  </div>
                  {hasFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3 text-dim hover:text-text"
                      onClick={() => {
                        setModeFilter("all");
                        setTopicFilter("all");
                      }}
                    >
                      清空筛选
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {sessions.length === 0 ? (
        <Card className="mt-5">
          <CardContent className="px-6 py-14 text-center text-dim">
            <p>{hasFilters ? "没有匹配的记录，试试调整筛选条件。" : "还没有面试记录，去首页开始一场面试吧。"}</p>
            {!hasFilters && (
              <Button variant="gradient" className="mt-5" onClick={() => navigate("/")}>
                去首页开始面试
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 border-b border-border/70 pb-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">复盘列表</div>
              {hasFilters && (
                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
                  已筛选
                </Badge>
              )}
            </div>
            <div className="text-sm text-dim tabular-nums">
              {isRefreshing ? (
                <span className="inline-flex items-center gap-1.5">
                  <LoaderCircle size={14} className="animate-spin" />
                  更新中
                </span>
              ) : (
                `显示 ${sessions.length} / ${total}`
              )}
            </div>
          </div>

          <div
            aria-busy={isRefreshing}
            className={cn(
              "mt-3 flex flex-col gap-2 transition-opacity duration-150",
              isRefreshing && "opacity-70"
            )}
          >
            {sessions.map((session) => (
              <HistoryRow
                key={session.session_id}
                session={session}
                onOpen={() => navigate(`/review/${session.session_id}`)}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {sessions.length < total && (
            <Button
              variant="outline"
              className="mt-4 w-full py-3"
              onClick={() => runHistoryQuery({ offset: sessions.length, reset: false })}
              disabled={loadingMore}
            >
              {loadingMore ? "加载中..." : `加载更多 (${sessions.length}/${total})`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function HistorySummaryChip({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/82 px-3.5 py-2.5 backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-dim/80">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-xl font-semibold tracking-tight text-primary tabular-nums">{value}</div>
        <div className="text-xs text-dim">{hint}</div>
      </div>
    </div>
  );
}

function HistoryRow({ session, onOpen, onDelete }) {
  const badge = MODE_BADGES[session.mode] || MODE_BADGES.resume;
  const title = session.meta?.position || session.topic || "综合";
  const subtitle = session.meta?.company || "";

  return (
    <Card
      className="group cursor-pointer rounded-[20px] border-border/75 bg-card/88 transition-colors hover:border-primary/30 hover:bg-card"
      onClick={onOpen}
    >
      <CardContent className="px-4 py-3 md:px-4 md:py-3.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={badge.variant}>{badge.text}</Badge>
              <div className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">{title}</div>
              <div className="hidden items-center gap-1.5 text-sm text-dim tabular-nums lg:inline-flex">
                <CalendarDays size={14} />
                {session.created_at?.slice(0, 10)}
              </div>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-dim">
              {subtitle && <span className="max-w-[460px] truncate">{subtitle}</span>}
              <span className="inline-flex items-center gap-1">
                <Hash size={12} />
                {session.session_id}
              </span>
              {session.topic && (
                <Badge
                  variant={session.mode === "topic_drill" ? "secondary" : "outline"}
                  className="rounded-full px-2.5 py-0.5 text-[11px]"
                >
                  {session.topic}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <div className="inline-flex items-center gap-1.5 text-sm text-dim tabular-nums lg:hidden">
              <CalendarDays size={14} />
              {session.created_at?.slice(0, 10)}
            </div>

            <div className="flex items-center gap-1">
              <ScorePill score={session.avg_score} />
              <button
                className="rounded-lg p-2 text-dim opacity-70 transition-colors hover:bg-red/8 hover:text-red hover:opacity-100"
                title="删除"
                onClick={(event) => onDelete(event, session.session_id)}
              >
                <Trash2 size={14} />
              </button>
              <div className="text-primary transition-transform group-hover:translate-x-0.5">
                <ChevronRight size={18} />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function buildFilterSummary(modeFilter, topicFilter) {
  const modeLabel = FILTER_OPTIONS.find((item) => item.key === modeFilter)?.label || "全部";
  if (topicFilter !== "all") return `${modeLabel} / ${topicFilter}`;
  return modeLabel;
}

function ScorePill({ score }) {
  if (score == null) {
    return (
      <Badge variant="secondary" className="min-w-[62px] justify-center rounded-full text-[13px]">
        --
      </Badge>
    );
  }

  let bg;
  let color;

  if (score >= 8) {
    bg = "rgba(34,197,94,0.15)";
    color = "var(--green)";
  } else if (score >= 6) {
    bg = "rgba(245,158,11,0.15)";
    color = "var(--ai-glow)";
  } else if (score >= 4) {
    bg = "rgba(253,203,110,0.2)";
    color = "#e2b93b";
  } else {
    bg = "rgba(239,68,68,0.15)";
    color = "var(--red)";
  }

  return (
    <Badge
      variant="outline"
      className="min-w-[72px] justify-center rounded-full px-3 font-semibold text-[13px]"
      style={{ background: bg, borderColor: "transparent", color }}
    >
      {score}/10
    </Badge>
  );
}
